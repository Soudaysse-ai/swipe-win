// « Jouer contre un bot » : un joueur seul lance une partie d'entraînement depuis
// la page du jeu, ou depuis la recherche d'adversaires quand personne n'est disponible.
import { test, expect } from '@playwright/test';
import { registerViaUi } from './helpers';

test('Yas Connect contre un bot : partie complète jusqu\'à l\'écran de fin', async ({ page }) => {
  await registerViaUi(page, `Solo${Date.now() % 10000}`);
  await page.goto('/games/connect');
  // Personne d'autre n'est en ligne sur ce jeu : le bot est proposé.
  await page.getByRole('button', { name: 'Jouer seul' }).click();
  await page.getByRole('tab', { name: 'Facile' }).click();
  await page.getByRole('button', { name: /Lancer la partie/ }).click();
  await expect(page).toHaveURL(/\/match\//, { timeout: 10000 });
  await expect(page.getByText('Entraînement')).toBeVisible();
  await expect(page.getByLabel('Grille de Yas Connect')).toBeVisible({ timeout: 15000 });

  // Le joueur pose ses jetons dans la première colonne libre ; le bot répond seul.
  const result = page.getByRole('heading', { name: /victoire|pas cette fois|nul/i });
  for (let i = 0; i < 60 && !(await result.isVisible()); i++) {
    if (await page.getByText('À toi de jouer !').isVisible()) {
      const free = page.locator('[aria-label^="Colonne"]:not([aria-label*="pleine"])').first();
      await free.click().catch(() => {});
    }
    await page.waitForTimeout(700);
  }
  await expect(result).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Partie d'entraînement contre un bot/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Rejouer contre le bot/ })).toBeVisible();
});

test('recherche sans adversaire : proposition de jouer contre un bot', async ({ page }) => {
  await registerViaUi(page, `Seul${Date.now() % 10000}`);
  await page.goto('/games/penalty');
  await page.getByRole('button', { name: /Jouer maintenant/ }).click();
  await expect(page.getByText('Recherche d\'adversaires…')).toBeVisible();
  await page.getByRole('button', { name: 'Jouer seul' }).click({ timeout: 20000 });
  await expect(page).toHaveURL(/\/match\//, { timeout: 10000 });
  await expect(page.getByText('Entraînement')).toBeVisible();
  await page.getByRole('button', { name: 'Abandonner' }).click();
  await page.getByRole('button', { name: /Oui, abandonner/ }).click();
  await expect(page.getByRole('button', { name: /Rejouer contre le bot/ })).toBeVisible({ timeout: 15000 });
});
