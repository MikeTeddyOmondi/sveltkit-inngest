<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let signingOut = $state(false);
	let copied = $state('');

	async function signOut() {
		signingOut = true;
		await authClient.signOut();
		goto('/');
	}

	function copyToClipboard(text: string, key: string) {
		navigator.clipboard.writeText(text).then(() => {
			copied = key;
			setTimeout(() => (copied = ''), 2000);
		});
	}

	// Format ISO date to readable
	function fmt(iso: string | Date | undefined | null) {
		if (!iso) return '—';
		return new Date(iso).toLocaleString('en-KE', {
			dateStyle: 'medium',
			timeStyle: 'short',
		});
	}

	const sessionFields = $derived([
		{ label: 'Session ID', value: data.session?.id, mono: true },
		{ label: 'User ID', value: data.user?.id, mono: true },
		{ label: 'Created at', value: fmt(data.session?.createdAt) },
		{ label: 'Expires at', value: fmt(data.session?.expiresAt) },
	]);

	const userFields = $derived([
		{ label: 'Name', value: data.user?.name },
		{ label: 'Email', value: data.user?.email },
		{ label: 'Email verified', value: data.user?.emailVerified ? 'Yes ✓' : 'No' },
		{ label: 'Image', value: data.user?.image ?? 'Not provided' },
	]);
</script>

