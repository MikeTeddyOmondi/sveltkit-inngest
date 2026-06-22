# Sveltekit + Inngest

SvelteKit + Better Auth + Keycloak (genericOAuth) + MongoDB demo.

## Stack

- **SvelteKit** — frontend + server
- **Better Auth** — auth layer (`genericOAuth` plugin with `keycloak()` helper)
- **Keycloak** — IDP (OIDC/PKCE flow)
- **MongoDB** — session + user storage
- **Inngest** — durable events and workflows

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

```env
MONGODB_URI=mongodb://localhost:27017/locci-auth
BETTER_AUTH_SECRET=<openssl rand -hex 32>
BETTER_AUTH_URL=http://localhost:5173

KEYCLOAK_ISSUER=http://localhost:8080/realms/locci
KEYCLOAK_CLIENT_ID=locci-auth
KEYCLOAK_CLIENT_SECRET=<from Keycloak admin>
```

### 3. Configure Keycloak

In your Keycloak realm, create a client:

| Setting | Value |
|---|---|
| Client ID | `locci-auth` |
| Client type | `OpenID Connect` |
| Client authentication | `On` (confidential) |
| Authentication flow | Standard flow only |
| Valid redirect URIs | `http://localhost:5173/api/auth/oauth2/callback/keycloak` |
| Web origins | `http://localhost:5173` |

Copy the client secret from the **Credentials** tab into `KEYCLOAK_CLIENT_SECRET`.

### 4. Run

```bash
npm run dev
```

Visit `http://localhost:5173`.

## Inngest (durable workflows)

Inngest is wired in via the **`inngest/sveltekit`** adapter — no Express. A sample multi-step
SaaS onboarding workflow (`user-onboarding`) lives in
[src/lib/inngest/functions/onboarding.ts](src/lib/inngest/functions/onboarding.ts) and is served
from [src/routes/api/inngest/+server.ts](src/routes/api/inngest/+server.ts).

### Run the Inngest Dev Server

Two terminals:

```bash
# Terminal 1 — SvelteKit (INNGEST_DEV=1 points the SDK at the Dev Server)
INNGEST_DEV=1 bun run dev

# Terminal 2 — Inngest Dev Server (Docker)
docker run -p 8288:8288 -p 8289:8289 \
  inngest/inngest:latest \
  inngest dev -u http://host.docker.internal:5173/api/inngest
```

Open the dashboard at `http://localhost:8288` → **Functions** should list `user-onboarding`.

### Demo page — three trigger styles

Visit `http://localhost:5173/inngest-demo`. It fires the same `app/user.signup` event three ways
(for reference) and lets you resume the durable pauses:

1. **API route** — `POST /api/signup` ([+server.ts](src/routes/api/signup/+server.ts))
2. **Form action** — `?/signup` ([+page.server.ts](src/routes/inngest-demo/+page.server.ts))
3. **Remote function** — `triggerOnboarding()` ([onboarding.remote.ts](src/lib/remotes/onboarding.remote.ts), experimental)

Then click **Fire app/email.verified** and **Fire app/onboarding.approved** to advance the workflow
through its `waitForEvent` pauses. Watch each step pause, resume, and complete in the dashboard.

### Production

Self-hosted on the thanos homelab (`inngest start` + Postgres + Redis). See
[docs/INNGEST_PRODUCTION_THANOS.md](docs/INNGEST_PRODUCTION_THANOS.md) and the compose stack in
[deploy/inngest/](deploy/inngest/).

## File structure

```
src/
├── lib/
│   ├── auth.ts          # Better Auth server instance (Keycloak + MongoDB)
│   └── auth-client.ts   # Browser auth client
├── routes/
│   ├── api/auth/[...all]/+server.ts   # Better Auth catch-all handler
│   ├── dashboard/
│   │   ├── +page.server.ts   # Protected route (redirects if no session)
│   │   └── +page.svelte      # Dashboard UI — shows session + user data
│   ├── +layout.server.ts     # Passes session to all pages
│   ├── +layout.svelte        # Global styles
│   └── +page.svelte          # Login page
├── app.d.ts             # Locals typing (user + session)
└── hooks.server.ts      # Session population + Better Auth handler
```

## Auth flow

1. User clicks "Continue with Keycloak" → `authClient.signIn.oauth2({ providerId: 'keycloak' })`
2. Better Auth generates PKCE code verifier/challenge, redirects to Keycloak
3. User authenticates in Keycloak realm
4. Keycloak redirects to `/api/auth/oauth2/callback/keycloak` with auth code
5. Better Auth exchanges code for tokens server-side
6. User upserted to MongoDB `users`, session created in `sessions`, tokens in `accounts`
7. Signed session cookie set, redirect to `/dashboard`
8. `hooks.server.ts` validates cookie on every request, populates `event.locals`

## MongoDB collections created by Better Auth

- `users` — user profiles (from Keycloak userinfo)
- `sessions` — active sessions with expiry
- `accounts` — OAuth account links (stores access + refresh tokens)
- `verifications` — (unused in this flow, but created by Better Auth)
