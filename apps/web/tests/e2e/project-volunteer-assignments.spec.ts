import { fileURLToPath, URL } from 'node:url';

import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

import type { Database } from '../../src/shared/infrastructure/supabase/database.types';

const localPassword = 'local-test-only-not-a-secret';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(localPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/app\/profile$/u);
}

test.describe.serial('project volunteer assignments v1', () => {
  test('administrator creates a project, assigns and finishes a registry volunteer, then closes it', async ({
    page,
  }) => {
    const suffix = String(Date.now());
    const volunteerName = `Participante Proyecto ${suffix}`;
    const projectName = `Proyecto E2E ${suffix}`;
    await signIn(page, 'administrator@example.invalid');

    await page.getByRole('link', { name: 'Voluntarios' }).click();
    await page
      .getByRole('link', { name: 'Registrar voluntario' })
      .first()
      .click();
    await page.getByLabel('Nombre completo').fill(volunteerName);
    await page.getByRole('button', { name: 'Guardar voluntario' }).click();
    await expect(page).toHaveURL(/\/app\/admin\/volunteers\/[0-9a-f-]+$/u);
    const volunteerUrl = page.url();

    await page.getByRole('link', { exact: true, name: 'Proyectos' }).click();
    await page.getByRole('link', { name: 'Crear proyecto' }).click();
    const projectNameInput = page.locator('input[name="projectName"]');
    await projectNameInput.fill(projectName);
    await expect(projectNameInput).toHaveValue(projectName);
    await page
      .getByLabel('Descripción (opcional)')
      .fill('Recorrido administrativo E2E');
    await expect(projectNameInput).toHaveValue(projectName);
    await page.getByRole('button', { name: 'Guardar proyecto' }).click();
    await expect(page).toHaveURL(/\/app\/admin\/projects\/[0-9a-f-]+$/u);
    await expect(
      page.getByRole('heading', { name: projectName }),
    ).toBeVisible();

    await page.getByLabel('Buscar voluntario por nombre').fill(volunteerName);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText(volunteerName)).toBeVisible();
    await page.getByRole('button', { name: 'Asignar' }).click();
    await expect(page.getByText('Voluntario asignado.')).toBeVisible();
    await expect(page.getByRole('cell', { name: volunteerName })).toBeVisible();

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Finalizar asignación' }).click();
    await expect(page.getByText('Asignación finalizada.')).toBeVisible();
    await expect(page.getByText('Histórica')).toBeVisible();

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Cerrar proyecto' }).click();
    await expect(page.getByText('Proyecto cerrado.')).toBeVisible();
    await expect(page.getByText('Cerrado')).toBeVisible();

    await page.goto(volunteerUrl);
    await page.getByRole('link', { name: 'Proyectos asociados' }).click();
    await expect(page.getByRole('cell', { name: projectName })).toBeVisible();
  });

  test('coordinator cannot discover or open project administration', async ({
    page,
  }) => {
    await signIn(page, 'coordinator@example.invalid');
    await expect(page.getByRole('link', { name: 'Proyectos' })).toHaveCount(0);
    await page.goto('/app/admin/projects');
    await expect(
      page.getByRole('heading', { name: 'Acceso denegado' }),
    ).toBeVisible();
  });

  test('concurrent RPC calls preserve one active assignment', async () => {
    const workspaceRoot = fileURLToPath(
      new URL('../../../..', import.meta.url),
    );
    const environment = loadEnv('development', workspaceRoot, '');
    const supabaseUrl =
      process.env['VITE_SUPABASE_URL'] ?? environment['VITE_SUPABASE_URL'];
    const anonKey =
      process.env['VITE_SUPABASE_ANON_KEY'] ??
      environment['VITE_SUPABASE_ANON_KEY'];
    if (!supabaseUrl || !anonKey)
      throw new Error('Local Supabase E2E environment is required.');
    const client = createClient<Database>(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });
    const signedIn = await client.auth.signInWithPassword({
      email: 'administrator@example.invalid',
      password: localPassword,
    });
    expect(signedIn.error).toBeNull();
    const suffix = String(Date.now());
    const volunteer = await client.rpc('create_volunteer', {
      accept_potential_duplicate: false,
      requested_email: null,
      requested_full_name: `Concurrente ${suffix}`,
      requested_phone: null,
    });
    const project = await client.rpc('create_project', {
      requested_description: null,
      requested_name: `Proyecto Concurrente ${suffix}`,
    });
    expect(volunteer.error).toBeNull();
    expect(project.error).toBeNull();
    const volunteerId = volunteer.data?.[0]?.id;
    const projectId = project.data?.[0]?.id;
    if (!volunteerId || !projectId)
      throw new Error('Concurrent fixtures were not created.');

    const results = await Promise.all([
      client.rpc('assign_volunteer_to_project', {
        requested_project_id: projectId,
        requested_volunteer_id: volunteerId,
      }),
      client.rpc('assign_volunteer_to_project', {
        requested_project_id: projectId,
        requested_volunteer_id: volunteerId,
      }),
    ]);
    expect(results.filter((result) => result.error === null)).toHaveLength(1);
    expect(
      results.filter(
        (result) => result.error?.message === 'assignment_already_active',
      ),
    ).toHaveLength(1);
    const assignments = await client.rpc('list_project_assignments', {
      requested_project_id: projectId,
    });
    expect(assignments.error).toBeNull();
    expect(
      assignments.data?.filter((assignment) => assignment.ended_at === null),
    ).toHaveLength(1);
  });
});
