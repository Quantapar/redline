# GitHub App image (Probot). Receives webhooks, opens a check, queues a scan, and
# posts the sticky verdict comment. Serves HTTP on PORT (default 3001).
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile

FROM build AS run
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["pnpm", "--filter", "@redline/github-app", "start"]
