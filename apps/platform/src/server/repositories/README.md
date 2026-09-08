# Server repositories

Repositories encapsulate durable-data queries once data models exist. Define a repository interface when a service needs a replaceable or testable data-access boundary; avoid classes for simple, single-query access.

Route Handlers and React components must not query PostgreSQL directly. Authorization checks and services call repositories or the database client from server-only modules.
