// Mot de passe oublié, à partir du numéro de téléphone :
//  - compte avec e-mail : lien envoyé tout de suite, adresse masquée affichée ;
//  - compte sans e-mail : demande au service client, validée dans le back-office.
// En développement (sans RESEND_API_KEY), l'API écrit l'e-mail dans ses logs :
// indiquer leur chemin dans E2E_API_LOG pour suivre le lien.
// Identifiants admin de la base de test : E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
import fs from 'fs';
import { test, expect } from '@playwright/test';
import { registerViaUi } from './helpers';

const ADMIN = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };

async function linkFromLog(page, email) {
  const log = process.env.E2E_API_LOG;
  let link = null;
  for (let i = 0; i < 30 && !link; i++) {
    const lines = fs.readFileSync(log, 'utf8').split('\n');
    const idx = lines.findLastIndex(l => l.includes(`[e-mail → ${email}]`));
    if (idx >= 0) link = lines.slice(idx).find(l => l.includes('/reset?token='))?.trim();
    if (!link) await page.waitForTimeout(100);
  }
  expect(link).toBeTruthy();
  return link.replace(/^https?:\/\/[^/]+/, '');
}

async function chooseNewPassword(page, link, phone, password, username) {
  await page.goto(link);
  await page.getByLabel('Nouveau mot de passe').fill(password);
  await page.getByLabel('Confirme-le').fill(password);
  await page.getByRole('button', { name: /Enregistrer/ }).click();
  await expect(page.getByText(/C'est fait/)).toBeVisible();
  await page.goto('/welcome');
  await page.getByLabel('Numéro de téléphone').fill(phone);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: /Se connecter/ }).click();
  await expect(page.locator('.home-greeting')).toContainText(username, { timeout: 10000 });
}

async function logout(page) {
  await page.goto('/profile');
  await page.getByRole('button', { name: /Se déconnecter/ }).click();
  await expect(page).toHaveURL(/welcome/);
}

test('compte avec e-mail : lien envoyé depuis le numéro, adresse masquée', async ({ page }) => {
  const tag = Date.now() % 100000;
  const email = `joueur${tag}@exemple.km`;
  const phone = await registerViaUi(page, `Mail${tag}`, { email });
  await page.goto('/profile');
  await expect(page.getByText(`E-mail de récupération : ${email}`)).toBeVisible();
  await logout(page);

  await page.getByRole('link', { name: /Mot de passe oublié/ }).click();
  await page.getByLabel('Ton numéro de téléphone').fill(phone);
  await page.getByRole('button', { name: /Continuer/ }).click();
  await expect(page.getByText(/Lien envoyé à/)).toContainText('jo•••');

  test.skip(!process.env.E2E_API_LOG, 'E2E_API_LOG non défini : lien non vérifiable');
  await chooseNewPassword(page, await linkFromLog(page, email), phone, 'nouveau-mdp-789', `Mail${tag}`);
});

test('compte sans e-mail : demande, vérification par le service client, lien', async ({ page, browser }) => {
  test.skip(!ADMIN.email || !process.env.E2E_API_LOG, 'E2E_ADMIN_EMAIL ou E2E_API_LOG non défini');
  const tag = Date.now() % 100000;
  const name = `Sans Mail ${tag}`;
  const email = `retrouve${tag}@exemple.km`;
  const phone = await registerViaUi(page, name);
  await expect(page.getByText('Ajoute ton e-mail')).toBeVisible();
  await logout(page);

  await page.goto('/reset');
  await page.getByLabel('Ton numéro de téléphone').fill(phone);
  await page.getByRole('button', { name: /Continuer/ }).click();
  await expect(page.getByRole('heading', { name: 'Demande au service client' })).toBeVisible();
  await page.getByLabel('E-mail où recevoir le lien').fill(email);
  await page.getByLabel(/Un détail pour t'identifier/).fill('Je joue à Ludo');
  await page.getByRole('button', { name: /Envoyer ma demande/ }).click();
  await expect(page.getByText(/Demande envoyée/)).toBeVisible();

  // Le conseiller rappelle le numéro, puis envoie le lien depuis le back-office.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await ctx.newPage();
  await admin.goto('/admin/login');
  await admin.locator('input[type=email]').fill(ADMIN.email);
  await admin.locator('input[type=password]').fill(ADMIN.password);
  await admin.locator('form button').first().click();
  await expect(admin).not.toHaveURL(/login/, { timeout: 15000 });
  await admin.getByRole('link', { name: 'Récupération de compte' }).click();
  const row = admin.locator('tr', { hasText: name });
  await expect(row).toContainText(email);
  await expect(row).toContainText('Je joue à Ludo');
  admin.once('dialog', d => d.accept());
  await row.getByRole('button', { name: /envoyer le lien/ }).click();
  await expect(admin.getByText(`Lien envoyé à ${email}`)).toBeVisible();
  await ctx.close();

  await chooseNewPassword(page, await linkFromLog(page, email), phone, 'retrouve-456', name);
  await expect(page.getByText('Ajoute ton e-mail')).toHaveCount(0);
});
