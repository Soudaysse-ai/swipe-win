// Les trois autres jeux se lancent entre deux téléphones et répondent aux
// actions de l'interface (la logique reste côté serveur).
import { test, expect } from '@playwright/test';
import { startDuel } from './helpers';

const SHOTS = process.env.E2E_SHOTS_DIR;

test('Yas Ludo : lancer de dé et tour suivant', async ({ browser }) => {
  const { a, b, close } = await startDuel(browser, 'ludo');
  await expect(a.getByRole('img', { name: 'Plateau de Yas Ludo' })).toBeVisible({ timeout: 10000 });
  const first = await a.getByRole('button', { name: 'Lancer' }).isVisible() ? a : b;
  await first.getByRole('button', { name: 'Lancer' }).click();
  await expect(first.getByRole('img', { name: /Dé : [1-6]/ })).toBeVisible();
  if (SHOTS) await first.screenshot({ path: `${SHOTS}/ludo.png`, fullPage: true });
  await close();
});

test('Yas Cards : mains privées et première action', async ({ browser }) => {
  const { a, b, close } = await startDuel(browser, 'cards');
  await expect(a.getByLabel('Ma main')).toBeVisible({ timeout: 10000 });
  await expect(a.getByText('7 carte(s) en main')).toBeVisible();
  await expect(b.getByText('7 carte(s) en main')).toBeVisible();
  const first = await a.getByText(/À toi|Aucune carte jouable/).isVisible() ? a : b;
  const playable = first.getByRole('button', { name: /\(jouable\)/ });
  if (await playable.count()) {
    await playable.first().click();
    const colorSheet = first.getByRole('dialog', { name: 'Choisir une couleur' });
    if (await colorSheet.isVisible().catch(() => false)) await colorSheet.getByRole('button', { name: 'Rouge' }).click();
    await expect(first.getByText('6 carte(s) en main')).toBeVisible();
  } else {
    await first.getByRole('button', { name: /Piocher/ }).click();
  }
  if (SHOTS) await first.screenshot({ path: `${SHOTS}/cards.png`, fullPage: true });
  await close();
});

test('Yas Penalty : choix simultanés et révélation', async ({ browser }) => {
  const { a, b, close } = await startDuel(browser, 'penalty');
  await expect(a.getByRole('group', { name: 'But et zones de tir' })).toBeVisible({ timeout: 10000 });
  for (const p of [a, b]) {
    await p.getByRole('button', { name: /(Tirer|Plonger) : Haut gauche/ }).click();
  }
  await expect(a.getByText('ARRÊT !')).toBeVisible({ timeout: 5000 }); // même zone → arrêt
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/penalty.png`, fullPage: true });
  await close();
});
