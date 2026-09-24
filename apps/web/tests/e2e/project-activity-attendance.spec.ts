import { expect, test, type Page } from '@playwright/test';

const localPassword = 'local-test-only-not-a-secret';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page
    .getByLabel('Correo electrónico')
    .fill('administrator@example.invalid');
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

async function createProject(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { exact: true, name: 'Proyectos' }).click();
  await page.getByRole('link', { name: 'Crear proyecto' }).click();
  await page.locator('input[name="projectName"]').fill(name);
  await page.getByRole('button', { name: 'Guardar proyecto' }).click();
  await expect(page).toHaveURL(/\/app\/admin\/projects\/[0-9a-f-]+$/u);
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

async function createActivity(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Crear actividad' }).click();
  await page.getByLabel('Nombre de la actividad').fill(name);
  await page.getByLabel('Inicio').fill('2027-09-10T10:00');
  await page.getByRole('button', { name: 'Guardar actividad' }).click();
  await expect(page.getByText('Actividad guardada.')).toBeVisible();
}

async function openParticipants(page: Page, activityName: string) {
  const activityRow = page.getByRole('row', {
    name: new RegExp(activityName, 'u'),
  });
  await activityRow.getByRole('button', { name: 'Participantes' }).click();
  await expect(
    page.getByRole('heading', { name: `Participantes — ${activityName}` }),
  ).toBeVisible();
  return activityRow;
}

test('records, corrects and reloads completed activity attendance', async ({
  page,
}) => {
  const suffix = String(Date.now());
  const volunteerName = `Asistencia Canonica ${suffix}`;
  const activityName = `Jornada Asistencia ${suffix}`;

  await signIn(page);
  await createVolunteer(page, volunteerName);
  await createProject(page, `Proyecto Asistencia ${suffix}`);
  await assignVolunteer(page, volunteerName);
  await createActivity(page, activityName);
  const activityRow = await openParticipants(page, activityName);

  const search = page.getByLabel('Buscar voluntario asignado por nombre');
  await search.fill(volunteerName);
  await search
    .locator('xpath=ancestor::form')
    .getByRole('button', { name: 'Buscar' })
    .click();
  await page.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByText('Participante agregado.')).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await activityRow.getByRole('button', { name: 'Completar' }).click();
  await expect(page.getByText('Actividad completada.')).toBeVisible();

  const participantSection = page
    .getByRole('heading', { name: `Participantes — ${activityName}` })
    .locator('xpath=..');
  const participantRow = participantSection.getByRole('row', {
    name: new RegExp(volunteerName, 'u'),
  });
  await expect(participantRow.getByText('Sin registrar')).toBeVisible();
  await participantRow.getByRole('button', { name: 'Marcar Presente' }).click();
  await expect(participantRow.getByText('Presente')).toBeVisible();
  await participantRow
    .getByRole('button', { name: 'Corregir a Ausente' })
    .click();
  await expect(participantRow.getByText('Ausente')).toBeVisible();

  await page.reload();
  await openParticipants(page, activityName);
  const reloadedSection = page
    .getByRole('heading', { name: `Participantes — ${activityName}` })
    .locator('xpath=..');
  const reloadedRow = reloadedSection.getByRole('row', {
    name: new RegExp(volunteerName, 'u'),
  });
  await expect(reloadedRow.getByText('Ausente')).toBeVisible();
});
