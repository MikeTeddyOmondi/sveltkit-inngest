# Protecting the Inngest Dashboard with Traefik + Keycloak SSO

> **Status: design / runbook for later — not yet implemented.**
> This documents how to put the self-hosted Inngest dashboard behind Keycloak SSO at the proxy
> layer, **without** changing Inngest's own auth or breaking SDK functionality.

## Problem

The self-hosted Inngest server ([../deploy/inngest/compose.yml](../deploy/inngest/compose.yml),
running on thanos, reachable at `inngest.mt0.dev`) publishes port **8288**, which serves **both**
the dashboard UI _and_ the functional Event API on the same port. Today the dashboard is reachable
by anyone with the URL — there is no login. We want to gate **human access to the dashboard** while
leaving machine/SDK traffic untouched.

## Why this is tricky (the key facts)

The dashboard and the SDK share port `8288`, so you can't just "auth the port". From inspecting the
Inngest SDK (`node_modules/inngest`) and server, the traffic splits cleanly by **path**:

| Path on `:8288`                                                               | Who uses it                          | Auth        | Protect at proxy?           |
| ----------------------------------------------------------------------------- | ------------------------------------ | ----------- | --------------------------- |
| `POST /e/{eventKey}`                                                          | SDK sending events (`inngest.send`)  | event key   | **No** — leave open         |
| `POST /fn/register`                                                           | SDK app sync / registration          | signing key | **No** — leave open         |
| `/`, assets, `/v1`, `/v0`/GraphQL, `/runs`, `/apps`, `/events`, `/metrics`, … | the dashboard UI + its API (browser) | none        | **Yes** — gate it           |
| `:8289`                                                                       | connect/executor port                | internal    | keep internal (not proxied) |

So the rule is: **gate everything except `/e/` and `/fn/register`** (those are already protected by
the event/signing keys). Internal SDK traffic from an in-stack app should prefer
`http://inngest:8288` on the Docker network and bypass the proxy entirely.

## Approach — Traefik + oauth2-proxy forwardAuth

Put Traefik in front of Inngest and define **three routers** on `Host(inngest.mt0.dev)`, by priority:

1. **`inngest-api`** (high priority) — `PathPrefix(/e/) || PathPrefix(/fn/register)` → `inngest:8288`,
   **no auth**.
2. **`oauth2-proxy`** (high priority) — `PathPrefix(/oauth2/)` → `oauth2-proxy:4180`, no auth (login +
   callback endpoints).
3. **`inngest-ui`** (catch-all, low priority) — everything else → `inngest:8288`, with the
   **forwardAuth** middleware. Browser sessions carry the oauth2-proxy cookie, so the UI's own XHRs to
   `/v1` etc. pass; unauthenticated humans are redirected to Keycloak.

```
                         Host(inngest.mt0.dev)
                                  │
        ┌─────────────────────────┼──────────────────────────┐
        │ /e/ , /fn/register      │ /oauth2/                  │ everything else
        │ (priority 100, no auth) │ (priority 100)            │ (priority 1, forwardAuth)
        ▼                         ▼                            ▼
   inngest:8288             oauth2-proxy:4180   ──auth?──►  inngest:8288
   (events, sync)           (Keycloak OIDC)                 (dashboard UI + API)
```

`:8289` (connect) is **not** routed through Traefik. (If you later use Connect mode from an external
client, it needs a separate TCP/WebSocket route — out of scope here.)

## Implementation

### 1. `deploy/inngest/compose.yml`

**Add a `traefik` service** — `traefik:v3`, ports `80`/`443`, `providers.docker`
(`exposedByDefault=false`), HTTP→HTTPS redirect, and a TLS certresolver (Let's Encrypt HTTP-01, or
DNS-01 if you stay behind Cloudflare). Joins a new `proxy` network.

