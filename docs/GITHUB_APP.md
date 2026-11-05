# Registering the Redline GitHub App

The App ID, private key, and webhook secret can't be generated from code — you
create them once in GitHub's UI under the Quantapar account. ~5 minutes.

## 1. Create the App
Go to **github.com/settings/apps/new** (or your org's Developer settings).

- **GitHub App name:** Redline (or Redline Dev for testing)
- **Homepage URL:** your app URL (http://localhost:3000 is fine for dev)
- **Webhook URL:** a public URL that reaches your machine. For local dev use
  `smee.io` (create a channel at https://smee.io/new) and paste it here.
- **Webhook secret:** make up a strong random string and keep it.

## 2. Permissions (Repository)
- **Checks:** Read & write  (to post the red/green check)
- **Contents:** Read-only   (to read contracts and open fix branches → Read & write if you want Fix-it PRs)
- **Pull requests:** Read & write (to comment and open fix PRs)
- **Metadata:** Read-only (required)

## 3. Subscribe to events
- Push
- Pull request
- Installation

## 4. Install & collect secrets
- Create the app, then **Generate a private key** (downloads a `.pem`).
- Note the **App ID** at the top of the app page.
- Click **Install App** and pick your repos.

## 5. Put the secrets in `.env`
```
GITHUB_APP_ID=<the app id>
GITHUB_PRIVATE_KEY="<paste the full .pem contents, newlines and all>"
GITHUB_WEBHOOK_SECRET=<the secret you chose>
```

## 6. Run it
```
# forwards GitHub webhooks to your local app
npx smee -u https://smee.io/<your-channel> -t http://localhost:3001/api/github/webhooks
pnpm --filter @redline/github-app dev
```

Until this is done, the App is fully built and unit-tested; it just has no live
GitHub to talk to. The scan pipeline, dashboard, and fixer all work without it.