<div class="shell">
	<!-- Sidebar -->
	<aside class="sidebar">
		<div class="sidebar-top">
			<div class="brand">
				<span class="logo-mark">L</span>
				<span class="brand-name">LOCCI</span>
			</div>

			<nav class="nav">
				<a href="/dashboard" class="nav-item active">
					<span class="nav-icon">◈</span>
					Dashboard
				</a>
				<a href="/" class="nav-item">
					<span class="nav-icon">←</span>
					Home
				</a>
			</nav>
		</div>

		<div class="sidebar-bottom">
			<div class="user-chip">
				<div class="avatar">
					{#if data.user?.image}
						<img src={data.user.image} alt={data.user.name ?? ''} />
					{:else}
						<span>{(data.user?.name ?? 'U')[0].toUpperCase()}</span>
					{/if}
				</div>
				<div class="user-meta">
					<span class="user-name">{data.user?.name ?? 'User'}</span>
					<span class="user-email">{data.user?.email ?? ''}</span>
				</div>
			</div>

			<button class="signout-btn" onclick={signOut} disabled={signingOut}>
				{#if signingOut}
					<span class="spinner"></span>
				{:else}
					<span>⏻</span>
				{/if}
				{signingOut ? 'Signing out…' : 'Sign out'}
			</button>
		</div>
	</aside>

	<!-- Main content -->
	<main class="main">
		<header class="page-header">
			<div>
				<div class="page-tag">SESSION ACTIVE</div>
				<h1 class="page-title">Dashboard</h1>
			</div>
			<div class="status-badge">
				<span class="pulse"></span>
				Authenticated via Keycloak
			</div>
		</header>

		<div class="content-grid">

			<!-- User info card -->
			<section class="card">
				<div class="card-head">
					<h2>User profile</h2>
					<span class="card-tag">from Keycloak userinfo</span>
				</div>
				<div class="field-list">
					{#each userFields as field}
						<div class="field-row">
							<span class="field-label">{field.label}</span>
							<span class="field-value">{field.value ?? '—'}</span>
						</div>
					{/each}
				</div>
			</section>

			<!-- Session card -->
			<section class="card">
				<div class="card-head">
					<h2>Session</h2>
					<span class="card-tag">stored in MongoDB</span>
				</div>
				<div class="field-list">
					{#each sessionFields as field}
						<div class="field-row">
							<span class="field-label">{field.label}</span>
							{#if field.mono && field.value}
								<button
									class="copy-value"
									onclick={() => copyToClipboard(field.value!, field.label)}
									title="Copy"
								>
									<code>{field.value}</code>
									<span class="copy-icon">{copied === field.label ? '✓' : '⎘'}</span>
								</button>
							{:else}
								<span class="field-value">{field.value ?? '—'}</span>
							{/if}
						</div>
					{/each}
				</div>
			</section>

			<!-- Raw session JSON card -->
			<section class="card card-wide">
				<div class="card-head">
					<h2>Raw session object</h2>
					<button
						class="copy-btn"
						onclick={() => copyToClipboard(JSON.stringify(data.session, null, 2), 'raw')}
					>
						{copied === 'raw' ? '✓ Copied' : '⎘ Copy JSON'}
					</button>
				</div>
				<div class="code-block">
					<pre>{JSON.stringify(data.session, null, 2)}</pre>
				</div>
			</section>

			<!-- Raw user JSON -->
			<section class="card card-wide">
				<div class="card-head">
					<h2>Raw user object</h2>
					<button
						class="copy-btn"
						onclick={() => copyToClipboard(JSON.stringify(data.user, null, 2), 'user')}
					>
						{copied === 'user' ? '✓ Copied' : '⎘ Copy JSON'}
					</button>
				</div>
				<div class="code-block">
					<pre>{JSON.stringify(data.user, null, 2)}</pre>
				</div>
			</section>

			<!-- Architecture note -->
			<section class="card card-wide arch-card">
				<div class="card-head">
					<h2>How this works</h2>
					<span class="card-tag">architecture</span>
				</div>
				<div class="arch-grid">
					<div class="arch-step">
						<div class="arch-num">01</div>
						<div class="arch-label">PKCE Redirect</div>
						<div class="arch-desc">
							<code>authClient.signIn.oauth2()</code> hits <code>/api/auth/sign-in/oauth2</code>.
							Better Auth generates a code verifier + challenge, stores them in a cookie, and redirects to your Keycloak realm's
							<code>/protocol/openid-connect/auth</code>.
						</div>
					</div>
					<div class="arch-step">
						<div class="arch-num">02</div>
						<div class="arch-label">Token Exchange</div>
						<div class="arch-desc">
							Keycloak calls back to <code>/api/auth/oauth2/callback/keycloak</code> with the code.
							Better Auth exchanges it server-side for access + refresh tokens using the PKCE verifier.
						</div>
					</div>
					<div class="arch-step">
						<div class="arch-num">03</div>
						<div class="arch-label">MongoDB Session</div>
						<div class="arch-desc">
							User is upserted into the <code>users</code> collection, a session is created in
							<code>sessions</code>, and the account link (with tokens) goes into <code>accounts</code>.
							A signed session cookie is set.
						</div>
					</div>
					<div class="arch-step">
						<div class="arch-num">04</div>
						<div class="arch-label">hooks.server.ts</div>
						<div class="arch-desc">
							On every request, <code>auth.api.getSession()</code> validates the cookie and populates
							<code>event.locals.user</code> and <code>event.locals.session</code> — used here to
							protect this route.
						</div>
					</div>
				</div>
			</section>
		</div>
	</main>
</div>

<style>
	.shell {
		display: flex;
		min-height: 100vh;
	}

	/* SIDEBAR */
	.sidebar {
		width: 220px;
		flex-shrink: 0;
		background: var(--ink);
		color: var(--paper);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 1.75rem 1.25rem;
		position: sticky;
		top: 0;
		height: 100vh;
	}

	.sidebar-top {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.logo-mark {
		width: 28px;
		height: 28px;
		background: var(--accent);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.85rem;
		font-weight: 800;
		border-radius: var(--radius);
		flex-shrink: 0;
	}

	.brand-name {
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.2em;
		color: var(--ink-3);
	}

	.nav {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 0.75rem;
		border-radius: var(--radius);
		font-size: 0.82rem;
		font-weight: 500;
		color: var(--ink-3);
		transition: color 0.1s, background 0.1s;
	}

	.nav-item:hover {
		color: var(--paper);
		background: rgba(255,255,255,0.06);
	}

	.nav-item.active {
		color: var(--paper);
		background: rgba(255,255,255,0.08);
	}

	.nav-icon {
		font-size: 0.75rem;
		flex-shrink: 0;
	}

	.sidebar-bottom {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.user-chip {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.6rem;
		background: rgba(255,255,255,0.05);
		border-radius: var(--radius);
		border: 1px solid rgba(255,255,255,0.07);
		overflow: hidden;
	}

	.avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--accent);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		font-weight: 700;
		color: white;
		flex-shrink: 0;
		overflow: hidden;
	}

	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.user-meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.user-name {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--paper);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.user-email {
		font-size: 0.65rem;
		font-family: var(--mono);
		color: var(--ink-3);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.signout-btn {
		width: 100%;
		padding: 0.6rem;
		border-radius: var(--radius);
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--ink-3);
		border: 1px solid rgba(255,255,255,0.08);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		transition: color 0.1s, border-color 0.1s, background 0.1s;
	}

	.signout-btn:hover:not(:disabled) {
		color: #ff6b6b;
		border-color: rgba(255,107,107,0.3);
		background: rgba(255,107,107,0.05);
	}

	.signout-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.spinner {
		width: 12px;
		height: 12px;
		border: 1.5px solid rgba(255,255,255,0.2);
		border-top-color: currentColor;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* MAIN */
	.main {
		flex: 1;
		padding: 2.5rem 2.5rem 4rem;
		overflow-y: auto;
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 2rem;
	}

	.page-tag {
		font-family: var(--mono);
		font-size: 0.6rem;
		letter-spacing: 0.15em;
		color: var(--success);
		margin-bottom: 0.3rem;
		font-weight: 500;
	}

	.page-title {
		font-size: 1.75rem;
		font-weight: 800;
		letter-spacing: -0.03em;
		color: var(--ink);
	}

	.status-badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--success-bg);
		color: var(--success);
		border: 1px solid rgba(26, 122, 74, 0.2);
		padding: 0.45rem 0.9rem;
		border-radius: 99px;
		font-size: 0.72rem;
		font-family: var(--mono);
		font-weight: 500;
		margin-top: 0.4rem;
	}

	.pulse {
		width: 7px;
		height: 7px;
		background: var(--success);
		border-radius: 50%;
		animation: pulse 2s ease-in-out infinite;
		flex-shrink: 0;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.5; transform: scale(0.8); }
	}

	/* CARDS */
	.content-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
	}

	.card {
		background: white;
		border: 1px solid var(--paper-3);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.card-wide {
		grid-column: 1 / -1;
	}

	.card-head {
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--paper-2);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.card-head h2 {
		font-size: 0.85rem;
		font-weight: 700;
		letter-spacing: -0.01em;
		color: var(--ink);
	}

	.card-tag {
		font-family: var(--mono);
		font-size: 0.6rem;
		color: var(--ink-3);
		letter-spacing: 0.05em;
	}

	.copy-btn {
		font-family: var(--mono);
		font-size: 0.65rem;
		color: var(--ink-3);
		padding: 0.3rem 0.65rem;
		border: 1px solid var(--paper-3);
		border-radius: var(--radius);
		transition: color 0.1s, border-color 0.1s;
	}

	.copy-btn:hover {
		color: var(--ink);
		border-color: var(--ink-3);
	}

	/* FIELD LIST */
	.field-list {
		padding: 0.5rem 0;
	}

	.field-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.6rem 1.25rem;
		border-bottom: 1px solid var(--paper-2);
	}

	.field-row:last-child {
		border-bottom: none;
	}

	.field-label {
		font-family: var(--mono);
		font-size: 0.7rem;
		color: var(--ink-3);
		flex-shrink: 0;
	}

	.field-value {
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--ink);
		text-align: right;
		word-break: break-all;
	}

	.copy-value {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: var(--paper);
		border: 1px solid var(--paper-3);
		border-radius: var(--radius);
		padding: 0.2rem 0.5rem;
		cursor: pointer;
		transition: border-color 0.1s;
		max-width: 60%;
	}

	.copy-value:hover {
		border-color: var(--ink-3);
	}

	.copy-value code {
		font-size: 0.65rem;
		color: var(--ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 200px;
	}

	.copy-icon {
		font-size: 0.7rem;
		color: var(--ink-3);
		flex-shrink: 0;
	}

	/* CODE BLOCK */
	.code-block {
		background: #0d0d0f;
		overflow: auto;
		max-height: 220px;
	}

	.code-block pre {
		padding: 1.25rem;
		font-family: var(--mono);
		font-size: 0.72rem;
		line-height: 1.7;
		color: #9fefb0;
		white-space: pre;
	}

	/* ARCH CARD */
	.arch-card {}

	.arch-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0;
	}

	.arch-step {
		padding: 1.25rem 1.5rem;
		border-right: 1px solid var(--paper-2);
		border-bottom: 1px solid var(--paper-2);
	}

	.arch-step:nth-child(2n) {
		border-right: none;
	}

	.arch-step:nth-child(3),
	.arch-step:nth-child(4) {
		border-bottom: none;
	}

	.arch-num {
		font-family: var(--mono);
		font-size: 0.6rem;
		color: var(--accent);
		font-weight: 500;
		letter-spacing: 0.1em;
		margin-bottom: 0.4rem;
	}

	.arch-label {
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--ink);
		margin-bottom: 0.5rem;
	}

	.arch-desc {
		font-family: var(--mono);
		font-size: 0.68rem;
		color: var(--ink-3);
		line-height: 1.65;
	}

	.arch-desc code {
		color: var(--accent);
		background: rgba(232,69,10,0.06);
		padding: 0.05rem 0.3rem;
		border-radius: 3px;
	}

	@media (max-width: 900px) {
		.shell {
			flex-direction: column;
		}
		.sidebar {
			width: 100%;
			height: auto;
			position: static;
			flex-direction: row;
			align-items: center;
			padding: 1rem 1.25rem;
		}
		.sidebar-top {
			flex-direction: row;
			align-items: center;
			gap: 1.5rem;
			flex: 1;
		}
		.sidebar-bottom {
			flex-direction: row;
			align-items: center;
		}
		.content-grid {
			grid-template-columns: 1fr;
		}
		.card-wide {
			grid-column: 1;
		}
		.arch-grid {
			grid-template-columns: 1fr;
		}
		.arch-step {
			border-right: none;
		}
		.arch-step:nth-child(3) {
			border-bottom: 1px solid var(--paper-2);
		}
	}
</style>
