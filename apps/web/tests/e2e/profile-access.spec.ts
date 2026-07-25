import { expect, test } from '@playwright/test';

test('shows public access and protects the profile route', async ({ page }) => {
  await page.goto('/login');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Bienvenido de nuevo' }),
  ).toBeVisible();

  await page.goto('/app/profile');
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole('button', { name: 'Iniciar sesión' }),
  ).toBeVisible();
});

test('an authenticated local user reads and updates their own profile', async ({
  page,
}) => {
  await page.goto('/login');
  await page
    .getByLabel('Correo electrónico')
    .fill('volunteer-a@example.invalid');
  await page.getByLabel('Contraseña').fill('local-test-only-not-a-secret');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(
    page.getByRole('heading', { name: /Mi perfil|My profile/ }),
  ).toBeVisible();

  const updatedName = `Perfil E2E ${String(Date.now())}`;
  await page.locator('#displayName').fill(updatedName);
  await page.locator('#preferred-locale').selectOption('es');
  await page.locator('form button[type="submit"]').click();

  await expect(page.getByText('Perfil actualizado.')).toBeVisible();
  await page.locator('#preferred-locale').selectOption('en');
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByText('Profile updated.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Display name')).toHaveValue(updatedName);
  await expect(page.getByLabel('Preferred language')).toHaveValue('en');
});
