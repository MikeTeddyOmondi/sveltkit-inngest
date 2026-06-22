import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		// Enables `command()` / `query()` remote functions used by
		// src/lib/remotes/*.remote.ts (trigger style #3 in the Inngest demo).
		experimental: {
			remoteFunctions: true
		}
	},
	compilerOptions: {
		// Required by SvelteKit remote functions (top-level await in .remote.ts).
		experimental: {
			async: true
		}
	},
};

export default config;
