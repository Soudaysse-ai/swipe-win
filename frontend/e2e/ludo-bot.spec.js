// Yas Ludo contre un bot : le dé redevient toujours jouable à mon tour, même quand
// un lancer sans pion jouable est aussitôt suivi d'un lancer du bot (régression : écran bloqué).
import { test, expect } from '@playwright/test';
import { registerViaUi } from './helpers';

test('Yas Ludo contre un bot : la main revient toujours au joueur', async ({ page }) => {
  test.setTimeout(420_000);
  await registerViaUi(page, `Ludo${Date.now() % 10000}`);
  await page.goto('/games/ludo');
  await page.getByRole('button', { name: 'Jouer seul' }).click();
  await page.getByRole('tab', { name: 'Facile' }).click();
  // Un seul bot : après un lancer sans pion jouable, le bot relance aussitôt — c'est là
  // que l'écran se bloquait (message figé, dé verrouillé, tour perdu).
  await page.getByRole('tablist', { name: 'Nombre de bots' }).getByRole('tab', { name: '1' }).click();
  await page.getByRole('button', { name: /Lancer la partie/ }).click();
  await expect(page).toHaveURL(/\/match\//, { timeout: 10000 });

  const dice = page.getByRole('button', { name: 'Lancer le dé' });
  let rolls = 0;
  for (let turn = 0; turn < 20; turn++) {
    // Mon tour doit revenir et le dé être cliquable rapidement (bot + animations).
    await expect(dice).toBeVisible({ timeout: 15_000 });
    await dice.click();
    rolls += 1;
    // Après l'animation du dé : soit un pion est à choisir (on prend le premier qui
    // clignote), soit le tour est passé au bot.
    const pick = page.getByRole('button', { name: /Déplacer le pion/ }).first();
    const mustPick = await page.getByText('touche un pion qui clignote').waitFor({ timeout: 3000 }).then(() => true, () => false);
    if (mustPick) await pick.click();
  }
  expect(rolls).toBe(20);
  await page.getByRole('button', { name: 'Abandonner' }).click();
  await page.getByRole('button', { name: /Oui, abandonner/ }).click();
});
