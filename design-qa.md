# Visitor Video Call Layout — Design QA

- Source visual truth: the user-provided active video-call screenshot in the current conversation.
- Intended implementation: `/widget/call`, video call with a local and remote LiveKit camera publication.
- Intended layout: remote participant fills the main stage; the visitor camera appears as a small bottom-right picture-in-picture tile.
- Local route check: `http://localhost:3000/widget/call` loaded successfully in the browser.
- Active-call implementation screenshot: unavailable because the standalone widget has no call payload or two-party LiveKit room to render.

## Full-view comparison evidence

The supplied screenshot shows the local visitor camera occupying the only large video tile. The caller avatar and connection copy also consume vertical space after media has started.

The implementation now selects the first published non-local camera track for the main stage and independently selects the local camera track for the picture-in-picture tile. The connected video-call header is compacted and its large avatar/copy are hidden while media is active.

## Findings

- [P1] A real two-participant browser capture is still required.
  - Location: active visitor video call.
  - Evidence: the local widget route loads, but a remote LiveKit publication requires an authenticated agent, visitor call payload, camera permission, and an active room.
  - Impact: exact remote video crop and picture-in-picture placement could not be visually compared against a live call.
  - Fix: start a local agent-to-visitor video call and capture the visitor iframe after both cameras publish.

## Fidelity surfaces

- Layout: remote video is the full 4:3 stage; local video is a 76 × 94 px bottom-right overlay.
- Empty state: the main stage explicitly says it is waiting for the agent video, preventing the local preview from being mistaken for the remote participant.
- Controls: Mute, Camera off/on, and End remain below the video stage.
- Colors: existing Supernizo navy, teal, and red call tokens are preserved.
- Responsive behavior: the connected video header is compacted to reserve vertical room for media inside the iframe.

## Verification completed

- Formatting passed.
- Platform, shared, and tracker ESLint passed with zero warnings.
- TypeScript typecheck passed.
- 29 non-database test files passed (81 tests).
- The full test command remains blocked by the existing database smoke-test hook timing out while connecting.
- The repository-wide Prettier check remains blocked by 17 pre-existing unformatted files; both files changed for this video layout pass Prettier.
- Production build passed.
- The standalone call widget route loaded without a route error.

final result: blocked
