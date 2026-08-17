import { expect, test, type Page } from '@playwright/test';

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
    await page.getByLabel('Número de celular').fill('+591 070000004');
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
