// Les autres jeux se lancent entre deux téléphones et répondent aux
// actions de l'interface (la logique reste côté serveur).
import { test, expect } from '@playwright/test';
import { startDuel, tapVisible } from './helpers';

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
  await expect(a.getByText('7 cartes en main')).toBeVisible();
  await expect(b.getByText('7 cartes en main')).toBeVisible();
  const first = await a.getByText(/À toi|Aucune carte jouable/).isVisible() ? a : b;
  const playable = first.getByRole('button', { name: /\(jouable\)/ });
  if (await playable.count()) {
    // Comme sur Plato : un premier toucher met la carte en avant, un second la joue.
    const card = playable.first();
    await tapVisible(first, card);
    await expect(card).toHaveClass(/picked/);
    await tapVisible(first, card);
    const colorSheet = first.getByRole('dialog', { name: 'Choisir une couleur' });
    if (await colorSheet.isVisible().catch(() => false)) await colorSheet.getByRole('button', { name: 'Rouge' }).click();
    await expect(first.getByText('6 cartes en main')).toBeVisible();
  } else {
    // Pas de bouton : on touche la pioche.
    await first.getByRole('button', { name: /^Piocher \(/ }).click();
    await expect(first.getByText('8 cartes en main')).toBeVisible();
  }
  if (SHOTS) await first.screenshot({ path: `${SHOTS}/cards.png`, fullPage: true });
  await close();
});
