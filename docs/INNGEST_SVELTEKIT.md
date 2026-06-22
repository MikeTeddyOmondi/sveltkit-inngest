# Inngest with SvelteKit: Self-Hosted Durable Workflows

> A complete reference for wiring Inngest into a SvelteKit project — including self-hosting on your own infrastructure, using remote functions as the invocation layer, and a fallback Express sidecar pattern for monorepos.

---

## Package & Links

Inngest's SvelteKit support ships **inside the main `inngest` npm package** as a subpath export — there is no separate package to install.

```bash
pnpm add inngest
```

| Resource | URL |
| --- | --- |
| Serving functions docs | https://www.inngest.com/docs/learn/serving-inngest-functions |
| Official SvelteKit example | https://github.com/inngest/inngest-js/tree/main/examples/framework-sveltekit |
| JSR type docs | https://jsr.io/@inngest/sdk/doc/sveltekit |
| Self-hosting docs | https://www.inngest.com/docs/self-hosting |

---

## Architecture Overview

Inngest is not just a queue. The self-hosted server (`inngest start`) runs all of these in a single Go binary:

- **Event API** — receives events from your SDK via HTTP
- **Runner** — schedules function runs, resumes `waitForEvent`, handles `cancelOn`
- **Queue** — concurrency, throttling, rate limiting, debouncing
- **Executor** — calls your functions over HTTP, writes step state
- **State store + Database** — SQLite by default, Postgres for production
- **Dashboard UI** — available at `:8288`

Your app never runs functions locally — Inngest calls back to your HTTP endpoint. This means SvelteKit's `+server.ts` is a perfect fit.

---

## Part 1 — Inngest Client

`src/lib/inngest/client.ts`:

```ts
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "locci-academy", // unique app ID shown in dashboard
});
```

---

## Part 2 — Serve Handler (`+server.ts`)

Create `src/routes/api/inngest/+server.ts` (note: directory route, not file route):

```ts
import { serve } from "inngest/sveltekit";
import { inngest } from "$lib/inngest/client";
import { onboardingWorkflow } from "$lib/inngest/functions/onboarding";

const handler = serve({
  client: inngest,
  functions: [onboardingWorkflow],
});

export const GET = handler.GET;
export const POST = handler.POST;
export const PUT = handler.PUT; // Inngest uses PUT for sync/registration
```

This single file handles everything: function registration (GET), event execution (POST), and SDK sync (PUT).

> **Important:** SvelteKit's default body size limit may need raising. Inngest can send payloads up to 4 MB. If you hit issues, configure the limit in your adapter (e.g. `@sveltejs/adapter-node` passes `bodySize` to the underlying server).

---

## Part 3 — A Real Workflow

Rather than "hello world", here is a multi-step SaaS onboarding pipeline that demonstrates every durable primitive.

**Flow:**

1. `app/user.signup` triggers
2. Send welcome email (retries automatically)
3. Wait up to 24h for `app/email.verified` (durable pause — survives restarts)
4. Provision tenant: DB schema, Stripe customer
5. AI enrichment in parallel: summary + risk score
6. Fan-out: Slack notification + CRM sync
7. Wait for human approval up to 7 days
8. Complete

`src/lib/inngest/functions/onboarding.ts`:

```ts
import { inngest } from "../client";

export const onboardingWorkflow = inngest.createFunction(
  {
    id: "user-onboarding",
    retries: 5,
    concurrency: { limit: 10, key: "event.data.userId" },
  },
  { event: "app/user.signup" },
  async ({ event, step }) => {
    const { userId, email, plan } = event.data;

    // Step 1: Welcome email — retried automatically on failure
    await step.run("send-welcome", async () => {
      // call your email provider (Africa's Talking, Resend, etc.)
      return { sent: true };
    });

    // Step 2: Durable pause — survives server restarts, deploys, crashes
    const verified = await step.waitForEvent("wait-for-verify", {
      event: "app/email.verified",
      match: "data.userId", // only resumes for this user's event
      timeout: "24h",
    });

    if (!verified) {
      await step.run("mark-expired", () => ({ status: "expired" }));
      return;
    }

    // Step 3: Provision resources
    const tenant = await step.run("provision-tenant", async () => {
      // create DB schema, Stripe customer, etc.
      return { tenantId: `tnt_${userId}` };
    });

    // Step 4: Parallel AI enrichment — both run concurrently
    const [summary, risk] = await Promise.all([
      step.run("ai-summary", async () => ({ summary: "AI generated summary" })),
      step.run("risk-score", async () => ({ score: 42 })),
    ]);

    // Step 5: Fan-out notifications
    await Promise.all([
      step.run("notify-slack", () =>
        fetch(process.env.SLACK_WEBHOOK!, { method: "POST" })
      ),
      step.run("sync-crm", () => ({ synced: true })),
    ]);

    // Step 6: Human approval gate — waits up to 7 days
    await step.waitForEvent("wait-approval", {
      event: "app/onboarding.approved",
      match: "data.userId",
      timeout: "7d",
    });

    return { tenantId: tenant.tenantId, summary, risk };
  }
);
```

