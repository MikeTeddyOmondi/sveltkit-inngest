import { inngest } from "../client";
import { env } from "$env/dynamic/private";

/**
 * Multi-step SaaS onboarding pipeline.
 *
 * This single function demonstrates every durable Inngest primitive:
 *
 *   1. `app/user.signup` triggers the run
 *   2. Send welcome email                       — retriable `step.run`
 *   3. Wait up to 24h for `app/email.verified`  — durable pause (survives restarts)
 *   4. Provision tenant (DB schema, Stripe, …)  — retriable `step.run`
 *   5. AI enrichment (summary + risk) in parallel
 *   6. Fan-out notifications (Slack + CRM) in parallel
 *   7. Wait up to 7 days for human approval     — durable pause
 *   8. Complete
 *
 * Each `step.run` block is idempotent (never re-run after success), retriable
 * (exponential backoff up to `retries`), and persisted between resumptions.
 */
export const onboardingWorkflow = inngest.createFunction(
	{
		id: "user-onboarding",
		retries: 5,
		concurrency: { limit: 10, key: "event.data.userId" },
		triggers: [{ event: "app/user.signup" }]
	},
	async ({ event, step }) => {
		const { userId } = event.data as {
			userId: string;
			email: string;
			plan: "free" | "pro" | "enterprise";
		};

		// Step 1: Welcome email — retried automatically on failure.
		await step.run("send-welcome", async () => {
			// call your email provider here (Resend, Africa's Talking, …)
			return { sent: true };
		});

		// Step 2: Durable pause — survives server restarts, deploys, crashes.
		// Only resumes for this user's `app/email.verified` event (matched by userId).
		const verified = await step.waitForEvent("wait-for-verify", {
			event: "app/email.verified",
			match: "data.userId",
			timeout: "10s" //"24h"
		});

		if (!verified) {
			await step.run("mark-expired", () => ({ status: "expired" }));
			return { status: "expired", userId };
		}

		// Step 3: Provision resources.
		const tenant = await step.run("provision-tenant", async () => {
			// create DB schema, Stripe customer, etc.
			return { tenantId: `tnt_${userId}` };
		});

		// Step 4: Parallel AI enrichment — both steps run concurrently.
		const [summary, risk] = await Promise.all([
			step.run("ai-summary", async () => ({ summary: "AI generated summary" })),
			step.run("risk-score", async () => ({ score: 42 }))
		]);

		// Step 5: Fan-out notifications — Slack (if configured) + CRM sync.
		await Promise.all([
			step.run("notify-slack", async () => {
				// Emulated Slack webhook — points at our own /api/mock/slack endpoint.
				// SLACK_WEBHOOK is read at runtime via $env/dynamic/private.
				const webhook = env.SLACK_WEBHOOK;
				if (!webhook) return { skipped: true };
				const res = await fetch(webhook, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ text: `New onboarding: ${userId}` })
				});
				return { notified: true, status: res.status };
			}),
			step.run("sync-crm", () => ({ synced: true }))
		]);

		// Step 6: Human approval gate — waits up to 7 days.
		await step.waitForEvent("wait-approval", {
			event: "app/onboarding.approved",
			match: "data.userId",
			timeout: "7s"
		});

		return { status: "completed", tenantId: tenant.tenantId, summary, risk };
	}
);
