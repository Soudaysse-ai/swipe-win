// Deux joueurs sur deux téléphones jouent une partie complète de Yas Connect
// via l'interface : inscription, salon privé par code, prêt, partie, résultats.
import { test, expect } from '@playwright/test';
import { registerViaUi } from './helpers';

test('deux téléphones jouent une partie de Yas Connect jusqu\'à la victoire', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const nameA = `Ali${Date.now() % 10000}`;
  const nameB = `Bea${Date.now() % 10000}`;
  await registerViaUi(a, nameA);
  await registerViaUi(b, nameB);

  // A crée un salon privé
  await a.goto('/games/connect');
  await a.getByRole('button', { name: /Salon privé/ }).click();
  await expect(a).toHaveURL(/\/room$/);
  const code = (await a.locator('.code-box').textContent()).trim();
  expect(code).toMatch(/^YAS-\d{6}$/);

  // B rejoint avec le code
  await b.goto('/games/connect');
  await b.getByLabel('Code du salon').fill(code.slice(4));
  await b.getByRole('button', { name: 'Rejoindre', exact: true }).click();
  await expect(b).toHaveURL(/\/room$/);
  await expect(a.getByText(nameB)).toBeVisible();

  await a.getByRole('button', { name: /Je suis prêt/ }).click();
  await b.getByRole('button', { name: /Je suis prêt/ }).click();
  await expect(a).toHaveURL(/\/match\//, { timeout: 10000 });
  await expect(b).toHaveURL(/\/match\//, { timeout: 10000 });
  await expect(a.getByRole('grid', { name: 'Grille de Yas Connect' })).toBeVisible({ timeout: 10000 });

  // Qui commence ? (tirage serveur)
  await expect(a.getByText(/À toi de jouer|Au tour de/)).toBeVisible();
  const aFirst = await a.getByText('À toi de jouer !').isVisible();
  const first = aFirst ? a : b;
  const second = aFirst ? b : a;

  const drop = async (page, col) => {
    await expect(page.getByText('À toi de jouer !')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: `Colonne ${col}` }).click();
  };
  for (let i = 0; i < 3; i++) {
    await drop(first, 1);
    await drop(second, 2);
  }
  await drop(first, 1);

  await expect(first.getByRole('heading', { name: 'Victoire !' })).toBeVisible({ timeout: 10000 });
  await expect(second.getByRole('heading', { name: 'Défaite' })).toBeVisible({ timeout: 10000 });
  await expect(first.getByText('+30')).toBeVisible();
  await expect(first.locator('.stat b', { hasText: '+16' })).toBeVisible();

  // Le classement est à jour
  await first.goto('/rankings?game=connect&period=week');
  await expect(first.locator('.podium')).toContainText(aFirst ? nameA : nameB);
  await ctxA.close();
  await ctxB.close();
});