Each `step.run` block is:

- **Idempotent** — if the process crashes mid-workflow, already-completed steps are not re-run
- **Retriable** — failed steps retry with exponential backoff up to the `retries` limit
- **Persisted** — step output is stored in the state store between resumptions

---

## Part 4 — Triggering via Remote Functions

Since Locci Academy uses **remote functions exclusively** (no load functions, no API routes except webhooks), the invocation layer is a `.remote.ts` file with Valibot validation.

`src/lib/remotes/onboarding.remote.ts`:

```ts
import { command } from "$app/server";
import { getRequestEvent } from "$app/server";
import { inngest } from "$lib/inngest/client";
import * as v from "valibot";

const SignupSchema = v.object({
  userId: v.string(),
  email: v.pipe(v.string(), v.email()),
  plan: v.picklist(["free", "pro", "enterprise"]),
});

export const triggerOnboarding = command(async (data: unknown) => {
  // Auth check via OpenAuth
  const event = getRequestEvent();
  const token = event?.request.headers.get("authorization")?.split(" ")[1];
  // verify token with your OpenAuth client here...

  const parsed = v.parse(SignupSchema, data);

  await inngest.send({
    name: "app/user.signup",
    data: parsed,
  });

  return { ok: true };
});
```

Svelte component:

```svelte
<script lang="ts">
  import { triggerOnboarding } from "$lib/remotes/onboarding.remote";

  async function handleSignup() {
    const result = await triggerOnboarding({
      userId: "u_123",
      email: "user@example.com",
      plan: "pro",
    });
    console.log(result); // { ok: true }
  }
</script>

<button onclick={handleSignup}>Sign Up</button>
```

You can also send events directly from other remote functions — e.g. from your M-Pesa webhook handler after a successful payment:

```ts
// src/lib/remotes/payment.remote.ts (or your webhook +server.ts)
await inngest.send({
  name: "app/onboarding.approved",
  data: { userId },
});
```

---

## Part 5 — Local Development

Run the Inngest Dev Server alongside your SvelteKit app:

```bash
# Terminal 1 — SvelteKit
INNGEST_DEV=1 pnpm dev

# Terminal 2 — Inngest Dev Server (Docker)
docker run -p 8288:8288 -p 8289:8289 \
  inngest/inngest:latest \
  inngest dev -u http://host.docker.internal:5173/api/inngest
```

Open http://localhost:8288 → Functions → you should see your function listed.

Test the full flow:

```bash
# 1. Trigger signup
curl -X POST http://localhost:8288/e/dev \
  -H "content-type: application/json" \
  -d '{"name":"app/user.signup","data":{"userId":"u1","email":"test@co.ke","plan":"pro"}}'

# 2. Simulate email verified
curl -X POST http://localhost:8288/e/dev \
  -H "content-type: application/json" \
  -d '{"name":"app/email.verified","data":{"userId":"u1"}}'

# 3. Approve onboarding
curl -X POST http://localhost:8288/e/dev \
  -H "content-type: application/json" \
  -d '{"name":"app/onboarding.approved","data":{"userId":"u1"}}'
```

Watch each step pause, resume, and complete in the Dashboard.

---

## Part 6 — Self-Hosted Production (Docker Compose)

`inngest dev` is for laptops. Production uses `inngest start` with external Postgres and Redis.

`docker-compose.prod.yml`:

```yaml
name: "inngest"
services:
  inngest:
    image: inngest/inngest:latest
    command: >
      inngest start
      --postgres-uri=postgresql://inngest:inngest@postgres:5432/inngest
      --redis-uri=redis://redis:6379
    ports:
      - "8288:8288"
      - "8289:8289"
    environment:
      INNGEST_EVENT_KEY: ${INNGEST_EVENT_KEY}
      INNGEST_SIGNING_KEY: ${INNGEST_SIGNING_KEY}
    depends_on:
      - postgres
      - redis

  app:
    build: .
    environment:
      INNGEST_BASE_URL: http://inngest:8288
      INNGEST_EVENT_KEY: ${INNGEST_EVENT_KEY}
      INNGEST_SIGNING_KEY: ${INNGEST_SIGNING_KEY}
    ports:
      - "3000:3000"

  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: inngest
      POSTGRES_PASSWORD: inngest
      POSTGRES_DB: inngest
    volumes:
      - pg:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis:/data

volumes:
  pg:
  redis:
```

