import { expect, test } from '@playwright/test';

const localPassword = 'local-test-only-not-a-secret';

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
  await page.getByLabel('Contraseña').fill(localPassword);
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

test('keeps the authenticated shell within mobile viewports', async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/login');
  await page
    .getByLabel('Correo electrónico')
    .fill('administrator@example.invalid');
  await page.getByLabel('Contraseña').fill(localPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/app\/profile$/u);

  const header = page.locator('.app-header');
  const signOut = page.getByRole('button', { name: 'Cerrar sesión' });
  await expect(header).toBeVisible();
  await expect(signOut).toBeInViewport();

  const hasGlobalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(hasGlobalOverflow).toBe(false);

  const navigation = page.getByRole('navigation', {
    name: 'Navegación principal',
  });
  const navigationLinks = navigation.getByRole('link');
  const linkCount = await navigationLinks.count();
  for (let index = 0; index < linkCount; index += 1) {
    const link = navigationLinks.nth(index);
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeInViewport();
    const height = await link.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    expect(height).toBeGreaterThanOrEqual(44);
  }

  await page.goto('/app/admin/volunteers');
  const activeVolunteerLink = navigation.getByRole('link', {
    name: 'Voluntarios',
  });
  await expect(activeVolunteerLink).toBeInViewport();
  await activeVolunteerLink.focus();
  const focusOutline = await activeVolunteerLink.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(focusOutline.style).not.toBe('none');
  expect(Number.parseFloat(focusOutline.width)).toBeGreaterThanOrEqual(3);

  await page.setViewportSize({ height: 844, width: 440 });
  await page.goto('/app/admin/invitations');
  await expect(signOut).toBeInViewport();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);

  await page.goto('/app/admin/projects');
  const projectHeading = page.getByRole('heading', { level: 1 });
  await projectHeading.evaluate((element) => {
    element.classList.add('dynamic-title');
    element.textContent =
      'Proyecto comunitario interinstitucional con un nombre extraordinariamente largo y SupercalifragilisticoSinSeparadoresParaValidarEnvoltura';
  });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
});
