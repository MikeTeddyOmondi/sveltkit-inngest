import { json, type RequestHandler } from "@sveltejs/kit";

/**
 * Slack webhook emulator.
 *
 * Stands in for a real Slack incoming webhook so the onboarding workflow's
 * `notify-slack` step has a reachable endpoint to POST to in dev. Just logs the
 * payload and returns ok — point `SLACK_WEBHOOK` at this route.
 */
export const POST: RequestHandler = async ({ request }) => {
	const payload = await request.json().catch(() => ({}));
	console.log("[mock-slack] received:", JSON.stringify(payload));
	return json({ ok: true, received: payload });
};
