# Scan worker image — ships the Foundry toolchain for the real fork-based council.
FROM node:20-slim AS base
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends curl git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install Foundry (forge/anvil/cast) so referees can fork a chain and run attacks.
RUN curl -L https://foundry.paradigm.xyz | bash && /root/.foundry/bin/foundryup
ENV PATH="/root/.foundry/bin:${PATH}"

FROM base AS build
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile

FROM build AS run
ENV NODE_ENV=production
# The worker is a queue consumer; it serves no HTTP, so it exposes no port.
CMD ["pnpm", "--filter", "@redline/worker", "start"]
