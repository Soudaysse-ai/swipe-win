// Barre de chat en bas de l'écran pour tous les jeux (Connect, Ludo, Cards ; Yas
// Foot a son propre test) : un message tapé par l'un s'affiche en bulle chez
// l'autre, et la barre ne recouvre jamais le jeu.
import { test, expect } from '@playwright/test';
import { startDuel } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

const GAMES = [
  { id: 'connect', area: (p) => p.getByLabel('Grille de Yas Connect') },
  { id: 'ludo', area: (p) => p.getByRole('img', { name: 'Plateau de Yas Ludo' }) },
  { id: 'cards', area: (p) => p.getByLabel('Ma main') },
];

for (const g of GAMES) {
  test(`chat en bas de l'écran : ${g.id}`, async ({ browser }) => {
    const { a, b, close } = await startDuel(browser, g.id);
    await expect(g.area(a)).toBeVisible({ timeout: 15000 });
    const msg = `Salut ${g.id} !`;
    await a.getByLabel('Message', { exact: true }).fill(msg);
    await a.getByRole('button', { name: 'Envoyer' }).click();
    await expect(b.locator('.chat-bubble', { hasText: msg })).toBeVisible({ timeout: 5000 });
    // Le jeu reste entièrement au-dessus de la barre.
    const area = await g.area(a).boundingBox();
    const bar = await a.locator('form.chat-bar').boundingBox();
    expect(area.y + area.height).toBeLessThanOrEqual(bar.y + 1);
    await a.screenshot({ path: test.info().outputPath(`chat-${g.id}.png`) });
    await close();
  });
}
