# Using Inngest for Development and Production workloads

Here is a complete tutorial that combines the official Express quick start with the self-hosting architecture, and upgrades Inngest's "hello world" example into a real-world complex workflow.

We are going to build the example around a **multi-step SaaS onboarding pipeline** (the kind of thing teams actually ship to production), because it forces you to use events, waits, retries, fan-out, and human-in-the-loop — all on your own infrastructure.

---

## Self-Hosting Inngest in Production: Build a Durable SaaS Onboarding Pipeline with Express

> Learn how to run Inngest on your own servers (not Inngest Cloud) and wire it to an Express API for a production-grade workflow. We'll go from `npm init` to a Docker Compose stack with Postgres + Redis, using a complex onboarding flow as the example.

By the end you will have:

- A self-hosted Inngest server running via `inngest start` (not just `dev`)
- An Express app serving functions at `/api/inngest`
- A durable workflow that handles email verification, provisioning, AI enrichment, and human approval — with retries and observability

---

## Why self-host?

Inngest Cloud is the easiest way to start, but since the 1.0 release Inngest is fully open-source and self-hostable. The same binary powers both the Dev Server and production.
Self-hosting gives you:

- **Data residency** — events and step output stay in your VPC (Nairobi, EU, etc.)
- **Single-command deploy** — `inngest start` runs the Event API, Runner, Queue, Executor, State Store, DB, and Dashboard in one process
- **Production persistence** — swap the bundled SQLite for Postgres, and the in-memory Redis for external Redis
- **Kubernetes ready** — official Helm chart with KEDA autoscaling, Prometheus metrics, and secrets management

  > Note: self-hosted instances are community-supported. For SLAs, Inngest offers enterprise support.

---

## Architecture in 30 seconds

The self-hosted server is not just a queue. It contains:

- **Event API** — receives events from your SDK via HTTP
- **Runner** — schedules function runs, resumes `waitForEvent`, handles `cancelOn`
- **Queue** — multi-tenant aware with concurrency, throttling, rate limiting, debouncing
- **Executor** — runs your code via HTTP, writes step state
- **State store + Database** — persists runs (SQLite by default, Postgres for prod)
- **Dashboard UI** — available at `:8288`
  All services run in one Go binary by default, with zero external dependencies.

---

## Part 1 — Bootstrap the Express app

This follows the official Express quick start, but we'll use ESM and TypeScript SDK v4.

```bash
mkdir saas-onboarding && cd saas-onboarding
npm init -y
npm i express inngest
npm i -D tsx nodemon
```

Setup `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "dev": "INNGEST_DEV=1 tsx watch server.js"
  }
}
```

Create `inngest/client.js`:

```js
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "saas-onboarding",
  // in production these come from env
});
```

Create `server.js`:

```js
import express from "express";
import { serve } from "inngest/express";
import { inngest } from "./inngest/client.js";
import { onboardingWorkflow } from "./inngest/functions/onboarding.js";

const app = express();
// Inngest requires JSON body parsing. Raise limit for large payloads.
app.use(express.json({ limit: "1mb" }));

// Serve all Inngest functions
app.use(
  "/api/inngest",
  serve({
    client: inngest,
    functions: [onboardingWorkflow],
  }),
);

// Trigger endpoint
app.post("/api/signup", async (req, res) => {
  const { userId, email, plan } = req.body;
  await inngest.send({
    name: "app/user.signup",
    data: { userId, email, plan },
  });
  res.json({ ok: true });
});

app.listen(3000);
```

Start it: `npm run dev`

---

## Part 2 — The complex workflow

Instead of "hello world", let's build `onboardingWorkflow`:

**Flow:**

1. `app/user.signup` triggers
2. Send welcome email (retry 3x)
3. Wait up to 24h for `app/email.verified` (human action)
4. Provision tenant: create DB, seed data, call Stripe (with exponential backoff)
5. Run AI enrichment in parallel: generate company summary + risk score
6. Fan-out to Slack and CRM
7. Wait for human approval via `app/onboarding.approved`
8. Complete

`inngest/functions/onboarding.js`:

