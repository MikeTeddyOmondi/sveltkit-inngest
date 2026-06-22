# Self-Hosting Inngest in Production on thanos

Runbook for running the Inngest server on the **thanos** homelab under `~/src/inngest`, using
`inngest start` (not `inngest dev`) with external Postgres + Redis. Designed to be exposed
through **Cloudflare Tunnels** later.

> Companion to [INNGEST.md](INNGEST.md) and [INNGEST_SVELTEKIT.md](INNGEST_SVELTEKIT.md). The
> compose stack referenced here lives in [`deploy/inngest/`](../deploy/inngest/).

---

## Architecture

The SvelteKit app and the Inngest server are **two separate deployments**:

```
┌────────────────────┐         events (signed)         ┌──────────────────────┐
│  SvelteKit app     │ ──────────────────────────────▶ │  Inngest server      │
│  (adapter-node)    │   inngest.send() → :8288         │  inngest start       │
│  /api/inngest      │ ◀────────────────────────────── │  + Postgres + Redis  │
└────────────────────┘   runs functions (INNGEST_SDK_URL)└──────────────────────┘
```

- The **app** sends events to the Inngest server (`INNGEST_BASE_URL` → `http://inngest:8288`).
- The **server** calls back into the app to execute functions (`INNGEST_SDK_URL` → app's
  `/api/inngest`).
- Both sides share `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` for mutual verification.

The app is **not** part of `deploy/inngest/compose.yml` — deploy it however you already deploy
SvelteKit on thanos; only point its env at this server.

---

## 1. Copy the stack to thanos

From your workstation, in this repo:

```bash
ssh thanos 'mkdir -p ~/src/inngest'
scp deploy/inngest/compose.yml deploy/inngest/.env.example thanos:~/src/inngest/
```

## 2. Generate keys and write `.env`

```bash
ssh thanos
cd ~/src/inngest
cp .env.example .env

# generate the shared keys
echo "INNGEST_EVENT_KEY=$(openssl rand -hex 16)"   # paste into .env
echo "INNGEST_SIGNING_KEY=$(openssl rand -hex 32)" # paste into .env
```

Edit `.env` and also set:

- `POSTGRES_PASSWORD` — a real password.
- `INNGEST_SDK_URL` — the URL the server uses to reach the app's `/api/inngest`
  (e.g. `http://academy:3000/api/inngest` on the homelab network, or via your KrakenD gateway).

## 3. Start the stack

```bash
cd ~/src/inngest
docker compose up -d        # uses the default compose.yml — no -f needed
docker compose ps
docker compose logs -f inngest
```

Dashboard is now on `:8288`. From thanos: `curl -s localhost:8288 | head`.

## 4. Point the SvelteKit app at production

Set these on the **app** deployment (NOT in the Inngest compose), and do **not** set `INNGEST_DEV`:

```env
INNGEST_BASE_URL=http://inngest:8288     # or the homelab/tunnel hostname for the server
INNGEST_EVENT_KEY=<same as server>
INNGEST_SIGNING_KEY=<same as server>
```

Redeploy the app, then trigger a sync so the server learns about `user-onboarding`:

```bash
# from the app host, register the functions with the server
curl -X PUT https://<your-app-host>/api/inngest
```

The function should appear under **Functions** in the dashboard.

## 5. Cloudflare Tunnel (when ready)

Expose only what you need and keep server↔app traffic internal:

- Tunnel the **dashboard** (`:8288`) if you want remote UI access — protect it with Cloudflare
  Access.
- Tunnel the **app** publicly as normal; the app reaches the Inngest server over the internal
  `inngest-network`, so the server itself does not need a public ingress.
- If external producers must send events, expose only the Event API path on `:8288`
  (`/e/<INNGEST_EVENT_KEY>`); never expose the executor port `:8289`.

Example `cloudflared` ingress snippet:

```yaml
ingress:
  - hostname: app.example.com
    service: http://localhost:3000
  - hostname: inngest.example.com      # optional, behind CF Access
    service: http://localhost:8288
  - service: http_status:404
```

---

## Production checklist

- [ ] `inngest start` (not `dev`); `INNGEST_DEV` unset on the app.
- [ ] `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` set identically on server and app.
- [ ] Postgres backed up — it holds all run history and step state
      (`docker exec inngest-postgres pg_dump -U inngest inngest > backup.sql`).
- [ ] Redis `--appendonly yes` (already set in `compose.yml`) if you need queue durability.
- [ ] Executor port `:8289` not publicly exposed.
- [ ] Metrics: `curl localhost:8288/metrics` (e.g. `inngest_queue_depth`).
- [ ] Rotate signing keys on a schedule; restart both sides together.
- [ ] For HA / multi-node, switch to the official Helm chart (no code changes).

---

## Local smoke test of the prod image

You can validate the same stack on your laptop before deploying:

```bash
cd deploy/inngest
cp .env.example .env   # set INNGEST_SDK_URL=http://host.docker.internal:3000/api/inngest
docker compose up -d
open http://localhost:8288
```
