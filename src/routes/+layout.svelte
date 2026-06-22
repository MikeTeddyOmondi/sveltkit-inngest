<script lang="ts">
	import type { LayoutData } from './$types';
	let { children, data }: { children: any; data: LayoutData } = $props();
</script>

<svelte:head>
	<title>Locci Auth</title>
</svelte:head>

<style>
	:global(*) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(:root) {
		--ink: #0d0d0f;
		--ink-2: #3a3a45;
		--ink-3: #7a7a8a;
		--paper: #f5f4f0;
		--paper-2: #eceae3;
		--paper-3: #e0ddd3;
		--accent: #e8450a;
		--accent-2: #ff6b35;
		--success: #1a7a4a;
		--success-bg: #e8f5ee;
		--mono: 'DM Mono', monospace;
		--sans: 'Syne', sans-serif;
		--radius: 4px;
		--radius-lg: 8px;
	}

	:global(body) {
		font-family: var(--sans);
		background: var(--paper);
		color: var(--ink);
		min-height: 100vh;
		-webkit-font-smoothing: antialiased;
	}

	:global(a) {
		color: inherit;
		text-decoration: none;
	}

	:global(button) {
		font-family: var(--sans);
		cursor: pointer;
		border: none;
		background: none;
	}

	:global(input) {
		font-family: var(--mono);
	}

	:global(code) {
		font-family: var(--mono);
	}
</style>

{@render children()}
