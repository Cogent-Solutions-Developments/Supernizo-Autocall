# Widget and inbox UI updates

Date: 2026-09-09. Branch: `feat/ui-supernizo-heavy`. Changes remain local; no production push or migration.

## Changes

- `packages/tracker-sdk/src/chat-widget.ts`: immediately condensed mobile launcher, no autoplay of its hidden portrait, mobile chat frame sizing, and consistent launcher font stack.
- `packages/tracker-sdk/src/call-widget.ts`: mobile incoming, audio, and video iframe dimensions; responsive styles are removed when the controller stops. Desktop dimensions remain unchanged.
- `apps/platform/public/sdk/tracker.js`: regenerated browser bundle containing the SDK changes.
- `apps/platform/src/app/globals.css`: defines the missing `--font-app-sans` variable used by widget and media styles. An undefined variable had invalidated the font declarations, allowing serif/default sizing fallbacks.
- Widget chat and call frame components: smaller mobile heading/spacing, constrained composer width, 16px mobile message input to prevent focus zoom, and explicit text-size adjustment.
- `apps/platform/src/app/components/livekit-media-room.tsx`: white microphone and camera icons on dark dashboard controls, with distinct disabled-track styling. Visitor controls retain their light theme.
- `dashboard-chat-inbox.tsx`: up to 860px-wide inbox, conversation list/search on the left, selected conversation on the right, single close icon, Escape close and launcher focus restoration, mobile list/back navigation.
- `dashboard-chat-pane.tsx`: compact composer with send icon, Enter to send and Shift+Enter for a newline, long-message wrapping, and duplicate-submit prevention. Existing read-only permissions remain in place.

## Verification

- `pnpm lint`: passed, including all workspace lint and Prettier checks.
- `pnpm typecheck`: passed.
- `pnpm exec vitest run packages/tracker-sdk/src apps/platform/src/app/widget/call apps/platform/src/app/components/chat-state.test.ts apps/platform/src/app/components/livekit-media-state.test.ts`: 42 tests passed.
- `pnpm build`: passed; regenerates Prisma client, workspace packages, and the tracker browser bundle.
- Browser previews on the existing development server: mobile launcher 204×54, incoming call 300×420, audio frame 300×216, video frame 300×400. At 320px viewport width, frames clamp inside the viewport. Desktop incoming frames remain 350×540 at 768, 1024, and 1440px viewports.
- Mobile chat fits a 320px viewport with a 16px composer font. Incoming mobile heading verified at 18px. Widget body computes to the intended sans-serif font stack.
- Inbox verified with browser-only sample conversations: desktop split layout, 320px mobile conversation/list navigation, message alignment, close button, and focus restoration. Browser sessions closed and temporary fixture removed. No messages were sent.

Two-party LiveKit calls and external production deployment were not exercised. No service or API implementation changed.
