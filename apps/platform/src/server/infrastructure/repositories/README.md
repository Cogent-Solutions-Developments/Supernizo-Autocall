# Persistence adapters

Repository factories implement interfaces from `server/application/ports`. Keep Prisma selectors, query filters, raw SQL, and generated types here. Public repository inputs/results are application-owned data contracts.

Clients are resolved lazily. For a transaction, bind the complete repository session to the callback's Prisma transaction client; never resolve a global client inside that session. Preserve lock ordering, compare-and-set conditions, audit/event inserts, and exception propagation. Application services decide authorization and business transitions.

Do not import service implementations, composition, routes, or UI from this layer. Repository and integration tests verify storage behavior; service tests exercise policy through injected interfaces.
