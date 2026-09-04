FROM node:24-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

WORKDIR /workspace

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/platform/package.json apps/platform/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/tracker-sdk/package.json packages/tracker-sdk/package.json

RUN pnpm install --frozen-lockfile

FROM base AS migration-dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/platform/package.json apps/platform/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/tracker-sdk/package.json packages/tracker-sdk/package.json

RUN pnpm install --frozen-lockfile --prod --filter supernizo-autocall

FROM dependencies AS builder

COPY . .
RUN DATABASE_URL=postgresql://build-only:build-only@127.0.0.1:5432/build-only pnpm build

FROM migration-dependencies AS migrator

COPY --chown=node:node prisma.config.ts ./
COPY --chown=node:node prisma ./prisma

RUN DATABASE_URL=postgresql://build-only:build-only@127.0.0.1:5432/build-only pnpm prisma:generate

USER node
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

FROM node:24-bookworm-slim AS runner

ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

WORKDIR /app

COPY --from=builder --chown=node:node /workspace/apps/platform/.next/standalone ./
COPY --from=builder --chown=node:node /workspace/apps/platform/.next/static ./apps/platform/.next/static
COPY --from=builder --chown=node:node /workspace/apps/platform/public ./apps/platform/public

USER node
EXPOSE 3000

CMD ["node", "apps/platform/server.js"]
