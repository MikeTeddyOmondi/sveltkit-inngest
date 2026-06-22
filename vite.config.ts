import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		// Vite blocks requests whose Host header isn't allowlisted (returns 403).
		// Allow tunnel hostnames so the self-hosted Inngest server can reach
		// /api/inngest through ngrok/Cloudflare. A leading "." allows all
		// subdomains, so this survives ngrok's rotating subdomains.
		allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.mt0.dev']
	}
});
