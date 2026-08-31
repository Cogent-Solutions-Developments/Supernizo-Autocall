# ADR 003: Privacy-first visitor identifiers and explicit media consent

- Status: Accepted
- Date: 2026-08-31

## Context

V1 needs session continuity, live visitor intelligence, approximate location, and limited abuse/deduplication signals. These needs must be balanced against collecting personal data by default.

Voice and video calls also invoke sensitive browser permissions and must never begin solely because an agent requested a call.

## Decision

Do not store raw visitor IP addresses by default. Use Vercel-provided approximate geolocation where available for coarse session attributes. Where a stable network-related signal is justified for abuse protection or deduplication, use a documented, rotating or salted one-way hash with limited access and retention; it is not an identity-enrichment mechanism.

Use anonymous visitor and session identifiers for tracking. Do not automatically identify a person from an IP address. An optional CRM identity link may be stored only when an authorized first-party action or integration provides it.

Require explicit visitor acceptance before joining a voice/video call. Browser microphone and camera access must be requested only through the standard browser permission flow after that action. V1 stores call state/history but does not record, transcribe, or retain media.

## Consequences

### Positive

- V1 minimizes collection of directly identifying network data.
- Visitors retain clear control over whether to participate in media and grant device access.
- Product data separates anonymous behavior from optional, deliberately supplied CRM identity.

### Trade-offs

- IP-based cross-session identification and enrichment are intentionally unavailable.
- Geo accuracy may be reduced or unavailable in some deployment contexts.
- Consent copy, cookie/storage choices, retention periods, deletion handling, and regional legal requirements still require product/legal review before launch.

## Implementation guardrails

- Never return raw IP data, provider secrets, or stack traces in public responses.
- Protect public tracker endpoints with site-key validation, allowed-origin checks, schema validation, and rate limiting.
- Restrict access to optional CRM links and keep an auditable record of who or what supplied them.
- Avoid requesting media permissions until the visitor has selected Accept; treat denial, cancellation, and device failure as distinct call outcomes.
