# Dashboard image.
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @redline/web build

FROM base AS run
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
# Push the schema on boot, then serve.
CMD ["sh", "-c", "pnpm --filter @redline/db push && pnpm --filter @redline/web start"]