```yaml
traefik:
  image: traefik:v3
  container_name: inngest-traefik
  command:
    - --providers.docker=true
    - --providers.docker.exposedbydefault=false
    - --entrypoints.web.address=:80
    - --entrypoints.websecure.address=:443
    - --entrypoints.web.http.redirections.entrypoint.to=websecure
    - --entrypoints.web.http.redirections.entrypoint.scheme=https
    - --certificatesresolvers.le.acme.email=${ACME_EMAIL}
    - --certificatesresolvers.le.acme.tlschallenge=true
    - --certificatesresolvers.le.acme.storage=/letsencrypt/acme.json
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - traefik-acme:/letsencrypt
  restart: unless-stopped
  networks: [proxy]
```

**Add an `oauth2-proxy` service** — authenticates against the Keycloak realm and answers Traefik's
forwardAuth checks.

```yaml
oauth2-proxy:
  image: quay.io/oauth2-proxy/oauth2-proxy:latest
  container_name: inngest-oauth2-proxy
  command:
    - --provider=keycloak-oidc
    - --oidc-issuer-url=${OIDC_ISSUER_URL}
    - --client-id=${OAUTH2_PROXY_CLIENT_ID}
    - --client-secret=${OAUTH2_PROXY_CLIENT_SECRET}
    - --cookie-secret=${OAUTH2_PROXY_COOKIE_SECRET}
    - --cookie-domain=inngest.mt0.dev
    - --email-domain=* # or restrict to your domain
    - --http-address=0.0.0.0:4180
    - --reverse-proxy=true
    - --set-xauthrequest=true
    - --upstream=static://202 # only used as an auth endpoint
    - --whitelist-domain=inngest.mt0.dev
  restart: unless-stopped
  networks: [proxy]
  labels:
    - traefik.enable=true
    - traefik.docker.network=proxy
    # route the login/callback endpoints to oauth2-proxy
    - traefik.http.routers.oauth2-proxy.rule=Host(`inngest.mt0.dev`) && PathPrefix(`/oauth2/`)
    - traefik.http.routers.oauth2-proxy.priority=100
    - traefik.http.routers.oauth2-proxy.entrypoints=websecure
    - traefik.http.routers.oauth2-proxy.tls.certresolver=le
    - traefik.http.services.oauth2-proxy.loadbalancer.server.port=4180
    # the forwardAuth middleware used by the dashboard router
    - traefik.http.middlewares.inngest-auth.forwardauth.address=http://oauth2-proxy:4180/oauth2/auth
    - traefik.http.middlewares.inngest-auth.forwardauth.trustForwardHeader=true
    - traefik.http.middlewares.inngest-auth.forwardauth.authResponseHeaders=X-Auth-Request-User,X-Auth-Request-Email
```

**Modify the `inngest` service** — drop the public `8288` host-port publish (ingress is now via
Traefik), keep `8289` internal, join `proxy`, and add the two router labels:

```yaml
inngest:
  # ...existing command/environment/depends_on...
  # ports:                       # ← remove the public 8288 publish; keep 8289 internal
  #   - "8288:8288"
  networks: [inngest-network, proxy]
  labels:
    - traefik.enable=true
    - traefik.docker.network=proxy
    # open, key-protected SDK endpoints — highest priority
    - traefik.http.routers.inngest-api.rule=Host(`inngest.mt0.dev`) && (PathPrefix(`/e/`) || PathPrefix(`/fn/register`))
    - traefik.http.routers.inngest-api.priority=100
    - traefik.http.routers.inngest-api.entrypoints=websecure
    - traefik.http.routers.inngest-api.tls.certresolver=le
    - traefik.http.routers.inngest-api.service=inngest
    # auth-gated dashboard (catch-all)
    - traefik.http.routers.inngest-ui.rule=Host(`inngest.mt0.dev`)
    - traefik.http.routers.inngest-ui.priority=1
    - traefik.http.routers.inngest-ui.entrypoints=websecure
    - traefik.http.routers.inngest-ui.tls.certresolver=le
    - traefik.http.routers.inngest-ui.middlewares=inngest-auth@docker
    - traefik.http.routers.inngest-ui.service=inngest
    - traefik.http.services.inngest.loadbalancer.server.port=8288
```

