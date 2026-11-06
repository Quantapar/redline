import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { run } from 'probot';
import { redlineApp } from './app.js';

// The dev/start scripts run from this package dir, so Probot's own dotenv (which
// reads ./.env) would miss the single namespaced .env at the repo root. Load it
// explicitly — try the package-relative root first, then the current dir.
for (const envPath of [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')]) {
  if (existsSync(envPath)) loadEnv({ path: envPath });
}

// Probot's run() expects APP_ID / PRIVATE_KEY (or PRIVATE_KEY_PATH) / WEBHOOK_SECRET
// / WEBHOOK_PROXY_URL. The project documents namespaced GITHUB_* names (see
// .env.example and docs/GITHUB_APP.md), so map them onto what Probot reads. An
// already-set Probot-native var is never overwritten.
const ALIAS: Record<string, string> = {
  GITHUB_APP_ID: 'APP_ID',
  GITHUB_PRIVATE_KEY: 'PRIVATE_KEY',
  GITHUB_PRIVATE_KEY_PATH: 'PRIVATE_KEY_PATH',
  GITHUB_WEBHOOK_SECRET: 'WEBHOOK_SECRET',
  GITHUB_WEBHOOK_PROXY_URL: 'WEBHOOK_PROXY_URL',
};
for (const [from, to] of Object.entries(ALIAS)) {
  if (process.env[from] && !process.env[to]) process.env[to] = process.env[from]!;
}

// Default to 3001 so it doesn't collide with the Next.js app on 3000.
if (!process.env.PORT) process.env.PORT = '3001';

// Starts the Probot server. Needs GITHUB_APP_ID, GITHUB_PRIVATE_KEY (or
// GITHUB_PRIVATE_KEY_PATH), GITHUB_WEBHOOK_SECRET, and optionally
// GITHUB_WEBHOOK_PROXY_URL (a smee channel) for local webhook delivery.
// See docs/GITHUB_APP.md for registration.
run((app) => redlineApp(app));

export { redlineApp };