Generate keys:

```bash
export INNGEST_EVENT_KEY=$(openssl rand -hex 16)
export INNGEST_SIGNING_KEY=$(openssl rand -hex 32)
```

Start:

```bash
docker compose -f docker-compose.prod.yml up -d
```

In production, **do not set `INNGEST_DEV=1`**. Requests between the Inngest server and your app are signed using `INNGEST_SIGNING_KEY` for mutual verification.

### Deploying on thanos (k3s)

If running behind Cloudflare Tunnels on your homelab, expose only port `8288` internally. Your SvelteKit app (in-cluster) connects to `http://inngest:8288` directly. The public tunnel only needs to reach your SvelteKit app, not the Inngest server.

For the Inngest server to call back to your SvelteKit app, set:

```bash
INNGEST_BASE_URL=http://academy.default.svc.cluster.local:3000
```

Or use the KrakenD gateway URL if routing through it.

---

## Part 7 — Fallback: Express Sidecar Pattern

If you hit issues with the SvelteKit adapter (body parsing, streaming conflicts, edge runtime), the cleanest fallback in a Turborepo monorepo is a separate Express worker that only serves the Inngest handler:

```
apps/
  academy/              ← SvelteKit app
  inngest-worker/       ← Tiny Express app, only serves /api/inngest
packages/
  inngest-fns/          ← Shared functions + client, imported by both
```

`packages/inngest-fns/src/client.ts`:

```ts
import { Inngest } from "inngest";
export const inngest = new Inngest({ id: "locci-academy" });
```

`packages/inngest-fns/src/functions/index.ts`:

```ts
export { onboardingWorkflow } from "./onboarding";
// export more functions here
```

`apps/inngest-worker/src/server.ts`:

```ts
import express from "express";
import { serve } from "inngest/express";
import { inngest } from "@locci/inngest-fns/client";
import { onboardingWorkflow } from "@locci/inngest-fns/functions";

const app = express();
app.use(express.json({ limit: "4mb" }));
app.use("/api/inngest", serve({
  client: inngest,
  functions: [onboardingWorkflow],
}));

app.listen(3001, () => console.log("Inngest worker on :3001"));
```

Your SvelteKit remote functions still call `inngest.send()` directly from `@locci/inngest-fns/client` — the Express sidecar only exists to serve function definitions back to the Inngest server.

---

## Choosing an Approach

| Scenario | Recommendation |
| --- | --- |
| Single SvelteKit app, simple functions | `inngest/sveltekit` adapter in `+server.ts` |
| Functions shared across multiple Locci services | Shared `packages/inngest-fns` + Express sidecar |
| thanos homelab, separate deployment per service | Express sidecar on its own port behind KrakenD |
| Hitting body-size or streaming issues in SK | Express sidecar fallback |

---

## Production Checklist

- [ ] Use `inngest start` not `inngest dev`
- [ ] Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in all environments
- [ ] Do **not** set `INNGEST_DEV=1` in production
- [ ] Put the Inngest server behind internal ingress — not publicly exposed
- [ ] Use Postgres (not default SQLite) for persistence
- [ ] Back up Postgres — it holds all workflow history and step state
- [ ] Redis is ephemeral by default; enable `appendonly yes` if you need durability
- [ ] Enable metrics: `GET /metrics` exposes `inngest_queue_depth`
- [ ] For HA / multi-node: use the official Helm chart with KEDA autoscaling
- [ ] Rotate signing keys on a schedule; use network policies to restrict Inngest↔app traffic

---

## Key Concepts Cheat Sheet

| Primitive | What it does |
| --- | --- |
| `step.run("id", fn)` | Durable step — retried on failure, never re-run after success |
| `step.waitForEvent("id", opts)` | Pauses workflow until a matching event arrives (or timeout) |
| `inngest.send({ name, data })` | Fires an event — can trigger functions or resume `waitForEvent` |
| `retries: N` | Auto-retry with exponential backoff on any step throwing an error |
| `concurrency: { limit, key }` | Limits parallel runs, optionally scoped per-user or per-tenant |
| `timeout: "24h"` | Max wait duration for `waitForEvent`; returns `null` if exceeded |
| `Promise.all([step.run(...)])` | Fan-out — steps run in parallel, workflow waits for all |

---
