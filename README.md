# Supernizo Autocall

Next.js and TypeScript platform for visitor tracking, live presence, chat, and consent-based audio/video calls. Managed as a pnpm workspace...

- [Architecture and folder responsibilities](docs/architecture.md)
- [Development environment](docs/development-environment.md)
- [Product scope](docs/product-scope.md)
- [Production deployment](docs/hetzner-deployment.md)

Use Node.js 24 and pnpm 10.34.5. Run `pnpm install --frozen-lockfile`, start Docker Desktop, then run `pnpm dev:setup` and `pnpm dev:local`. Open `http://localhost:3001/autocall-db/login`; local credentials and provider settings live in ignored `.env.development.local`. Validate changes with `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

## Repository layout

```text
apps/platform/       Next.js application, clean architecture layers, application CLI
packages/            Shared contracts and browser tracker SDK
prisma/              Database schema, migrations, seed, and admin provisioning
ops/
  docker/            Production Dockerfile and Compose stack
  scripts/           Deployment, environment validation, backup, routing checks
  nginx/             Reverse proxy configuration
  systemd/           Backup service and timer
tests/
  e2e/               Playwright browser tests
  deployment/        Deployment configuration tests
  playwright.config.ts
  vitest.config.ts
docs/                Architecture, setup, integrations, operations, validation
generated/           Ignored Prisma output, recreated by pnpm prisma:generate
```

Unit and service tests stay beside the code they verify. Workspace manifests, shared lint/TypeScript/Prisma configuration, environment files, and tool-discovery dotfiles stay at the root. `node_modules`, `.pnpm-store`, and framework caches are generated tooling directories.

Run `pnpm test:e2e` for browser tests (requires the running platform and test fixtures), and `pnpm test:deployment` for deployment tests (requires Docker). Docker builds use the repository root as their context: `docker build -f ops/docker/Dockerfile --target runner .`. See [operations](ops/README.md) before upgrading an existing production checkout.