```js
import { inngest } from "../client.js";

export const onboardingWorkflow = inngest.createFunction(
  {
    id: "user-onboarding",
    retries: 5,
    concurrency: { limit: 10, key: "event.data.userId" },
  },
  { event: "app/user.signup" },
  async ({ event, step }) => {
    const { userId, email, plan } = event.data;

    // 1. Welcome email with retry
    await step.run("send-welcome", async () => {
      // call your email provider
      return { sent: true };
    });

    // 2. Wait for verification (durable pause)
    const verified = await step.waitForEvent("wait-for-verify", {
      event: "app/email.verified",
      match: "data.userId",
      timeout: "24h",
    });

    if (!verified) {
      await step.run("mark-expired", () => ({ status: "expired" }));
      return;
    }

    // 3. Provision resources
    const tenant = await step.run("provision-tenant", async () => {
      // create DB schema, Stripe customer
      return { tenantId: `tnt_${userId}` };
    });

    // 4. Parallel AI enrichment
    const [summary, risk] = await Promise.all([
      step.run("ai-summary", async () => ({ summary: "AI generated" })),
      step.run("risk-score", async () => ({ score: 42 })),
    ]);

    // 5. Fan-out
    await Promise.all([
      step.run("notify-slack", () => fetch(process.env.SLACK_WEBHOOK)),
      step.run("sync-crm", () => ({ synced: true })),
    ]);

    // 6. Human approval
    await step.waitForEvent("wait-approval", {
      event: "app/onboarding.approved",
      match: "data.userId",
      timeout: "7d",
    });

    return { tenantId: tenant.tenantId, summary, risk };
  },
);
```

This demonstrates every durable primitive: `step.run`, `step.waitForEvent`, timeouts, concurrency, retries, and parallel execution.

---

## Part 3 — Run locally with Docker (Dev mode)

For local dev, use the Dev Server image:

```bash
docker run -p 8288:8288 -p 8289:8289 \
  inngest/inngest:latest \
  inngest dev -u http://host.docker.internal:3000/api/inngest
```

Open http://localhost:8288 → Functions → you should see `user-onboarding`.

Test:

```bash
curl -X POST http://localhost:3000/api/signup \
  -H "content-type: application/json" \
  -d '{"userId":"u_123","email":"a@b.com","plan":"pro"}'
```

## Part 4 — Self-host for production

`dev` is for laptops. For production, use `inngest start`.

**docker-compose.prod.yml**

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
    build:.
    environment:
      INNGEST_BASE_URL: http://inngest:8288
      INNGEST_EVENT_KEY: ${INNGEST_EVENT_KEY}
      INNGEST_SIGNING_KEY: ${INNGEST_SIGNING_KEY}
      SLACK_WEBHOOK: ${SLACK_WEBHOOK}
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

Start: `docker compose -f docker-compose.prod.yml up -d`

Your SDK now talks to `http://inngest:8288` — no `INNGEST_DEV`. Requests are signed and verified.

---

## Part 5 — Production checklist

1. **Put Inngest behind ingress** — expose 8288 for your app only, not public
2. **Enable metrics** — `GET /metrics` exposes `inngest_queue_depth`. Set `INNGEST_EXPERIMENTAL_PROM_METRICS=1` for per-function counters
3. **Backups** — Postgres holds all history. Redis is ephemeral but can be persisted
4. **Scaling** — for >1 node, deploy the Helm chart. It runs Executor and API as separate deployments with KEDA autoscaling
5. **Security** — rotate signing keys, use network policies, run as non-root (default in Helm)

---

## Part 6 — Testing the full flow locally

With both servers running:

```bash
# 1. signup
curl -X POST localhost:3000/api/signup -d '{"userId":"u1","email":"test@co","plan":"pro"}' -H 'content-type: application/json'

# 2. simulate email verified (from your email webhook)
curl -X POST http://localhost:8288/e/${INNGEST_EVENT_KEY} \
  -d '{"name":"app/email.verified","data":{"userId":"u1"}}' -H 'content-type: application/json'

# 3. approve
curl -X POST http://localhost:8288/e/${INNGEST_EVENT_KEY} \
  -d '{"name":"app/onboarding.approved","data":{"userId":"u1"}}' -H 'content-type: application/json'
```

Watch the run in the Dashboard — you'll see each step pause, resume, and retry automatically.

---

### Key takeaways

- Use `inngest dev` for local iteration, `inngest start` for self-hosted production
- The same Express code works in both — only env vars change
- With Postgres + Redis, a single Docker host can handle thousands of concurrent onboarding workflows durably
- For HA, switch to the Helm chart — no code changes needed

Happy building!

---

**Sources used:**

- Express quick start flow and `serve` handler setup
- Self-hosting architecture, `inngest start`, default SQLite/Redis, Postgres support
- Helm chart production features
- Announcement of self-hosting with single-command deploy
- Dev Server ports and local usage

###### References:

- Express Inngest example: https://www.inngest.com/docs/getting-started/express-quick-start
- Inngest Self Hosting docs: https://www.inngest.com/docs/self-hosting

- Sveltekit Example: https://github.com/inngest/inngest-js/tree/main/examples/framework-sveltekit
- Inngest LLMs Txt: https://www.inngest.com/llms-full.txt

---
