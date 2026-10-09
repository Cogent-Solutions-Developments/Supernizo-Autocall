# End-to-end tests

Run `pnpm test:e2e` from the repository root. The configuration is `tests/playwright.config.ts`; it targets the platform at `http://localhost:3001`. Start the app first and supply the credentials and fixture URLs required by each scenario. Run `pnpm test:e2e --list` to check discovery without launching a browser.

Scenarios cover dashboard authentication, tracker widgets, chat, and call signalling. Test artifacts are written to ignored `tests/test-results`.
