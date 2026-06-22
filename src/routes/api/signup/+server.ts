import { json, type RequestHandler } from "@sveltejs/kit";
import { inngest } from "$lib/inngest/client";

/**
 * Trigger style #1 — plain API route.
 *
 * Mirrors the official SvelteKit / Express examples: accept a JSON body and
 * fire the `app/user.signup` event. This is the most portable, stable option
 * (no experimental flags) and is ideal for webhooks and external callers.
 *
 *   curl -X POST localhost:5173/api/signup \
 *     -H 'content-type: application/json' \
 *     -d '{"userId":"u1","email":"a@b.co","plan":"pro"}'
 */
export const POST: RequestHandler = async ({ request }) => {
	const { userId, email, plan } = await request.json();

	if (!userId || !email || !plan) {
		return json({ ok: false, error: "userId, email and plan are required" }, { status: 400 });
	}

	await inngest.send({
		name: "app/user.signup",
		data: { userId, email, plan }
	});

	return json({ ok: true });
};