**Networks** — add a `proxy` network (Traefik ↔ inngest ↔ oauth2-proxy); keep `inngest-network` for
inngest↔postgres↔redis and internal SDK traffic.

```yaml
networks:
  inngest-network:
    name: inngest-network
    driver: bridge
  proxy:
    name: proxy
    driver: bridge

volumes:
  # ...existing pg / redis...
  traefik-acme:
    name: inngest-traefik-acme
```

### 2. `deploy/inngest/.env.example`

Add (keep the existing `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` untouched):

```dotenv
# Public hostname fronted by Traefik
INNGEST_PUBLIC_HOST=inngest.mt0.dev
ACME_EMAIL=you@example.com

# Keycloak OIDC (oauth2-proxy)
OIDC_ISSUER_URL=https://auth.mt0.dev/realms/locci
OAUTH2_PROXY_CLIENT_ID=inngest-dashboard
OAUTH2_PROXY_CLIENT_SECRET=<from Keycloak client credentials>
# 32-byte random: openssl rand -base64 32
OAUTH2_PROXY_COOKIE_SECRET=
```

### 3. Keycloak client

Admin console → realm `locci` → **Clients** → **Create client**:

| Field                 | Value                                     |
| --------------------- | ----------------------------------------- |
| Client ID             | `inngest-dashboard`                       |
| Client type           | OpenID Connect                            |
| Client authentication | On (confidential)                         |
| Standard flow         | enabled                                   |
| Valid redirect URIs   | `https://inngest.mt0.dev/oauth2/callback` |
| Web origins           | `https://inngest.mt0.dev`                 |

Copy the **Credentials → Client secret** into `OAUTH2_PROXY_CLIENT_SECRET`.

> Restrict who can log in via Keycloak as usual (realm roles / client scopes / group mappers).
> oauth2-proxy's `--email-domain` / `--allowed-group` flags can further constrain access.

## Verification

1. `docker compose up -d` in `deploy/inngest/`; ensure the Keycloak `inngest-dashboard` client exists.
2. **Dashboard is gated** — open `https://inngest.mt0.dev/` → redirected to Keycloak login → after
   sign-in the dashboard loads and its `/v1` data renders (the cookie passes forwardAuth).
3. **Unauthenticated UI blocked** — `curl -sI https://inngest.mt0.dev/` → `302` to Keycloak (or `401`),
   not the app HTML.
4. **SDK still works without auth**:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST \
     https://inngest.mt0.dev/e/$INNGEST_EVENT_KEY \
     -H 'content-type: application/json' \
     -d '{"name":"app/user.signup","data":{"userId":"u1","email":"a@b.co","plan":"pro"}}'
   # → 200, and the event appears in the (logged-in) dashboard
   ```
   Then trigger an app **sync** (the SvelteKit app's `PUT /api/inngest`, or "Sync new app" in the
   dashboard) → registers via `POST /fn/register` with **no** auth prompt; a run executes end-to-end.
5. **No UI path leaks** — `curl -sI https://inngest.mt0.dev/v1/...` (a dashboard API path) without a
   session → redirected/401. Only `/e/` and `/fn/register` are open. If any required SDK sync path
   returns 401, check the Inngest server logs for its path and add it to the `inngest-api` router rule.

## Notes

- **Internal SDK traffic** (an app deployed in the same stack) should use `http://inngest:8288` on
  `inngest-network` and bypass Traefik entirely — unaffected by the auth.
- **Cloudflare in front**: if `inngest.mt0.dev` is proxied through Cloudflare, either use Traefik's
  DNS-01 challenge for certs, or terminate TLS at Cloudflare and run Traefik on `web` only. Avoid
  double auth loops by excluding `/oauth2/` and `/e/` from any Cloudflare Access policy.
- **Connect mode** (`:8289`): not covered here; it needs its own TCP/WebSocket route if used by an
  external client.
- This is the proxy-layer equivalent of the "keep the Inngest server behind internal ingress" note in
  [INNGEST_PRODUCTION_THANOS.md](INNGEST_PRODUCTION_THANOS.md).
