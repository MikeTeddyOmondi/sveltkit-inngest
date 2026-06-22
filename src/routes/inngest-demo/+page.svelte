<script lang="ts">
	import { enhance } from '$app/forms';
	import { triggerOnboarding } from '$lib/remotes/onboarding.remote';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let userId = $state('u_123');
	let email = $state('user@example.com');
	let plan = $state<'free' | 'pro' | 'enterprise'>('pro');

	let apiResult = $state('');
	let remoteResult = $state('');

	// Trigger style #1 — plain API route via fetch.
	async function signupViaApi() {
		apiResult = '…';
		const res = await fetch('/api/signup', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ userId, email, plan })
		});
		apiResult = JSON.stringify(await res.json());
	}

	// Trigger style #3 — experimental remote function.
	async function signupViaRemote() {
		remoteResult = '…';
		try {
			const result = await triggerOnboarding({ userId, email, plan });
			remoteResult = JSON.stringify(result);
		} catch (e) {
			remoteResult = `error: ${(e as Error).message}`;
		}
	}
</script>

<main>
	<div class="wrap">
		<header>
			<div class="tag">INNGEST</div>
			<h1>Onboarding workflow demo</h1>
			<p class="sub">
				Three ways to fire the same <code>app/user.signup</code> event, then resume the durable
				pauses. Watch each run at <a href="http://localhost:8288" target="_blank">localhost:8288</a>.
			</p>
		</header>

		<section class="fields">
			<label>userId<input bind:value={userId} /></label>
			<label>email<input bind:value={email} /></label>
			<label>
				plan
				<select bind:value={plan}>
					<option value="free">free</option>
					<option value="pro">pro</option>
					<option value="enterprise">enterprise</option>
				</select>
			</label>
		</section>

		<div class="cards">
			<!-- Style 1: API route -->
			<div class="card">
				<span class="card-num">01</span>
				<h2>API route</h2>
				<p class="hint">POST /api/signup → inngest.send()</p>
				<button onclick={signupViaApi}>Signup via API</button>
				{#if apiResult}<pre>{apiResult}</pre>{/if}
			</div>

			<!-- Style 2: form action -->
			<div class="card">
				<span class="card-num">02</span>
				<h2>Form action</h2>
				<p class="hint">?/signup → inngest.send()</p>
				<form method="POST" action="?/signup" use:enhance>
					<input type="hidden" name="userId" value={userId} />
					<input type="hidden" name="email" value={email} />
					<input type="hidden" name="plan" value={plan} />
					<button type="submit">Signup via form</button>
				</form>
				{#if form?.action === 'signup'}<pre>{JSON.stringify(form)}</pre>{/if}
			</div>

			<!-- Style 3: remote function -->
			<div class="card">
				<span class="card-num">03</span>
				<h2>Remote function</h2>
				<p class="hint">triggerOnboarding() — experimental</p>
				<button onclick={signupViaRemote}>Signup via remote</button>
				{#if remoteResult}<pre>{remoteResult}</pre>{/if}
			</div>
		</div>

		<section class="resume">
			<h2>Resume the durable pauses</h2>
			<p class="hint">Run a signup first, then fire these to advance the same userId's workflow.</p>
			<div class="resume-actions">
				<form method="POST" action="?/verify" use:enhance>
					<input type="hidden" name="userId" value={userId} />
					<button type="submit" class="ghost">Fire app/email.verified</button>
				</form>
				<form method="POST" action="?/approve" use:enhance>
					<input type="hidden" name="userId" value={userId} />
					<button type="submit" class="ghost">Fire app/onboarding.approved</button>
				</form>
			</div>
			{#if form && (form.action === 'verify' || form.action === 'approve')}
				<pre>{JSON.stringify(form)}</pre>
			{/if}
			{#if form?.error}<pre class="err">{form.error}</pre>{/if}
		</section>
	</div>
</main>

<style>
	main {
		min-height: 100vh;
		background: var(--paper, #f6f5f2);
		color: var(--ink, #16140f);
		padding: 3rem 1.5rem;
		font-family: var(--sans, system-ui, sans-serif);
	}
	.wrap {
		max-width: 920px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}
	.tag {
		font-family: var(--mono, monospace);
		font-size: 0.65rem;
		letter-spacing: 0.15em;
		color: var(--accent, #e8450a);
		font-weight: 600;
	}
	h1 {
		font-size: clamp(1.8rem, 4vw, 2.6rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		margin: 0.4rem 0;
	}
	.sub {
		font-family: var(--mono, monospace);
		font-size: 0.8rem;
		color: var(--ink-3, #555);
		line-height: 1.7;
	}
	code {
		color: var(--accent, #e8450a);
		background: rgba(232, 69, 10, 0.06);
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
	}
	.fields {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-family: var(--mono, monospace);
		font-size: 0.7rem;
		color: var(--ink-3, #555);
		flex: 1;
		min-width: 160px;
	}
	input,
	select {
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--paper-3, #ddd);
		border-radius: var(--radius, 8px);
		background: white;
		font-size: 0.85rem;
		font-family: var(--mono, monospace);
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 1rem;
	}
	.card {
		background: white;
		border: 1px solid var(--paper-3, #ddd);
		border-radius: var(--radius-lg, 12px);
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		position: relative;
	}
	.card-num {
		font-family: var(--mono, monospace);
		font-size: 0.6rem;
		color: var(--accent, #e8450a);
		font-weight: 600;
	}
	.card h2,
	.resume h2 {
		font-size: 1.1rem;
		font-weight: 700;
		margin: 0;
	}
	.hint {
		font-family: var(--mono, monospace);
		font-size: 0.7rem;
		color: var(--ink-3, #777);
		margin: 0;
	}
	button {
		background: var(--ink, #16140f);
		color: var(--paper, #f6f5f2);
		border: none;
		border-radius: var(--radius, 8px);
		padding: 0.7rem 1rem;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}
	button:hover {
		background: var(--accent, #e8450a);
	}
	button.ghost {
		background: white;
		color: var(--ink, #16140f);
		border: 1px solid var(--paper-3, #ddd);
	}
	button.ghost:hover {
		border-color: var(--accent, #e8450a);
		color: var(--accent, #e8450a);
		background: white;
	}
	pre {
		background: var(--paper-2, #efeee9);
		border-radius: var(--radius, 8px);
		padding: 0.6rem 0.75rem;
		font-size: 0.7rem;
		overflow-x: auto;
		margin: 0;
		white-space: pre-wrap;
		word-break: break-all;
	}
	pre.err {
		background: #fff0ed;
		color: #b03010;
	}
	.resume {
		background: white;
		border: 1px solid var(--paper-3, #ddd);
		border-radius: var(--radius-lg, 12px);
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.resume-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
</style>
