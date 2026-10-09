# Repository tests

Run from the repository root:

- `pnpm test`: colocated application and package tests, configured by `tests/vitest.config.ts`. Database integration tests require their configured database and TLS certificate.
- `pnpm test:db`: PostgreSQL repository smoke test.
- `pnpm test:e2e`: browser scenarios in `tests/e2e`, configured by `tests/playwright.config.ts`. Requires the running application and scenario fixtures. Results are written to ignored `tests/test-results`.
- `pnpm test:deployment`: configuration checks and the Nginx integration test; requires Docker.

For the isolated local setup, run `pnpm dev:setup` once and `pnpm dev:local` to start the app. Use `pnpm test:local` for application and database tests, `pnpm test:setup` for setup checks, and `pnpm test:e2e:smoke:local` to verify local login without realtime providers. See [local development](../docs/development-environment.md).
