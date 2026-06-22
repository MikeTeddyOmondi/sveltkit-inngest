import { auth } from '$lib/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';

export async function GET(event) {
	return svelteKitHandler({ event, resolve: () => new Response('not found', { status: 404 }), auth, building });
}

export async function POST(event) {
	return svelteKitHandler({ event, resolve: () => new Response('not found', { status: 404 }), auth, building });
}
