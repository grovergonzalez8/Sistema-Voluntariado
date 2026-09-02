import { expect, test, type Page } from '@playwright/test';

const localPassword = 'local-test-only-not-a-secret';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(localPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/app\/profile$/u);
}

async function createProject(page: Page, name: string): Promise<string> {
  await page.getByRole('link', { exact: true, name: 'Proyectos' }).click();
  await page.getByRole('link', { name: 'Crear proyecto' }).click();
  await page.locator('input[name="projectName"]').fill(name);
  await page.getByRole('button', { name: 'Guardar proyecto' }).click();
  await expect(page).toHaveURL(/\/app\/admin\/projects\/[0-9a-f-]+$/u);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  return page.url();
}

async function createActivity(
  page: Page,
  name: string,
  startsAt = '2027-08-27T10:00',
): Promise<void> {
  await page.getByRole('button', { name: 'Crear actividad' }).click();
  await page.getByLabel('Nombre de la actividad').fill(name);
  await page.getByLabel('Inicio').fill(startsAt);
  await page
    .getByLabel('Fin (opcional)')
    .fill(`${startsAt.slice(0, 10)}T12:00`);
  await page.getByLabel('Ubicación (opcional)').fill('Sede E2E');
  await page.getByRole('button', { name: 'Guardar actividad' }).click();
  await expect(page.getByText('Actividad guardada.')).toBeVisible();
  await expect(page.getByRole('cell', { name })).toBeVisible();
}

