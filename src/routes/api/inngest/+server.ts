import { serve } from "inngest/sveltekit";
import { inngest } from "$lib/inngest/client";
import { onboardingWorkflow } from "$lib/inngest/functions";
import { env } from "$env/dynamic/private";

// This single endpoint handles everything Inngest needs:
//   GET  — introspection / function registration
//   POST — function execution (Inngest calls back to run your steps)
//   PUT  — app sync / registration with the Inngest server
const handler = serve({
	client: inngest,
	functions: [onboardingWorkflow],
	// The origin the Inngest server calls back to in order to RUN functions.
	// It must be reachable from the server — when the server runs on another
	// host (e.g. thanos), this must be this app's LAN/public URL, NOT localhost.
	// Set INNGEST_SERVE_HOST in .env, e.g. http://192.168.0.16:5173 (LAN dev) or
	// your Cloudflare Tunnel hostname in production.
	serveOrigin: env.INNGEST_SERVE_HOST
});

export const GET = handler.GET;
export const POST = handler.POST;
export const PUT = handler.PUT;
