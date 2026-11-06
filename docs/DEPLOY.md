# Deploying Redline

Redline is four runtime pieces plus two datastores:

| Piece        | What it does                                        | Dockerfile                    |
|--------------|-----------------------------------------------------|-------------------------------|
| web          | Dashboard + API (Next.js). Pushes the DB schema on boot. | `docker/web.Dockerfile`       |
| worker       | Runs scans; ships Foundry for the real fork-based council. | `docker/worker.Dockerfile`    |
| github-app   | Receives GitHub webhooks, posts the check + verdict comment. | `docker/github-app.Dockerfile` |
| Postgres     | Data store                                           | managed                       |
| Redis        | Scan queue (BullMQ)                                  | managed                       |

The GitHub App is ID **5639732**. Make it **Public** in its settings so others can
install it, and share its install URL.

## Railway (recommended — managed Postgres/Redis, TLS, public domains)

Create one Railway project with these services, all from this repo:

1. **Postgres** and **Redis** — add them from Railway's "New → Database". They expose
   `DATABASE_URL` and `REDIS_URL` as referenceable variables.

2. **web** — New service → this repo. In Settings set the variable
   `RAILWAY_DOCKERFILE_PATH=docker/web.Dockerfile`. Generate a public domain. Variables:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   OG_ROUTER_API_KEY=<your key>
   ARCHIVE_RPC_URLS=<your archive RPC url(s), comma-separated>
   ENCRYPTION_KEY=<32-byte base64>
   REDLINE_MUTATION_SECRET=<random 32+ bytes>
   NEXT_PUBLIC_APP_URL=https://<web public domain>
   ```

3. **worker** — New service → this repo. `RAILWAY_DOCKERFILE_PATH=docker/worker.Dockerfile`.
   No public domain. Variables:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   OG_ROUTER_API_KEY=<your key>
   ARCHIVE_RPC_URLS=<your archive RPC url(s)>
   ENCRYPTION_KEY=<same as web>
   ```
   Give it the largest instance you can — anvil + forge builds want CPU and memory.

4. **github-app** — New service → this repo. `RAILWAY_DOCKERFILE_PATH=docker/github-app.Dockerfile`.
   Generate a public domain. Variables:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   NEXT_PUBLIC_APP_URL=https://<web public domain>
   GITHUB_APP_ID=5639732
   GITHUB_PRIVATE_KEY=<the .pem contents, inline, with \n for newlines>
   GITHUB_WEBHOOK_SECRET=<your webhook secret>
   ```
   Then in the GitHub App settings set the **Webhook URL** to
   `https://<github-app public domain>/` and leave `GITHUB_WEBHOOK_PROXY_URL` UNSET
   (the app listens for inbound webhooks directly; no smee relay needed in prod).

Deploy order: Postgres + Redis first, then web (it runs the schema push on boot),
then worker and github-app.

## Single VM with Docker Compose (alternative)

```
cp .env.example .env     # fill in the values (see .env.production you generated)
docker compose up -d --build
```

`docker-compose.yml` already requires the production secrets up front and binds
Postgres/Redis to localhost only. Put the web service (port 3000) behind a TLS
reverse proxy and set `NEXT_PUBLIC_APP_URL` to its https URL. The github-app receives
webhooks via the smee relay in `GITHUB_WEBHOOK_PROXY_URL`, so it needs no inbound port.

## Required secrets

| Variable                 | How to get it                                   |
|--------------------------|-------------------------------------------------|
| `ENCRYPTION_KEY`         | `openssl rand -base64 32` (REQUIRED in prod)    |
| `REDLINE_MUTATION_SECRET`| `openssl rand -hex 32`                          |
| `POSTGRES_PASSWORD`      | `openssl rand -hex 24` (compose only)           |
| `OG_ROUTER_API_KEY`      | your 0G Compute Router key                       |
| `ARCHIVE_RPC_URLS`       | your archive RPC (Alchemy etc.), comma-separated |
| `GITHUB_APP_ID`          | 5639732                                          |
| `GITHUB_PRIVATE_KEY`     | the App's .pem, inline                           |
| `GITHUB_WEBHOOK_SECRET`  | the App's webhook secret                         |

`NODE_ENV=production` is set in the images; with it, the app refuses to start without
`ENCRYPTION_KEY` and signs mutation tokens with a real secret, by design.
