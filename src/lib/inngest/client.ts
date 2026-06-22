import { Inngest } from "inngest";
import { env } from "$env/dynamic/private";

/**
 * The Inngest client — a single shared instance used both to send events
 * (`inngest.send(...)`) and to register functions with the serve handler.
 *
 * Config is read from the runtime environment via `$env/dynamic/private` so it
 * works the same in `bun run dev` and in an adapter-node production build
 * (Vite does NOT copy `.env` into `process.env`, so the Inngest SDK can't read
 * the keys on its own in dev — hence reading them explicitly here).
 *
 *   INNGEST_DEV=1        → talk to the local Dev Server (no keys needed)
 *   INNGEST_BASE_URL     → where to send events in production (the self-hosted server)
 *   INNGEST_EVENT_KEY    → auth for sending events
 */
export const inngest = new Inngest({
	id: "sveltekit-inngest",
	isDev: env.INNGEST_DEV === "1" || env.INNGEST_DEV === "true",
	eventKey: env.INNGEST_EVENT_KEY,
	baseUrl: env.INNGEST_BASE_URL,
	// Required in non-dev mode: the serve handler uses it to verify inbound
	// requests AND to sign introspection responses. Without it, GET /api/inngest
	// fails with `internal_server_error` in cloud mode.
	signingKey: env.INNGEST_SIGNING_KEY
});
