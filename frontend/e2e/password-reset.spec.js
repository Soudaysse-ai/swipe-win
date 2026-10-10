// Mot de passe oublié : demande par e-mail puis choix du nouveau mot de passe
// depuis le lien. En développement (sans RESEND_API_KEY), l'API écrit l'e-mail
// dans ses logs : indiquer leur chemin dans E2E_API_LOG pour tester le lien.
import fs from 'fs';
import { test, expect } from '@playwright/test';
import { registerViaUi } from './helpers';

test('mot de passe oublié par e-mail, de la demande à la reconnexion', async ({ page }) => {
  const tag = Date.now() % 100000;
  const email = `joueur${tag}@exemple.km`;
  const phone = await registerViaUi(page, `Mail${tag}`, { email });
  await page.goto('/profile');
  await expect(page.getByText(`E-mail de récupération : ${email}`)).toBeVisible();
  await page.getByRole('button', { name: /Se déconnecter/ }).click();

  await page.goto('/login');
  await page.getByRole('link', { name: 'Mot de passe oublié' }).click();
  await page.getByLabel('Ton e-mail').fill(email);
  await page.getByRole('button', { name: /Recevoir le lien/ }).click();
  await expect(page.getByText(/un e-mail avec un lien vient de partir/)).toBeVisible();

  const log = process.env.E2E_API_LOG;
  test.skip(!log, 'E2E_API_LOG non défini : lien non vérifiable');
  let link = null;
  for (let i = 0; i < 30 && !link; i++) {
    const content = fs.readFileSync(log, 'utf8');
    const lines = content.split('\n');
    const idx = lines.findLastIndex(l => l.includes(`[e-mail → ${email}]`));
    if (idx >= 0) link = lines.slice(idx).find(l => l.includes('/reset?token='))?.trim();
    if (!link) await page.waitForTimeout(100);
  }
  expect(link).toBeTruthy();
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await page.getByLabel('Nouveau mot de passe').fill('nouveau-mdp-789');
  await page.getByLabel('Confirme-le').fill('nouveau-mdp-789');
  await page.getByRole('button', { name: /Enregistrer/ }).click();
  await expect(page.getByText(/C'est fait/)).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Numéro de téléphone').fill(phone);
  await page.getByLabel('Mot de passe', { exact: true }).fill('nouveau-mdp-789');
  await page.getByRole('button', { name: /Se connecter/ }).click();
  await expect(page.locator('.app-header .greeting')).toContainText(`Mail${tag}`, { timeout: 10000 });
});
