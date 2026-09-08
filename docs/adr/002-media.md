# ADR 002: Use LiveKit for WebRTC media

- Status: Accepted
- Date: 2026-08-31

## Context

V1 includes agent-initiated browser voice and video calls. It needs reliable WebRTC signalling and media transport without making the Next.js application a media proxy or requiring V1 to operate a custom SFU.

The visitor must retain control: an agent can invite, but the visitor must accept and grant browser microphone/camera permission before joining a call.

## Decision

Use LiveKit for WebRTC signalling, rooms, SFU functionality, and audio/video transport.

The Next.js application owns call workflow: authorization, invitation, accept/decline/missed/ended state, durable call history, and issuing short-lived scoped LiveKit access tokens from server-side services. Once accepted, browsers connect directly to LiveKit. Next.js must never proxy audio or video bytes.

V1 will not enable recordings, transcription, or media storage.

## Consequences

### Positive

- LiveKit provides a purpose-built WebRTC path and avoids media-plane load on Vercel/Next.js.
- The application keeps product-level call state and audit history separate from media infrastructure.
- Browser permissions and visitor acceptance remain explicit, enforceable checkpoints.

### Trade-offs

- LiveKit credentials and room/token lifecycle must be managed server-side with strict scopes and expiry.
- Call UI must handle browser permissions, device failures, network failures, reconnection, and room lifecycle events.
- The deployment requires a LiveKit provider account and operational monitoring in addition to Vercel and Upstash.

## Alternatives considered

- Proxying WebRTC or media through Next.js: rejected because it violates the architecture, adds cost/latency, and is unsuitable for Vercel application routes.
- Building a custom signalling/SFU stack: rejected for V1 due to complexity and operational burden.
- PSTN/SIP calling: explicitly outside V1 scope.
