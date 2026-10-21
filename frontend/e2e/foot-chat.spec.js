// Yas Foot entre deux vrais joueurs : barre de chat en bas de l'écran (comme
// Soccer Stars). Un message tapé par l'un s'affiche en bulle chez l'autre ;
// les réactions et messages rapides passent par le bouton smiley.
import { test, expect } from '@playwright/test';
import { startDuel } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

test('Yas Foot : chat en bas de l\'écran entre les deux joueurs', async ({ browser }) => {
  const { a, b, close } = await startDuel(browser, 'foot');
  await expect(a.getByRole('img', { name: 'Terrain de Yas Foot' })).toBeVisible({ timeout: 15000 });

  // Message libre : bulle chez l'adversaire.
  await a.getByLabel('Message', { exact: true }).fill('Bonne chance !');
  await a.getByRole('button', { name: 'Envoyer' }).click();
  await expect(a.getByLabel('Message', { exact: true })).toHaveValue('');
  await expect(b.locator('.chat-bubble', { hasText: 'Bonne chance !' })).toBeVisible({ timeout: 5000 });

  // Message rapide depuis le plateau du smiley.
  await b.getByRole('button', { name: 'Réactions et messages rapides' }).click();
  const tray = b.getByRole('dialog', { name: 'Réactions et messages rapides' });
  await expect(tray).toBeVisible();
  const quick = tray.locator('.chat-tray-quick button').first();
  const label = (await quick.textContent()).trim();
  await quick.click();
  await expect(a.locator('.chat-bubble', { hasText: label })).toBeVisible({ timeout: 5000 });

  // La barre ne cache pas le terrain : il reste entièrement au-dessus.
  const field = await a.getByRole('img', { name: 'Terrain de Yas Foot' }).boundingBox();
  const bar = await a.locator('form.chat-bar').boundingBox();
  expect(field.y + field.height).toBeLessThanOrEqual(bar.y + 1);
  await a.screenshot({ path: test.info().outputPath('foot-chat.png') });
  await close();
});
