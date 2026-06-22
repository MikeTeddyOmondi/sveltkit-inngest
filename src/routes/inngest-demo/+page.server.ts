import { fail, type Actions } from "@sveltejs/kit";
import { inngest } from "$lib/inngest/client";

/**
 * Trigger style #2 — SvelteKit form actions.
 *
 * Idiomatic SvelteKit with progressive enhancement (works without JS). The
 * `signup` action fires the workflow's trigger event; `verify` and `approve`
 * resume the two durable `waitForEvent` pauses so the whole pipeline can be
 * driven from the demo page.
 */
export const actions: Actions = {
	signup: async ({ request }) => {
		const form = await request.formData();
		const userId = String(form.get("userId") ?? "");
		const email = String(form.get("email") ?? "");
		const plan = String(form.get("plan") ?? "free");

		if (!userId || !email) {
			return fail(400, { error: "userId and email are required" });
		}

		await inngest.send({
			name: "app/user.signup",
			data: { userId, email, plan }
		});

		return { ok: true, action: "signup", userId };
	},

	verify: async ({ request }) => {
		const form = await request.formData();
		const userId = String(form.get("userId") ?? "");
		if (!userId) return fail(400, { error: "userId is required" });

		await inngest.send({ name: "app/email.verified", data: { userId } });
		return { ok: true, action: "verify", userId };
	},

	approve: async ({ request }) => {
		const form = await request.formData();
		const userId = String(form.get("userId") ?? "");
		if (!userId) return fail(400, { error: "userId is required" });

		await inngest.send({ name: "app/onboarding.approved", data: { userId } });
		return { ok: true, action: "approve", userId };
	}
};
