// Inscription tolérante (numéro collé au format international, erreurs par champ)
// et navigation adaptée à l'écran (barre basse sur mobile, barre latérale sur PC).
import { test, expect } from '@playwright/test';
import { uniquePhone } from './helpers';

test('inscription : numéro +269 collé accepté, erreurs affichées sous les champs', async ({ page }) => {
  const d = uniquePhone();
  const name = `Colle${Date.now() % 10000}`;
  await page.goto('/register');
  await page.getByLabel('Pseudonyme').fill('Ali Said');
  await page.getByRole('button', { name: /Créer mon compte/ }).click();
  await expect(page.getByText(/pas d'espace/)).toBeVisible();
  await expect(page.getByText('Accepte les conditions pour continuer')).toBeVisible();

  await page.getByLabel('Numéro de téléphone').fill(`+269 ${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5)}`);
  await expect(page.getByLabel('Numéro de téléphone')).toHaveValue(`${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5)}`);
  await page.getByLabel('Pseudonyme').fill(name);
  await page.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123');
  await page.locator('label.checkbox').click();
  await page.getByRole('button', { name: /Créer mon compte/ }).click();
  await expect(page.locator('.home-greeting')).toContainText(name, { timeout: 15000 });
  await expect(page.locator('.bottom-nav')).toBeVisible();
  await expect(page.locator('.side-nav')).toBeHidden();

  // Même compte sur un écran d'ordinateur : barre latérale, pas de barre basse
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.side-nav')).toBeVisible();
  await expect(page.locator('.bottom-nav')).toBeHidden();
  await page.locator('.side-nav').getByRole('link', { name: 'Classement' }).click();
  await expect(page).toHaveURL(/\/rankings/);
});
