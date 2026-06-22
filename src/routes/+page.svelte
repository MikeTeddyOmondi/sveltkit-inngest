<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
  import { redirect } from '@sveltejs/kit';

	let { data }: { data: PageData } = $props();

	let loading = $state(false);
	let error = $state('');

	async function loginWithKeycloak() {
		loading = true;
		error = '';
		const { error: err } = await authClient.signIn.oauth2({
			providerId: 'keycloak',
			callbackURL: '/dashboard',
			errorCallbackURL: '/?error=auth_failed',
		});
		if (err) {
			error = err.message ?? 'Authentication failed';
			loading = false;
		}
	}

	// Redirect if already logged in
	if (data.user) {
		redirect(307, '/dashboard');
	}
</script>

<main>
	<div class="grid">
		<div class="left-panel">
			<div class="brand">
				<span class="logo-mark">L</span>
				<span class="brand-name">LOCCI</span>
			</div>

			<div class="hero-text">
				<div class="tag">AUTH</div>
				<h1>Identity<br />infrastructure<br />for Africa.</h1>
				<p class="sub">
					Powered by Better Auth + Keycloak + MongoDB.<br />
					One click. Zero friction.
				</p>
			</div>

			<div class="stack-pills">
				<span class="pill">Better Auth</span>
				<span class="pill">Keycloak OIDC</span>
				<span class="pill">MongoDB</span>
				<span class="pill">SvelteKit</span>
			</div>
		</div>

		<div class="right-panel">
			<div class="card">
				<div class="card-header">
					<div class="card-dot red"></div>
					<div class="card-dot yellow"></div>
					<div class="card-dot green"></div>
					<span class="card-title">auth.locci.cloud</span>
				</div>

				<div class="card-body">
					<h2>Sign in</h2>
					<p class="hint">
						You'll be redirected to your Keycloak realm to authenticate, then brought back here.
					</p>

					{#if error}
						<div class="error-box">
							<span class="error-icon">⚠</span>
							{error}
						</div>
					{/if}

					<button class="keycloak-btn" onclick={loginWithKeycloak} disabled={loading}>
						{#if loading}
							<span class="spinner"></span>
							Redirecting to Keycloak…
						{:else}
							<svg class="kc-icon" viewBox="0 0 24 24" fill="none">
								<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
							Continue with Keycloak
						{/if}
					</button>

					<div class="divider"><span>flow details</span></div>

					<div class="flow-steps">
						<div class="step">
							<span class="step-num">01</span>
							<span class="step-text">PKCE authorization redirect → Keycloak realm</span>
						</div>
						<div class="step">
							<span class="step-num">02</span>
							<span class="step-text">Code exchange → access + refresh tokens</span>
						</div>
						<div class="step">
							<span class="step-num">03</span>
							<span class="step-text">Session stored in MongoDB, cookie set</span>
						</div>
						<div class="step">
							<span class="step-num">04</span>
							<span class="step-text">Redirect to /dashboard with populated locals</span>
						</div>
					</div>
				</div>
			</div>

			<p class="footer-note">
				Callback URL: <code>/api/auth/oauth2/callback/keycloak</code>
			</p>
		</div>
	</div>
</main>

<style>
	main {
		min-height: 100vh;
		display: flex;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		width: 100%;
	}

	/* LEFT PANEL */
	.left-panel {
		background: var(--ink);
		color: var(--paper);
		padding: 3rem;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		position: relative;
		overflow: hidden;
	}

	.left-panel::before {
		content: '';
		position: absolute;
		top: -80px;
		right: -80px;
		width: 320px;
		height: 320px;
		border-radius: 50%;
		background: var(--accent);
		opacity: 0.08;
		pointer-events: none;
	}

	.left-panel::after {
		content: '';
		position: absolute;
		bottom: -60px;
		left: -60px;
		width: 240px;
		height: 240px;
		border-radius: 50%;
		background: var(--accent);
		opacity: 0.05;
		pointer-events: none;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.logo-mark {
		width: 36px;
		height: 36px;
		background: var(--accent);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.1rem;
		font-weight: 800;
		border-radius: var(--radius);
		flex-shrink: 0;
	}

	.brand-name {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.2em;
		color: var(--paper-3);
	}

	.hero-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 1.25rem;
		padding: 3rem 0;
	}

	.tag {
		font-family: var(--mono);
		font-size: 0.65rem;
		letter-spacing: 0.15em;
		color: var(--accent-2);
		font-weight: 500;
	}

	h1 {
		font-size: clamp(2.2rem, 4vw, 3rem);
		font-weight: 800;
		line-height: 1.05;
		letter-spacing: -0.02em;
		color: var(--paper);
	}

	.sub {
		font-size: 0.9rem;
		line-height: 1.7;
		color: var(--ink-3);
		font-family: var(--mono);
		font-weight: 300;
	}

	.stack-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.pill {
		font-family: var(--mono);
		font-size: 0.65rem;
		padding: 0.3rem 0.7rem;
		border: 1px solid rgba(255,255,255,0.12);
		border-radius: 99px;
		color: var(--ink-3);
		letter-spacing: 0.05em;
	}

	/* RIGHT PANEL */
	.right-panel {
		background: var(--paper);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 2rem;
		gap: 1.25rem;
	}

	.card {
		width: 100%;
		max-width: 420px;
		background: white;
		border: 1px solid var(--paper-3);
		border-radius: var(--radius-lg);
		overflow: hidden;
		box-shadow: 0 2px 24px rgba(0,0,0,0.06);
	}

	.card-header {
		background: var(--paper-2);
		border-bottom: 1px solid var(--paper-3);
		padding: 0.75rem 1rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.card-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}
	.card-dot.red { background: #ff5f57; }
	.card-dot.yellow { background: #febc2e; }
	.card-dot.green { background: #28c840; }

	.card-title {
		font-family: var(--mono);
		font-size: 0.7rem;
		color: var(--ink-3);
		margin-left: auto;
	}

	.card-body {
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.card-body h2 {
		font-size: 1.4rem;
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	.hint {
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--ink-3);
		line-height: 1.6;
	}

	.error-box {
		background: #fff0ed;
		border: 1px solid #f5c6bb;
		border-radius: var(--radius);
		padding: 0.75rem 1rem;
		font-family: var(--mono);
		font-size: 0.75rem;
		color: #b03010;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.keycloak-btn {
		width: 100%;
		background: var(--ink);
		color: var(--paper);
		border-radius: var(--radius);
		padding: 0.9rem 1.5rem;
		font-family: var(--sans);
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		transition: background 0.15s, transform 0.1s;
	}

	.keycloak-btn:hover:not(:disabled) {
		background: var(--accent);
	}

	.keycloak-btn:active:not(:disabled) {
		transform: scale(0.99);
	}

	.keycloak-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.kc-icon {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255,255,255,0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.divider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--ink-3);
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--paper-3);
	}

	.divider span {
		font-family: var(--mono);
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.flow-steps {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.step {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
	}

	.step-num {
		font-family: var(--mono);
		font-size: 0.6rem;
		color: var(--accent);
		font-weight: 500;
		flex-shrink: 0;
		letter-spacing: 0.05em;
	}

	.step-text {
		font-family: var(--mono);
		font-size: 0.7rem;
		color: var(--ink-3);
		line-height: 1.5;
	}

	.footer-note {
		font-family: var(--mono);
		font-size: 0.65rem;
		color: var(--ink-3);
		text-align: center;
	}

	.footer-note code {
		color: var(--accent);
		background: rgba(232, 69, 10, 0.06);
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
	}

	@media (max-width: 768px) {
		.grid {
			grid-template-columns: 1fr;
		}
		.left-panel {
			padding: 2rem;
			min-height: 40vh;
		}
	}
</style>
