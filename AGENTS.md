# Supernizo Autocall — Agent Instructions

These rules apply to every implementation phase. Do not implement work from a future phase unless the current task explicitly requests it.

## Architecture and technology

1. Use Next.js and TypeScript for both the frontend and backend.
2. Use the Next.js App Router and Route Handlers for HTTP APIs.
3. Use pnpm workspaces.
4. Keep TypeScript strict; do not use `any` to bypass type errors.
5. Default to Server Components. Use Client Components only for browser APIs, interactive UI, realtime subscriptions, media, and forms.
6. Validate every untrusted API payload with Zod.
7. Store durable records in MySQL through Prisma; store ephemeral online/presence state in Redis.
8. Use Upstash Realtime/SSE through an internal realtime adapter for dashboard updates, visitor ringing, and chat delivery.
9. Use LiveKit for audio/video WebRTC. Never proxy audio/video bytes through Next.js.

## Security and privacy

10. Never expose `DATABASE_URL`, Redis credentials, the LiveKit API secret, or internal signing secrets to the browser.
11. Public tracker endpoints must validate the Site public key and allowed Origin, and must be rate-limited.
12. Do not store raw visitor IP addresses by default. Prefer Vercel geolocation and a salted one-way hash when an abuse or deduplication signal is needed.
13. Visitors must explicitly accept calls and grant browser microphone/camera permission.
14. Implement structured error handling. Public responses must not leak stack traces or secrets.

## Code quality and delivery

15. Add or update tests for every meaningful service or API change.
16. Do not delete working functionality merely to simplify a task.
17. Keep business logic outside React components and Route Handler files. Route Handlers must validate, authorize, call a service, and map the response.
18. Before declaring a phase complete, run formatting/lint, TypeScript checking, relevant tests, and `pnpm build`.
19. If installed major versions of Next.js, Prisma, Upstash, or LiveKit differ from examples, consult current official documentation and adapt the implementation while preserving this architecture.
20. At the end of each task, report files changed, migrations created, commands run, test/build status, and remaining blockers.
