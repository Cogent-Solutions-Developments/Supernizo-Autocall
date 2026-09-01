# Accepted Audio Call UI — Design QA

- Source visual truth: user-provided accepted-call screenshot in the current conversation.
- Source pixels: 429 × 677.
- Intended implementation: `/widget/call`, audio call in the `ACTIVE` state.
- Intended iframe CSS size: 360 × 560 at device scale factor 1.
- Implementation screenshot: unavailable.
- Density normalization: not performed because a browser-rendered implementation capture was unavailable.

**Full-view comparison evidence**

The supplied screenshot shows a P1 layout failure: LiveKit's 100%-height room container participates incorrectly in the outer phone flex layout, placing the connection row and media controls over the agent photo, name, and call copy. The microphone control also renders both LiveKit's default icon and the custom icon.

The implementation now overrides the LiveKit room root to use normal-flow, auto-height layout. Active media controls render beneath the caller section as circular phone controls with separate labels.

**Focused region comparison evidence**

The problematic top control region was evaluated from the supplied screenshot. Post-fix focused evidence is blocked because the in-app browser is unavailable.

**Findings**

- [P1] Post-fix browser-rendered evidence is missing.
  - Location: accepted audio call, caller identity and media-control regions.
  - Evidence: the reported overlap and duplicate icon were corrected in code, but no revised screenshot could be captured.
  - Impact: exact vertical spacing and control placement cannot be visually confirmed.
  - Fix: capture a local accepted audio call at 360 × 560 and compare it against the supplied screenshot.

**Fidelity surfaces**

- Fonts and typography: existing Supernizo call typography is preserved; post-fix wrapping requires browser confirmation.
- Spacing and layout rhythm: LiveKit root height and control-flow defects were corrected; visual confirmation is blocked.
- Colors and visual tokens: existing navy, teal, green, and red phone-call tokens are preserved.
- Image quality and asset fidelity: configured agent avatar behavior is unchanged.
- Copy and content: connection state, duration, Mute/Unmute, optional Camera, and End labels remain functional.

**Primary interactions checked**

- Mute toggle now owns one icon and updates between Mute and Unmute.
- Video calls retain a separate camera toggle.
- End call remains a dedicated red circular action.
- Browser interaction and console inspection were blocked because the in-app browser was unavailable.

**Comparison history**

- Iteration 1: found overlapping caller details/controls and a duplicate microphone icon in the supplied screenshot.
- Fixes: constrained `.lk-room-container` to normal-flow auto height, disabled LiveKit's automatic toggle icon, separated labels from circular controls, and added explicit mute/camera state icons.
- Post-fix evidence: unavailable because browser capture is blocked.

final result: blocked
