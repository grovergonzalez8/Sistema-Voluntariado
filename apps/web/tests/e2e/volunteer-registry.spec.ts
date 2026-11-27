import { randomInt, randomUUID } from 'node:crypto';

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import readXlsxFile from 'read-excel-file/node';

import {
  createVolunteerWorkbook,
  volunteerWorkbookHeaders,
} from './fixtures/volunteer-workbook';

const localPassword = 'local-test-only-not-a-secret';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(localPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/app\/profile$/u);
}

test.describe.serial('administrative volunteer registry', () => {
  test('administrator registers, searches and edits a volunteer', async ({
    page,
  }) => {
    const suffix = String(Date.now());
    const originalName = `Voluntaria E2E ${suffix}`;
    const updatedName = `Voluntaria E2E actualizada ${suffix}`;
    const email = `voluntaria-${suffix}@example.invalid`;
    await signIn(page, 'administrator@example.invalid');

    await page.getByRole('link', { name: 'Voluntarios' }).click();
    await expect(page).toHaveURL(/\/app\/admin\/volunteers$/u);
    await page
      .getByRole('link', { name: 'Registrar voluntario' })
      .first()
      .click();
    await page.getByLabel('Nombre completo').fill(originalName);
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Número de celular').fill(`+591 ${suffix.slice(-8)}`);
    await page.getByRole('button', { name: 'Guardar voluntario' }).click();

    await expect(page).toHaveURL(/\/app\/admin\/volunteers\/[0-9a-f-]+$/u);
    await expect(
      page.getByRole('heading', { name: originalName }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Voluntarios' }).click();
    await page.getByLabel('Buscar por nombre, correo o celular').fill(email);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByRole('cell', { name: originalName })).toBeVisible();
    await page.getByRole('link', { name: 'Ver detalle' }).click();
    await page.getByRole('link', { name: 'Editar' }).click();
    await page.getByLabel('Nombre completo').fill(updatedName);
    await page.getByRole('button', { name: 'Guardar voluntario' }).click();

    await expect(
      page.getByRole('heading', { name: updatedName }),
    ).toBeVisible();
  });

  test('coordinator cannot discover or open the registry', async ({ page }) => {
    await signIn(page, 'coordinator@example.invalid');
    await expect(page.getByRole('link', { name: 'Voluntarios' })).toHaveCount(
      0,
    );
    await page.goto('/app/admin/volunteers');
    await expect(
      page.getByRole('heading', { name: 'Acceso denegado' }),
    ).toBeVisible();
  });
});

async function openImport(page: Page): Promise<void> {
  await page
    .getByRole('link', { name: 'Importar Excel', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Importar voluntarios desde Excel' }),
  ).toBeVisible();
}

function importRow(page: Page, rowNumber: number) {
  return page.getByRole('article').filter({
    has: page.getByText(`Fila ${String(rowNumber)}`, { exact: true }),
  });
}

async function confirmImport(page: Page, count: number): Promise<void> {
  await page.getByRole('button', { name: 'Confirmar importación' }).click();
  const result = page.getByRole('status').filter({
    hasText: `Se importaron ${String(count)} voluntario(s).`,
  });
  await expect(result).toBeVisible();
  await result.getByRole('link', { name: 'Ver registro' }).click();
  await expect(page).toHaveURL(/\/app\/admin\/volunteers$/u);
}

async function searchRegistry(page: Page, query: string): Promise<void> {
  await page.getByLabel('Buscar por nombre, correo o celular').fill(query);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
}

function registryRows(page: Page) {
  return page
    .getByRole('table')
    .getByRole('row')
    .filter({
      has: page.getByRole('cell'),
    });
}

function registryRow(page: Page, name: string) {
  return registryRows(page).filter({
    has: page.getByRole('cell', { name, exact: true }),
  });
}

async function readDownload(
  page: Page,
  testInfo: TestInfo,
  button: string,
  fileName: string,
) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button, exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(fileName);
  const path = testInfo.outputPath(fileName);
  await download.saveAs(path);
  const sheets = await readXlsxFile(path);
  expect(sheets.map((sheet) => sheet.sheet)).toEqual(['Voluntarios']);
  return sheets[0]?.data;
}

test.describe('volunteer registry Excel', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'administrator@example.invalid');
    await page.getByRole('link', { name: 'Voluntarios', exact: true }).click();
    await openImport(page);
  });

  test('downloads the template, persists normalized rows and downloads the filtered registry', async ({
    page,
  }, testInfo) => {
    const batch = randomUUID();
    const selectedName = `Lina Bruma ${batch}`;
    const outsideName = `Nora Nube ${batch}`;
    const selectedEmail = `lina-${batch}@example.invalid`;
    const outsideEmail = `nora-${batch}@example.invalid`;
    const digits = String(randomInt(1_000_000_000, 10_000_000_000));
    const selectedPhone = `+000 0${digits}`;
    const outsidePhone = `+000 1${digits}`;

    const template = await readDownload(
      page,
      testInfo,
      'Descargar plantilla',
      'plantilla-voluntarios.xlsx',
    );
    expect(template).toEqual([volunteerWorkbookHeaders]);

    await page.getByLabel('Seleccionar libro').setInputFiles(
      await createVolunteerWorkbook([
        [
          `  Lina   Bruma ${batch}  `,
          ` ${selectedEmail.toUpperCase()} `,
          ` +000   0${digits} `,
        ],
        [outsideName, outsideEmail, outsidePhone],
      ]),
    );
    for (const [rowNumber, name] of [
      [2, selectedName],
      [3, outsideName],
    ] as const) {
      const row = importRow(page, rowNumber);
      await expect(row.getByText(name, { exact: true })).toBeVisible();
      await expect(row.getByText('Lista', { exact: true })).toBeVisible();
    }
    await confirmImport(page, 2);

    await searchRegistry(page, batch);
    await expect(
      page.getByText('2 resultado(s)', { exact: true }),
    ).toBeVisible();
    await expect(registryRows(page)).toHaveCount(2);
    await expect(
      registryRow(page, selectedName).getByRole('cell', {
        name: selectedEmail,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      registryRow(page, selectedName).getByRole('cell', {
        name: selectedPhone,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      registryRow(page, outsideName).getByRole('cell', {
        name: outsideEmail,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      registryRow(page, outsideName).getByRole('cell', {
        name: outsidePhone,
        exact: true,
      }),
    ).toBeVisible();

    await page.reload();
    await searchRegistry(page, batch);
    await expect(
      page.getByText('2 resultado(s)', { exact: true }),
    ).toBeVisible();
    await expect(registryRow(page, selectedName)).toBeVisible();
    await expect(registryRow(page, outsideName)).toBeVisible();

    await searchRegistry(page, selectedEmail);
    await expect(
      page.getByText('1 resultado(s)', { exact: true }),
    ).toBeVisible();
    await expect(registryRows(page)).toHaveCount(1);
    await expect(registryRow(page, outsideName)).toHaveCount(0);
    const displayedRow = registryRow(page, selectedName);
    await expect(
      displayedRow.getByRole('cell', { name: selectedEmail, exact: true }),
    ).toBeVisible();
    await expect(
      displayedRow.getByRole('cell', { name: selectedPhone, exact: true }),
    ).toBeVisible();
    const registeredAt = await displayedRow
      .locator('time')
      .getAttribute('datetime');
    expect(registeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);

    const exported = await readDownload(
      page,
      testInfo,
      'Exportar resultados actuales',
      'voluntarios.xlsx',
    );
    expect(exported).toEqual([
      [...volunteerWorkbookHeaders, 'Fecha de registro'],
      [selectedName, selectedEmail, selectedPhone, registeredAt],
    ]);
  });

  test('persists only ready rows and explicitly included duplicates from a mixed workbook', async ({
    page,
  }) => {
    const batch = randomUUID();
    const originalName = `Alma Alba ${batch}`;
    const readyName = `Ada Cielo ${batch}`;
    const confirmedName = `Alma Archivo ${batch}`;
    const declinedName = `Alma Alterna ${batch}`;
    const originalEmail = `alma-${batch}@example.invalid`;
    const digits = String(randomInt(1_000_000_000, 10_000_000_000));
    const originalPhone = `+000 2${digits}`;
    const fileInput = page.getByLabel('Seleccionar libro');

    await fileInput.setInputFiles(
      await createVolunteerWorkbook([
        [originalName, originalEmail, originalPhone],
      ]),
    );
    await expect(
      importRow(page, 2).getByText('Lista', { exact: true }),
    ).toBeVisible();
    await confirmImport(page, 1);
    await openImport(page);

    await fileInput.setInputFiles(
      await createVolunteerWorkbook([
        [readyName, `ada-${batch}@example.invalid`, null],
        [null, `invalida-${batch}@example.invalid`, null],
        [confirmedName, originalEmail.toUpperCase(), null],
        [declinedName, null, `+000 (2${digits})`],
      ]),
    );
    await expect(
      importRow(page, 2).getByText(readyName, { exact: true }),
    ).toBeVisible();
    await expect(
      importRow(page, 2).getByText('Lista', { exact: true }),
    ).toBeVisible();
    const invalidRow = importRow(page, 3);
    await expect(
      invalidRow.getByText('Escribe un nombre de 1 a 100 caracteres.'),
    ).toBeVisible();
    await expect(
      invalidRow.getByText('Excluida', { exact: true }),
    ).toBeVisible();
    await expect(invalidRow.getByRole('checkbox')).toHaveCount(0);

    const emailMatch = importRow(page, 4);
    await expect(
      emailMatch.getByText(confirmedName, { exact: true }),
    ).toBeVisible();
    await expect(
      emailMatch.getByText(
        `Coincidencia en el registro: ${originalName} (correo)`,
      ),
    ).toBeVisible();
    const includeEmailMatch = emailMatch.getByRole('checkbox', {
      name: 'Incluir este duplicado histórico',
    });
    await expect(includeEmailMatch).not.toBeChecked();
    await includeEmailMatch.check();

    const phoneMatch = importRow(page, 5);
    await expect(
      phoneMatch.getByText(declinedName, { exact: true }),
    ).toBeVisible();
    await expect(
      phoneMatch.getByText(
        `Coincidencia en el registro: ${originalName} (celular)`,
      ),
    ).toBeVisible();
    const includePhoneMatch = phoneMatch.getByRole('checkbox', {
      name: 'Incluir este duplicado histórico',
    });
    await expect(includePhoneMatch).not.toBeChecked();
    await includePhoneMatch.check();
    await includePhoneMatch.uncheck();
    await expect(includePhoneMatch).not.toBeChecked();
    await expect(includeEmailMatch).toBeChecked();
    await confirmImport(page, 2);

    await searchRegistry(page, batch);
    await expect(
      page.getByText('3 resultado(s)', { exact: true }),
    ).toBeVisible();
    await expect(registryRows(page)).toHaveCount(3);
    await expect(
      registryRow(page, originalName).getByRole('cell', {
        name: originalEmail,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      registryRow(page, originalName).getByRole('cell', {
        name: originalPhone,
        exact: true,
      }),
    ).toBeVisible();
    await expect(registryRow(page, readyName)).toBeVisible();
    await expect(
      registryRow(page, confirmedName).getByRole('cell', {
        name: originalEmail,
        exact: true,
      }),
    ).toBeVisible();
    await expect(registryRow(page, declinedName)).toHaveCount(0);
  });

  test('reports an invalid workbook and prevents confirming when no row is eligible', async ({
    page,
  }) => {
    const fileInput = page.getByLabel('Seleccionar libro');
    const confirm = page.getByRole('button', { name: 'Confirmar importación' });
    await fileInput.setInputFiles({
      buffer: Buffer.from('Contenido sintético sin formato ZIP'),
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      name: 'estructura-invalida.xlsx',
    });
    await expect(page.getByRole('alert')).toHaveText(
      'El archivo Excel contiene una estructura no admitida.',
    );
    await expect(confirm).toHaveCount(0);

    await fileInput.setInputFiles(
      await createVolunteerWorkbook(
        [['Vera Bruma', 'vera@example.invalid']],
        ['Nombre completo', 'Correo'],
      ),
    );
    await expect(page.getByRole('alert')).toHaveText(
      'La primera fila debe contener: Nombre completo, Correo, Celular.',
    );
    await expect(confirm).toHaveCount(0);

    await fileInput.setInputFiles(
      await createVolunteerWorkbook([[null, 'correo-invalido', null]]),
    );
    const row = importRow(page, 2);
    await expect(
      row.getByText('Escribe un nombre de 1 a 100 caracteres.'),
    ).toBeVisible();
    await expect(
      row.getByText('Escribe un correo válido o deja el campo vacío.'),
    ).toBeVisible();
    await expect(row.getByText('Excluida', { exact: true })).toBeVisible();
    await expect(confirm).toBeDisabled();
  });
});
