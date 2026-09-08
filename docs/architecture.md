# Architecture — Phase 0

## Summary

The frontend and application backend are both a single **Next.js + TypeScript** application deployed on Vercel. It uses the App Router for UI and Route Handlers for HTTP APIs. Business services remain outside UI components and Route Handlers.

Durable business records are stored in MySQL through Prisma. Ephemeral online and presence state is stored in Upstash Redis. Real-time application notifications use Upstash Realtime/SSE through an internal abstraction. LiveKit provides WebRTC signalling and media transport; no audio or video bytes pass through Next.js.

## Logical diagram

```text
                         Public website
                    +---------------------+
                    | Tracker snippet     |
                    +----------+----------+
                               |
                 public events | site key, allowed Origin, rate limit
                               v
+-------------------+  HTTPS  +------------------------------+
| Agent browser     +-------->| Next.js + TypeScript on       |
| Dashboard         |<--------+ Vercel                       |
| - dashboard UI    |  SSE    | - App Router UI              |
| - chat/call UI    |         | - Route Handlers             |
+---------+---------+         | - domain services            |
          |                   | - RealtimeProvider adapter   |
          |                   +---+--------------+-------+---+
          |                       |              |       |
          |                       |              |       +---------------------+
          |                       |              |                             |
          |                       v              v                             v
          |                 +-----------+  +------------+                +-----------+
          |                 | MySQL     |  | Upstash    |                | Upstash   |
          |                 | + Prisma  |  | Redis      |                | Realtime  |
          |                 | durable   |  | presence   |                | / SSE     |
          |                 +-----------+  +------------+                +-----------+
          |                                                                  |
          +------------------------------------------------------------------+
                             dashboard/chat/ring event subscriptions

               Agent browser  <------ WebRTC media ------>  Visitor browser
                      \                                  /
                       +---------- LiveKit -------------+
                         signalling, SFU, media transport
```

## Provider boundaries

| Concern                      | Provider and responsibility    | Application boundary                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI and application HTTP APIs | Next.js + TypeScript on Vercel | Server Components by default; Client Components only when browser APIs or interactivity require them. App Router pages render the dashboard and visitor experience; Route Handlers validate, authorize, call services, and map responses. |
| Durable data                 | MySQL through Prisma           | Tenant/site configuration, agents, visitors/sessions, event timeline, conversations/messages, calls, scores, and optional CRM links. Prisma is accessed only by server-side services.                                                     |
| Online/presence state        | Upstash Redis                  | Short-lived visitor/agent presence, heartbeats, connection state, and expiry. Redis is not the system of record for history.                                                                                                              |
| Realtime application push    | Upstash Realtime/SSE           | Dashboard updates, chat delivery, and call invitation/ringing events. The app uses an internal `RealtimeProvider` contract so route/services do not couple to a vendor SDK.                                                               |
| Voice/video media            | LiveKit                        | Issues scoped room/token access from server-side services and connects browsers directly to LiveKit for WebRTC signalling and media. Next.js does not proxy media bytes.                                                                  |

## State separation

Tracking requests create or update durable session intelligence in MySQL and refresh transient presence in Redis. Services then publish an application event through `RealtimeProvider`; subscribed dashboards and visitor widgets receive updates using the realtime transport.

Call invitation state and call history are application records and realtime notifications. After explicit visitor acceptance, the server issues narrowly scoped LiveKit access and the two browsers connect directly to LiveKit for media. WebRTC media is separate from tracking and realtime state.

## Trust, privacy, and security boundaries

- Browser clients receive only public configuration and short-lived, scoped credentials required for the immediate feature. Database, Redis, LiveKit API secret, and internal signing secrets never enter browser code.
- Public tracker APIs validate the site public key, request origin against site configuration, payload schema, and rate-limit policy before invoking services.
- All untrusted payloads are validated with Zod. Services use structured domain errors; Route Handlers produce safe public responses without stack traces or secrets.
- Raw IP addresses are not stored by default. Approximate Vercel geolocation may be persisted, and a salted one-way hash may be used for narrowly defined abuse prevention or deduplication.
- Media participation requires an explicit visitor decision and browser permission prompt. V1 does not record media.

## Initial implementation assumptions

- Authentication and tenant membership will be defined in a later phase; every server-side data access will nevertheless require an actor and tenant/site scope.
- The tracker can use a first-party visitor/session identifier subject to the site's consent configuration. The exact storage mechanism and retention policy are deferred.
- Event retention, data-deletion workflow, regional data residency, and Upstash/LiveKit region choices require operational and legal decisions before production rollout.
