import { expect, test, type Page } from '@playwright/test';

const localPassword = 'local-test-only-not-a-secret';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(localPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/app\/profile$/u);
}

async function createVolunteer(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: 'Voluntarios' }).click();
  await page
    .getByRole('link', { name: 'Registrar voluntario' })
    .first()
    .click();
  await page.getByLabel('Nombre completo').fill(name);
  await page.getByRole('button', { name: 'Guardar voluntario' }).click();
  await expect(page).toHaveURL(/\/app\/admin\/volunteers\/[0-9a-f-]+$/u);
}

async function createProject(page: Page, name: string): Promise<string> {
  await page.getByRole('link', { exact: true, name: 'Proyectos' }).click();
  await page.getByRole('link', { name: 'Crear proyecto' }).click();
  await page.locator('input[name="projectName"]').fill(name);
  await page.getByRole('button', { name: 'Guardar proyecto' }).click();
  await expect(page).toHaveURL(/\/app\/admin\/projects\/[0-9a-f-]+$/u);
  return page.url();
}

async function assignVolunteer(page: Page, name: string): Promise<void> {
  const search = page.getByLabel('Buscar voluntario por nombre');
  await search.fill(name);
  await search
    .locator('xpath=ancestor::form')
    .getByRole('button', { name: 'Buscar' })
    .click();
  await page.getByRole('button', { name: 'Asignar' }).click();
  await expect(page.getByText('Voluntario asignado.')).toBeVisible();
}

async function createActivity(
  page: Page,
  name: string,
  startsAt: string,
): Promise<void> {
  await page.getByRole('button', { name: 'Crear actividad' }).click();
  await page.getByLabel('Nombre de la actividad').fill(name);
  await page.getByLabel('Inicio').fill(startsAt);
  await page.getByRole('button', { name: 'Guardar actividad' }).click();
  await expect(page.getByText('Actividad guardada.')).toBeVisible();
}

async function openParticipants(page: Page, activityName: string) {
  const row = page.getByRole('row', {
    name: new RegExp(activityName, 'u'),
  });
  await row.getByRole('button', { name: 'Participantes' }).click();
  await expect(
    page.getByRole('heading', {
      name: `Participantes — ${activityName}`,
    }),
  ).toBeVisible();
  return row;
}

async function addParticipant(
  page: Page,
  volunteerName: string,
): Promise<void> {
  const search = page.getByLabel('Buscar voluntario asignado por nombre');
  await search.fill(volunteerName);
  await search
    .locator('xpath=ancestor::form')
    .getByRole('button', { name: 'Buscar' })
    .click();
  await page.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByText('Participante agregado.')).toBeVisible();
  await expect(page.getByRole('cell', { name: /Actual/u })).toBeVisible();
}

async function finishParticipant(page: Page): Promise<void> {
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Finalizar participación' }).click();
  await expect(page.getByText('Participación finalizada.')).toBeVisible();
}

