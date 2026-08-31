# Server repositories

Repositories encapsulate durable-data queries once data models exist. Define a repository interface when a service needs a replaceable or testable data-access boundary; avoid classes for simple, single-query access.

Route Handlers and React components must not query MySQL directly. Prisma-backed implementations are intentionally deferred until the data-model phase.
