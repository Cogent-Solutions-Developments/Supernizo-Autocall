# Deploying Supernizo to Vercel and installing the tracker

This guide deploys the platform to a public HTTPS URL, then adds the tracker to
one or more external websites. Do not use `localhost` in a live website: in a
visitor's browser, `localhost` means that visitor's own computer.

## 1. Prepare the production providers

Before creating the Vercel project, create production credentials for:

- A managed MySQL database that accepts secure connections from Vercel.
- An Upstash Redis database. Its REST URL and token are used for Redis,
  rate-limiting, presence, and realtime events.
- A LiveKit Cloud project. Copy its WebSocket URL, API key, and API secret.

Use a separate production database and Redis database from local development.
Do not copy `.env.local` to Git or paste any secret into a website script.

## 2. Push the repository to Git

Create a private GitHub, GitLab, or Bitbucket repository and push this project.
Confirm that `.env.local` is not included:

```powershell
git status
git add .
git status
```

If `.env.local` appears in the staged files, stop and remove it from the
staging area before committing. The existing `.gitignore` is intended to keep
it out of Git.

Also commit the generated tracker file:

```text
apps/platform/public/sdk/tracker.js
```

It is the browser file loaded by customer websites.

## 3. Create the Vercel project

1. Sign in at [Vercel](https://vercel.com/) and choose **Add New → Project**.
2. Import the repository.
3. Set **Root Directory** to `apps/platform`.
4. Select the **Next.js** framework preset.
5. In **Build and Output Settings**, use these commands if Vercel does not
   automatically build the workspace correctly:

   ```text
   Install Command: pnpm install --frozen-lockfile
   Build Command: pnpm --dir ../.. build
   ```

   The root build generates Prisma, builds the shared package, rebuilds the
   tracker bundle, and builds the Next.js app.

6. Use Node.js 22.x (LTS) in the project settings.
7. Do not deploy yet if the environment variables have not been added.

The project is a pnpm workspace, so `apps/platform` is the deployed Next.js
application while the root directory contains its shared packages and Prisma
files.

## 4. Add production environment variables

In **Project Settings → Environment Variables**, add every value below for the
**Production** environment. Add them to Preview too only if you have separate
preview provider resources.

| Variable                          | Production value                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `DATABASE_URL`                    | Managed MySQL connection URL, including the required TLS options from the provider. |
| `UPSTASH_REDIS_REST_URL`          | Upstash Redis REST URL.                                                             |
| `UPSTASH_REDIS_REST_TOKEN`        | Upstash Redis REST token.                                                           |
| `LIVEKIT_URL`                     | LiveKit WebSocket URL, beginning with `wss://`.                                     |
| `LIVEKIT_API_KEY`                 | LiveKit server API key.                                                             |
| `LIVEKIT_API_SECRET`              | LiveKit server API secret.                                                          |
| `APP_URL`                         | Your final platform URL, for example `https://engage.example.com`.                  |
| `TRACKING_IP_HASH_SECRET`         | A unique random secret of at least 32 characters.                                   |
| `AUTH_SECRET`                     | A different unique random secret of at least 32 characters.                         |
| `CALL_RING_TIMEOUT_SECONDS`       | Optional; `30` is the default.                                                      |
| `CALL_CONNECTION_TIMEOUT_SECONDS` | Optional; `90` is the default.                                                      |

Create each random secret locally with Node.js, then copy its output into the
Vercel dashboard:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Never create `NEXT_PUBLIC_` versions of the database, Redis, LiveKit API, or
signing secrets. `LIVEKIT_URL` is not a secret, but the key and secret are.

## 5. Apply database migrations

Database migrations must run against the production database once before the
application starts serving traffic. They are deliberately not run automatically
by every web deployment.

Install and sign in to the Vercel CLI, then link this repository to the Vercel
project:

```powershell
corepack pnpm dlx vercel login
corepack pnpm dlx vercel link --repo
```

Run the migration using the Production variables stored in Vercel:

```powershell
corepack pnpm dlx vercel env run -e production -- corepack pnpm prisma:deploy
```

This command applies committed Prisma migrations only; it does not erase data.
Do **not** run the local demo seed against production. The current seed creates
`admin@local.test` and a demo site, which is intended only for local use.

### Important current production prerequisite

The current project has no production staff-provisioning flow yet. Before a
real launch, create an approved, secure process to create the first production
administrator instead of using the local demo seed. Until that exists, the
dashboard cannot be safely administered after deployment.

## 6. Deploy and verify

Click **Deploy** in Vercel, or run:

```powershell
corepack pnpm dlx vercel --prod
```

After deployment, visit:

```text
https://YOUR-PLATFORM-DOMAIN/api/health/config
```

It must report readiness booleans only. It must never return database URLs,
tokens, keys, or secrets. If a required variable is missing, correct it in
Vercel and redeploy.

For LiveKit lifecycle updates, configure this webhook URL in the LiveKit Cloud
project:

```text
https://YOUR-PLATFORM-DOMAIN/api/livekit/webhook
```

The webhook is verified using the server-side LiveKit credentials already in
Vercel. Do not place those credentials in LiveKit webhook query parameters.

## 7. Register a customer website in the dashboard

After you have a production administrator account:

1. Sign in to the dashboard.
2. Create a Site, or open an existing Site's settings.
3. Add the website's exact origin under **Allowed origins**. Origins contain
   scheme, hostname, and optional port, but no path:

   ```text
   https://www.example.com
   ```

4. Add every real variant separately when needed:

   ```text
   https://example.com
   https://www.example.com
   ```

5. Enable Tracking. Enable Chat, Audio Call, and Video Call only when the
   website should offer those features.
6. Copy the Site's **public key**. It identifies the site; it is not a
   dashboard password or secret.

An unlisted origin is rejected by the tracker API. This is expected and is a
security control.

## 8. Install the tracker on the website

Put this tag near the end of the website's `<head>` or before `</body>`. Replace
both placeholder values:

```html
<script
  async
  src="https://YOUR-PLATFORM-DOMAIN/sdk/tracker.js"
  data-site-key="site_public_key_from_dashboard"
></script>
```

For example:

```html
<script
  async
  src="https://engage.example.com/sdk/tracker.js"
  data-site-key="site_public_abc123"
></script>
```

The tracker is framework independent, so this same tag works with static HTML,
WordPress, React, Angular, and other website platforms. It creates anonymous
first-party visitor/session identifiers and does not collect form values,
passwords, or typed page content.

If the site uses a consent banner, do not load the tag until the visitor grants
the tracking consent required by your policy. The SDK also supports an explicit
opt-out through `window.SupernizoTracker.disable()`.

## 9. Test a real website installation

1. Open the real website in a private/incognito browser window.
2. Open browser developer tools → **Network**.
3. Reload the page and confirm that this request succeeds:

   ```text
   POST https://YOUR-PLATFORM-DOMAIN/api/track/bootstrap
   ```

4. Confirm the dashboard shows the visitor in **Live Visitors**.
5. Wait for a heartbeat and confirm page/activity values update.
6. If Chat is enabled, open the visitor chat launcher and send a test message
   from the dashboard.
7. If calling is enabled, use two separate browsers (for example Chrome for
   the agent and Edge/incognito for the visitor). The visitor must click
   **Accept** before the browser requests microphone or camera permission.

### Common installation problems

| Symptom                                   | Check                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| Bootstrap returns `403`                   | The exact website origin is missing from the Site's allowed-origin list.                 |
| No visitor appears                        | Confirm the script URL and Site public key, then check the bootstrap request in Network. |
| Chat/call does not update                 | Confirm the deployed platform URL is HTTPS and the Upstash Redis variables are valid.    |
| Browser blocks microphone/camera          | Calls require HTTPS, a visitor click on Accept, and browser permission.                  |
| Tracker works locally but not on the site | Do not use `localhost` in the script URL; use the deployed Vercel domain.                |

## 10. Before inviting real users

- Use a custom Vercel domain and set `APP_URL` to its final HTTPS URL.
- Keep production, preview, and local databases separate.
- Add only exact allowed origins that you control.
- Confirm the privacy notice and consent implementation match the website's
  legal requirements.
- Rotate any secret that was pasted into a chat, ticket, screenshot, or public
  repository.
