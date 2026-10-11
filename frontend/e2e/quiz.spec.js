// Le quiz historique « Swipe & gagne » reste jouable avec un compte Défi Yas.
import { test, expect } from '@playwright/test';
import { registerViaUi } from './helpers';

test('quiz Swipe & gagne : démarrage et réponse validée par le serveur', async ({ page }) => {
  await registerViaUi(page, `Quiz${Date.now() % 10000}`);
  await page.goto('/quiz');
  await page.getByRole('button', { name: 'Jouer' }).click();
  await expect(page).toHaveURL(/\/quiz\/play$/);
  await expect(page.getByText('Question 1/15')).toBeVisible({ timeout: 10000 });
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText(/✅|❌/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Question 2/15')).toBeVisible({ timeout: 5000 });
});
