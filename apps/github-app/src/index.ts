import { run } from 'probot';

// Default to 3001 so it doesn't collide with the Next.js app on 3000.
if (!process.env.PORT) process.env.PORT = '3001';
import { redlineApp } from './app.js';

// Starts the Probot server. Needs GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET.
// See docs/GITHUB_APP.md for registration.
run((app) => redlineApp(app));

export { redlineApp };
