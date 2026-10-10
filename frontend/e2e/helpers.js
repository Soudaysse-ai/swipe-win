import { expect } from '@playwright/test';

let n = 0;
export function uniquePhone() {
  n += 1;
  return `4${String((Date.now() % 100000) * 10 + n).padStart(6, '0').slice(-6)}`;
}

// Crée un compte depuis l'interface (écran d'inscription réel).
export async function registerViaUi(page, username) {
  const phone = uniquePhone();
  await page.goto('/register');
  await page.getByLabel('Numéro de téléphone').fill(phone);
  await page.getByLabel('Pseudonyme').fill(username);
  await page.getByLabel('Mot de passe').fill('motdepasse123');
  await page.locator('label.checkbox').click();
  await page.getByRole('button', { name: /Créer mon compte/ }).click();
  await expect(page.getByText(`Salut ${username}`)).toBeVisible({ timeout: 15000 });
  return phone;
}