test.describe.serial('activity participation v1', () => {
  test('administrator adds, verifies and finishes historical participation', async ({
    page,
  }) => {
    const suffix = String(Date.now());
    const volunteerName = `Participante Activity ${suffix}`;
    const activityName = `Jornada Participation ${suffix}`;
    await signIn(page, 'administrator@example.invalid');
    await createVolunteer(page, volunteerName);
    await createProject(page, `Proyecto Participation ${suffix}`);
    await assignVolunteer(page, volunteerName);
    await createActivity(page, activityName, '2027-09-02T10:00');
    await openParticipants(page, activityName);
    await addParticipant(page, volunteerName);

    await finishParticipant(page);
    await expect(
      page.getByRole('button', { name: 'Finalizar participación' }),
    ).toHaveCount(0);
    const participantSection = page
      .getByRole('heading', { name: `Participantes — ${activityName}` })
      .locator('xpath=..');
    const participantRow = participantSection.getByRole('row', {
      name: new RegExp(volunteerName, 'u'),
    });
    await expect(participantRow.getByRole('cell').nth(2)).toContainText(/\d/u);
    await expect(participantRow.getByRole('cell').nth(2)).not.toContainText(
      'Actual',
    );
  });

  test('assignment guard requires resolving scheduled participation first', async ({
    page,
  }) => {
    const suffix = String(Date.now());
    const volunteerName = `Participante Guard ${suffix}`;
    const activityName = `Jornada Guard ${suffix}`;
    await signIn(page, 'administrator@example.invalid');
    await createVolunteer(page, volunteerName);
    await createProject(page, `Proyecto Guard Participation ${suffix}`);
    await assignVolunteer(page, volunteerName);
    await createActivity(page, activityName, '2027-09-03T10:00');
    await openParticipants(page, activityName);
    await addParticipant(page, volunteerName);

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Finalizar asignación' }).click();
    await expect(
      page.getByText(
        'Finaliza primero las participaciones activas en actividades programadas.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Activa' })).toBeVisible();

    await finishParticipant(page);
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Finalizar asignación' }).click();
    await expect(page.getByText('Asignación finalizada.')).toBeVisible();
  });

  test('scoped manager manages participation only in the assigned project', async ({
    page,
  }) => {
    const suffix = String(Date.now());
    const volunteerName = `Participante Manager ${suffix}`;
    const scopedProjectName = `Proyecto Manager Participation ${suffix}`;
    const foreignProjectName = `Proyecto Foreign Participation ${suffix}`;
    const activityName = `Jornada Manager Participation ${suffix}`;
    await signIn(page, 'administrator@example.invalid');
    await createVolunteer(page, volunteerName);
    const foreignUrl = await createProject(page, foreignProjectName);
    const scopedUrl = await createProject(page, scopedProjectName);
    await assignVolunteer(page, volunteerName);
    await createActivity(page, activityName, '2027-09-04T10:00');
    const managerSearch = page.getByLabel(
      'Buscar responsable de proyecto por nombre',
    );
    await managerSearch.fill('Project Manager Fixture');
    await managerSearch
      .locator('xpath=ancestor::form')
      .getByRole('button', { name: 'Buscar' })
      .click();
    await page.getByRole('button', { name: 'Asignar responsable' }).click();

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await signIn(page, 'project-manager@example.invalid');
    await page.goto(scopedUrl);
    await openParticipants(page, activityName);
    await addParticipant(page, volunteerName);
    await finishParticipant(page);

    await page.goto(foreignUrl);
    await expect(
      page.getByText(
        'No tienes permiso para realizar esta operación de proyectos.',
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: foreignProjectName }),
    ).toHaveCount(0);
  });

  test('completed, cancelled and closed contexts keep unended history read-only', async ({
    page,
  }) => {
    const suffix = String(Date.now());
    const volunteerName = `Participante Terminal ${suffix}`;
    const completedName = `Jornada Completed Participation ${suffix}`;
    const cancelledName = `Jornada Cancelled Participation ${suffix}`;
    await signIn(page, 'administrator@example.invalid');
    await createVolunteer(page, volunteerName);
    await createProject(page, `Proyecto Terminal Participation ${suffix}`);
    await assignVolunteer(page, volunteerName);

    await createActivity(page, completedName, '2027-09-05T10:00');
    let row = await openParticipants(page, completedName);
    await addParticipant(page, volunteerName);
    page.once('dialog', (dialog) => void dialog.accept());
    await row.getByRole('button', { name: 'Completar' }).click();
    await expect(page.getByText('Actividad completada.')).toBeVisible();
    await expect(
      page.getByText('Histórica; no finalizada explícitamente'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Finalizar participación' }),
    ).toHaveCount(0);

    await createActivity(page, cancelledName, '2027-09-06T10:00');
    row = await openParticipants(page, cancelledName);
    await addParticipant(page, volunteerName);
    page.once('dialog', (dialog) => void dialog.accept());
    await row.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText('Actividad cancelada.')).toBeVisible();
    await expect(
      page.getByText('Histórica; no finalizada explícitamente'),
    ).toBeVisible();

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Finalizar asignación' }).click();
    await expect(page.getByText('Asignación finalizada.')).toBeVisible();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Cerrar proyecto' }).click();
    await expect(page.getByText('Proyecto cerrado.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Finalizar participación' }),
    ).toHaveCount(0);
  });
});
