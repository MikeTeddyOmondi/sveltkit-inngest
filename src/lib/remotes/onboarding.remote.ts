import { command } from "$app/server";
import { inngest } from "$lib/inngest/client";
import * as v from "valibot";

/**
 * Trigger style #3 — SvelteKit experimental remote functions.
 *
 * This is the pattern from docs/INNGEST_SVELTEKIT.md (Part 4): a type-safe
 * `command()` callable directly from a component, with Valibot validation at
 * the boundary. Requires `kit.experimental.remoteFunctions: true` in
 * svelte.config.js.
 *
 * In a real app you'd also do an auth check here (e.g. read the session from
 * getRequestEvent()) before sending the event.
 */
const SignupSchema = v.object({
	userId: v.string(),
	email: v.pipe(v.string(), v.email()),
	plan: v.picklist(["free", "pro", "enterprise"])
});

export const triggerOnboarding = command(
	SignupSchema,
	async (data) => {
		await inngest.send({
			name: "app/user.signup",
			data
		});

		return { ok: true };
	}
);
