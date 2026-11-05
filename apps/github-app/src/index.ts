import { run } from 'probot';
import { redlineApp } from './app.js';

// Starts the Probot server. Needs GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET.
// See docs/GITHUB_APP.md for registration.
run(redlineApp);

export { redlineApp };
