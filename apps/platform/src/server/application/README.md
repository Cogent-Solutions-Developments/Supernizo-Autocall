# Application services

Services are created with explicit dependencies: `create*Service(dependencies)`. Business decisions and orchestration live here; storage and provider implementations live in infrastructure. Interfaces are owned by `ports/`, and production wiring lives in `../composition`.

Do not import infrastructure, composition, generated Prisma types, Next.js, React, or provider SDKs. Use repository operations with plain data inputs/results. A repository's `transaction` callback supplies operations bound to one transaction; errors must propagate to preserve rollback.

Routes and server pages import composed operations, validate/authorize, and map responses. Service tests can supply fakes directly without setting environment credentials. The architecture test enforces these dependency boundaries.

Store durable timestamps in UTC, exchange UTC ISO 8601 timestamps, and format them at the presentation boundary. See the root `docs/architecture.md` for the full structure and extension workflow.
