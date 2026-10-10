// Tests de bout en bout : plusieurs « téléphones » (contextes navigateur
// séparés, viewport mobile) jouent ensemble contre le vrai serveur.
// Prérequis : API sur :3001 (base de test) et `npm run dev` sur :5173.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    ...devices['Pixel 7'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
