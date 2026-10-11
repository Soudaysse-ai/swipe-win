import { expect } from '@playwright/test';

let n = 0;
export function uniquePhone() {
  n += 1;
  return `4${String((Date.now() % 100000) * 10 + n).padStart(6, '0').slice(-6)}`;
}

// Crée un compte depuis l'interface (écran d'inscription réel).
export async function registerViaUi(page, username, { email } = {}) {
  const phone = uniquePhone();
  await page.goto('/register');
  await page.getByLabel('Numéro de téléphone').fill(phone);
  if (email) await page.getByLabel(/^E-mail/).fill(email);
  await page.getByLabel('Pseudonyme').fill(username);
  await page.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123');
  await page.locator('label.checkbox').click();
  await page.getByRole('button', { name: /Créer mon compte/ }).click();
  await expect(page.locator('.home-greeting')).toContainText(username, { timeout: 15000 });
  return phone;
}

// Deux joueurs dans un salon privé du jeu, tous deux prêts → écran de partie.
export async function startDuel(browser, gameId) {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const tag = Date.now() % 10000;
  await registerViaUi(a, `A${gameId}${tag}`);
  await registerViaUi(b, `B${gameId}${tag}`);
  await a.goto(`/games/${gameId}`);
  await a.getByRole('button', { name: /Salon privé/ }).click();
  await expect(a).toHaveURL(/\/room$/);
  const code = (await a.locator('.code-box').textContent()).trim();
  await b.goto(`/games/${gameId}`);
  await b.getByLabel('Code du salon').fill(code.slice(4));
  await b.getByRole('button', { name: 'Rejoindre', exact: true }).click();
  await expect(b).toHaveURL(/\/room$/);
  await a.getByRole('button', { name: /Je suis prêt/ }).click();
  await b.getByRole('button', { name: /Je suis prêt/ }).click();
  if (gameId === 'ludo' || gameId === 'cards') {
    await a.getByRole('button', { name: /Lancer la partie/ }).click();
  }
  await expect(a).toHaveURL(/\/match\//, { timeout: 10000 });
  await expect(b).toHaveURL(/\/match\//, { timeout: 10000 });
  return { a, b, close: async () => { await ctxA.close(); await ctxB.close(); } };
}
