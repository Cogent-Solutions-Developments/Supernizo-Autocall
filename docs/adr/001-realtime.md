# ADR 001: Use Upstash Realtime/SSE behind `RealtimeProvider`

- Status: Accepted
- Date: 2026-08-31

## Context

V1 needs low-latency application notifications for live visitor presence, visitor timeline/dashboard changes, chat delivery, and agent-initiated call invitations/ringing. These are control-plane events, not audio/video media.

The application must avoid vendor-specific calls throughout business services and must preserve a separation between durable history in PostgreSQL and transient online state in Redis.

## Decision

Use Upstash Realtime/SSE as the realtime push transport. Encapsulate it behind an internal `RealtimeProvider` abstraction owned by the application.

The provider contract will expose application-oriented operations such as publishing tenant/site/session/conversation/call events and creating authorized subscriptions. Services publish typed domain events to the abstraction; dashboard and visitor-facing clients subscribe only to scoped channels authorized by server-side code.

Upstash Redis is the separate store for ephemeral presence, heartbeats, and expiry. PostgreSQL through Prisma remains the source of truth for durable records and history.

## Consequences

### Positive

- SSE is a suitable simple transport for server-to-browser dashboard, chat, and ringing updates.
- An adapter prevents Upstash APIs and data shapes from spreading into routes and services.
- The transport can be replaced or augmented later without rewriting core business logic.
- Real-time event delivery stays clearly distinct from WebRTC media.

### Trade-offs

- SSE is primarily server-to-client; browser-originated actions continue to use authenticated HTTP APIs.
- Event consumers must tolerate reconnects, duplicate messages, missed transient signals, and resynchronization from durable state.
- Channel authorization, event envelopes, ordering expectations, and retention/replay semantics must be specified during implementation.

## Alternatives considered

- Direct vendor SDK use in UI and Route Handlers: rejected because it tightly couples application code to the provider.
- Polling only: rejected because it weakens live visitor and ringing responsiveness.
- WebSockets as the primary application transport: deferred; not required for V1 while SSE meets server-to-client push needs.
- LiveKit data channels for all events: rejected because tracking/chat/presence must work independently of a media room and LiveKit is reserved for WebRTC media.
