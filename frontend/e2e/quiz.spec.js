// Le quiz historique « Swipe & gagne » est masqué par défaut ; le back-office peut
// le rendre visible, et il reste alors jouable avec un compte Défi Yas.
// Identifiants admin de la base de test : E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
import { test, expect } from '@playwright/test';
import { registerViaUi } from './helpers';

const ADMIN = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };

async function setQuizVisible(browser, visible) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/admin/login');
  await page.locator('input[type=email]').fill(ADMIN.email);
  await page.locator('input[type=password]').fill(ADMIN.password);
  await page.locator('form button').first().click();
  await expect(page).not.toHaveURL(/login/, { timeout: 15000 });
  await page.goto('/admin/settings');
  const box = page.getByLabel('Visible pour les joueurs');
  await expect(box).toBeEnabled({ timeout: 10000 });
  if ((await box.isChecked()) !== visible) await box.click();
  await expect(box).toBeChecked({ checked: visible });
  await ctx.close();
}

test('Swipe & gagne masqué : aucune entrée, accès direct renvoyé à l\'accueil', async ({ page }) => {
  await registerViaUi(page, `Cache${Date.now() % 10000}`);
  await expect(page.getByRole('heading', { name: 'Plus de Défi Yas' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Swipe & gagne' })).toHaveCount(0);
  await page.goto('/games');
  await expect(page.getByText('Inscris-toi et affronte les meilleurs')).toBeVisible();
  await expect(page.getByText('Swipe & gagne')).toHaveCount(0);
  await page.goto('/quiz');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.home-greeting')).toBeVisible();
});

test('quiz Swipe & gagne activé depuis le back-office : démarrage et réponse validée par le serveur', async ({ page, browser }) => {
  test.skip(!ADMIN.email || !ADMIN.password, 'identifiants admin de test non fournis');
  await setQuizVisible(browser, true);
  try {
    await registerViaUi(page, `Quiz${Date.now() % 10000}`);
    await expect(page.getByRole('link', { name: 'Swipe & gagne' })).toBeVisible();
    await page.goto('/quiz');
    await page.getByRole('button', { name: 'Jouer' }).click();
    await expect(page).toHaveURL(/\/quiz\/play$/);
    await expect(page.getByText('Question 1/15')).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/✅|❌/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Question 2/15')).toBeVisible({ timeout: 5000 });
  } finally {
    await setQuizVisible(browser, false);
  }
});