test.describe.serial('project activities v1', () => {
  test('administrator creates, edits, terminalizes and keeps closed history', async ({
    page,
  }) => {
    const suffix = String(Date.now());
    const projectName = `Proyecto Activities Admin ${suffix}`;
    const firstName = `Actividad Completar ${suffix}`;
    const editedName = `${firstName} Editada`;
    const secondName = `Actividad Cancelar ${suffix}`;
    await signIn(page, 'administrator@example.invalid');
    await createProject(page, projectName);

    await createActivity(page, firstName);
    let row = page.getByRole('row', { name: new RegExp(firstName, 'u') });
    await row.getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Nombre de la actividad').fill(editedName);
    await page.getByLabel('Descripción (opcional)').fill('Descripción E2E');
    await page.getByRole('button', { name: 'Guardar actividad' }).click();
    await expect(page.getByRole('cell', { name: editedName })).toBeVisible();

    row = page.getByRole('row', { name: new RegExp(editedName, 'u') });
    page.once('dialog', (dialog) => void dialog.accept());
    await row.getByRole('button', { name: 'Completar' }).click();
    await expect(page.getByText('Actividad completada.')).toBeVisible();
    await expect(
      page
        .getByRole('row', { name: new RegExp(editedName, 'u') })
        .getByText('Histórico de solo lectura'),
    ).toBeVisible();

    await createActivity(page, secondName, '2027-08-28T10:00');
    row = page.getByRole('row', { name: new RegExp(secondName, 'u') });
    page.once('dialog', (dialog) => void dialog.accept());
    await row.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText('Actividad cancelada.')).toBeVisible();

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Cerrar proyecto' }).click();
    await expect(page.getByText('Proyecto cerrado.')).toBeVisible();
    await expect(page.getByText('Cerrado', { exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: editedName })).toBeVisible();
    await expect(page.getByRole('cell', { name: secondName })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Crear actividad' }),
    ).toHaveCount(0);
  });

  test('scheduled activity exposes a clear close guard and project stays active', async ({
    page,
  }) => {
    const suffix = String(Date.now());
    const projectName = `Proyecto Guard Activities ${suffix}`;
    const activityName = `Actividad Guard ${suffix}`;
    await signIn(page, 'administrator@example.invalid');
    await createProject(page, projectName);
    await createActivity(page, activityName);

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Cerrar proyecto' }).click();
    await expect(
      page.getByText(
        'Completa o cancela todas las actividades programadas antes de cerrar el proyecto.',
      ),
    ).toBeVisible();
    await expect(page.getByText('Activo', { exact: true })).toBeVisible();

    const row = page.getByRole('row', { name: new RegExp(activityName, 'u') });
    page.once('dialog', (dialog) => void dialog.accept());
    await row.getByRole('button', { name: 'Completar' }).click();
    await expect(page.getByText('Actividad completada.')).toBeVisible();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Cerrar proyecto' }).click();
    await expect(page.getByText('Proyecto cerrado.')).toBeVisible();
  });

  test('scoped manager manages assigned project activities but not foreign projects', async ({
    page,
  }) => {
    const suffix = String(Date.now());
    const assignedName = `Proyecto Manager Activities ${suffix}`;
    const foreignName = `Proyecto Foreign Activities ${suffix}`;
    const activityName = `Actividad Manager ${suffix}`;
    await signIn(page, 'administrator@example.invalid');
    const foreignUrl = await createProject(page, foreignName);
    const assignedUrl = await createProject(page, assignedName);
    const managerSearch = page.getByLabel(
      'Buscar responsable de proyecto por nombre',
    );
    await managerSearch.fill('Project Manager Fixture');
    await managerSearch
      .locator('xpath=ancestor::form')
      .getByRole('button', { name: 'Buscar' })
      .click();
    await page.getByRole('button', { name: 'Asignar responsable' }).click();
    await expect(
      page.getByText('Responsable de proyecto asignado.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await signIn(page, 'project-manager@example.invalid');
    await page.getByRole('link', { exact: true, name: 'Proyectos' }).click();
    await expect(page.getByRole('cell', { name: assignedName })).toBeVisible();
    await expect(page.getByRole('cell', { name: foreignName })).toHaveCount(0);
    await page.goto(foreignUrl);
    await expect(
      page.getByText(
        'No tienes permiso para realizar esta operación de proyectos.',
      ),
    ).toBeVisible();
    await page.goto(assignedUrl);
    await expect(
      page.getByRole('button', { name: 'Cerrar proyecto' }),
    ).toHaveCount(0);

    await createActivity(page, activityName);
    let row = page.getByRole('row', { name: new RegExp(activityName, 'u') });
    await row.getByRole('button', { name: 'Editar' }).click();
    await page
      .getByLabel('Nombre de la actividad')
      .fill(`${activityName} Editada`);
    await page.getByRole('button', { name: 'Guardar actividad' }).click();
    row = page.getByRole('row', {
      name: new RegExp(`${activityName} Editada`, 'u'),
    });
    page.once('dialog', (dialog) => void dialog.accept());
    await row.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText('Actividad cancelada.')).toBeVisible();
  });

  test('manager with retained scope sees closed activity history without mutations', async ({
    page,
  }) => {
    const suffix = String(Date.now());
    const projectName = `Proyecto Closed Activity Scope ${suffix}`;
    const activityName = `Actividad Histórica ${suffix}`;
    await signIn(page, 'administrator@example.invalid');
    const projectUrl = await createProject(page, projectName);
    await createActivity(page, activityName);
    let row = page.getByRole('row', { name: new RegExp(activityName, 'u') });
    page.once('dialog', (dialog) => void dialog.accept());
    await row.getByRole('button', { name: 'Completar' }).click();
    await expect(page.getByText('Actividad completada.')).toBeVisible();

    const managerSearch = page.getByLabel(
      'Buscar responsable de proyecto por nombre',
    );
    await managerSearch.fill('Project Manager Fixture');
    await managerSearch
      .locator('xpath=ancestor::form')
      .getByRole('button', { name: 'Buscar' })
      .click();
    await page.getByRole('button', { name: 'Asignar responsable' }).click();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Cerrar proyecto' }).click();
    await expect(page.getByText('Proyecto cerrado.')).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await signIn(page, 'project-manager@example.invalid');
    await page.goto(projectUrl);
    await expect(page.getByRole('cell', { name: activityName })).toBeVisible();
    row = page.getByRole('row', { name: new RegExp(activityName, 'u') });
    await expect(row.getByText('Histórico de solo lectura')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Crear actividad' }),
    ).toHaveCount(0);
    await expect(
      row.getByRole('button', { name: 'Participantes' }),
    ).toBeVisible();
    await expect(row.getByRole('button', { name: 'Editar' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Completar' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Cancelar' })).toHaveCount(0);
  });
});
