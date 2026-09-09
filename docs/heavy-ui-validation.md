# Supernizo Heavy UI alignment

Date: 2026-09-08

Branch: `feat/ui-supernizo-heavy`, created from fetched `origin/hetzner-prod` at `921c5bf`. No commits or pushes were made to production.

## Scope and source

Autocall remains a Supernizo module. The dashboard opens the event workspace, with no separate welcome page or hero. Branding appears once in the shared header. Navigation remains visible on all dashboard pages, as requested. The dock has no sign-out action. Its Autocall-specific icons are CalendarDays (Events), Radar (Live visitors), Headset (Calls), and ChartSpline (Analytics), distinct from Heavy’s navigation icons. The extra page branding, Operations labels, and header avatar were removed. Availability uses one selector with a status dot.

Reference repository: `../supernizo-heavy`, commit `5ff568c`.

- The floating dock comes from Heavy's `components/ui/floating-dock.tsx`; Autocall retains its own routes and authentication. Keyboard focus, reduced-motion sizing, and mobile Escape handling are included.
- The background uses Heavy's `components/ui/dither.tsx` and the exact layers and shader settings from its CS Database and My Leads pages. It uses one canvas, demand rendering, DPR 1, a low-power WebGL context, and a 30 FPS limit. Hidden documents do not request animation frames; reduced-motion preferences stop the background animation.
- The body uses Heavy's Google Sans / Product Sans / Arial stack. The Autocall lettering loads the Bungee Hairline Latin WOFF2 asset from Heavy's cached build. The font is served locally and its OFL license is included.
- Panels, records, tables, filters, and actions follow Heavy's transparent surfaces, cyan borders, pill controls, and hover treatments. At the user's request, the blue glass backing was removed: panels use an 18% black tint and record cards remain transparent, exposing the shared animated background. Staff dropdowns use the shared `workspace-select.tsx` component and Heavy’s Radix Select library. Menus use popper positioning, open 8px below the trigger, match its width, scroll within the viewport, and support keyboard navigation and Escape. Filter form values are preserved, including empty “All” selections. Primary buttons and active view controls use Supernizo blue (`#2563eb`). Call-history filters use two responsive rows: four dropdowns, then labelled From/To dates and the Filter action, with all filters visible. The visitor-type label reads “New & Returning.” The Analytics eyebrow and event-page introduction are removed; View live visitors is a blue button that preserves the selected event.
- Event search and grid/list views retain site registration, settings, deactivation, public-key copy, role checks, chat, and calls. Selected event IDs travel in navigation URLs. Mobile live-visitor cards expose profile, chat, audio, and video actions.

## Files changed

- Shared dashboard layout, event page, loading state, live visitors, call history, analytics, and visitor detail pages under `apps/platform/src/app/dashboard/`.
- `globals.css` and root `layout.tsx` for typography and staff workspace styling. Root `loading.tsx` replaces the cartoon/logo/image loader with a minimal text status.
- New `workspace-select.tsx`, `autocall-wordmark.tsx`, `dashboard-dock.tsx`, `heavy-floating-dock.tsx`, `heavy-dither.tsx`, and `heavy-workspace-background.tsx` components.
- Existing site management, live visitor dashboard, staff chat, call/chat modal, availability, logout, and copy-key components.
- `src/lib/dashboard-navigation.ts` and its focused tests.
- `src/assets/fonts/bungee-hairline-latin.woff2` and `OFL.txt`.
- Platform dependency manifest and workspace lockfile. `postprocessing` 6.39.4 is compatible with the existing Three.js version; its renderer API matches Heavy's component.
- `next.config.ts` moves the development indicator away from the mobile navigation.

Existing startup and environment edits were preserved. No database schema changes or migrations were created. No service or API implementation was changed.

## Validation

- `pnpm lint`: passed, including workspace lint and Prettier. Platform lint and formatting were also checked after the final navigation/branding adjustment.
- `pnpm typecheck`: passed. The final production build also passed TypeScript checking.
- `pnpm test`: 196 passed, 8 skipped; includes the PostgreSQL repository smoke test. The first sandboxed attempt could not connect to local PostgreSQL; the permitted retry passed.
- `pnpm build`: passed, including Prisma generation, shared/SDK builds, production compilation, TypeScript, and page generation. A sandbox port restriction was cached by Turbopack; moving only its production build cache to a temporary backup and rebuilding outside the sandbox resolved it.
- `git diff --check`: passed.
- Browser: local admin login, dashboard/live/calls/analytics rendering, mobile dock opening and navigation, event-search empty states, grid/list switching, selected-event URL context, settings opening/cancellation, and no browser errors. The Calls table stays inside the viewport at 320, 768, 1024, and 1440 pixels. Each dashboard route has exactly one wordmark and visible desktop navigation. One background canvas is mounted across navigation. The replacement Status dropdown was verified 8px below its trigger at desktop and 320px mobile widths; keyboard selection produced `status=CANCELLED` in FormData, kept empty Agent/Type filter values, and returned focus to its trigger. No browser errors were reported.

## Remaining validation limits

LiveKit calls requiring a second participant and external Supernizo SSO were not exercised in this UI pass. Optional integration tests retain their existing skips. UI verification used the existing local server on port 3001; no second development server was launched.
