# Server services

Services own use-case orchestration and return typed results. Route Handlers validate and authorize requests, then delegate to services; they do not contain business rules or data-access code.

Services may depend on repository interfaces and provider abstractions. They must not import React components or browser-only modules.

Store every durable timestamp in UTC. Services and APIs exchange UTC ISO 8601 timestamps; UI code formats them only at the presentation boundary for the user's selected timezone.
