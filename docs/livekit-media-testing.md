# LiveKit media testing

Phase 13 uses LiveKit for browser-to-browser WebRTC. Next.js only authorizes calls, issues short-lived participant tokens, and receives signed webhooks; it never carries audio or video bytes.

## Prerequisites

- Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in `.env.local`.
- In LiveKit Cloud, add `http://localhost:3000` to the development allowlist if required by the project settings.
- Configure a LiveKit webhook to `https://<public-platform-url>/api/livekit/webhook`. For local verification, expose the platform with an HTTPS tunnel and register that tunnel URL.
- Ensure the demo Site enables audio/video calling and allows the fixture origin.

## Chrome-to-Chrome or Chrome-to-Edge walkthrough

1. Start the platform and open `/sdk/fixture.html` in one browser profile; it represents the visitor.
2. Sign in with an ADMIN or AGENT account in a second, separate browser profile and open `/dashboard/live`.
3. Start an Audio Call or Video Call for the live visitor.
4. Confirm the visitor sees the ring card without any device-permission prompt.
5. Choose Accept. The visitor browser should now request microphone permission; video calls also request camera permission.
6. After the agent room connects, verify two-way audio. For video, verify the local/remote video tiles and camera/microphone toggles.
7. Test mute, camera toggle, and End call from both browsers. The call should disconnect and persist an `ENDED` event.
8. Repeat with Chrome on one side and Edge on the other. Deny a device permission once to verify the media error is shown without affecting the host page.

## Automated tests

Unit tests generate and inspect a mock-configured LiveKit JWT; they do not call LiveKit Cloud. The signalling E2E test remains gated by `E2E_LOCAL_ADMIN_PASSWORD` because it uses the seeded local staff account. Real media requires an actual LiveKit project and physical browser media devices.
