<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const links = [
		{ href: '/', label: 'Upload' },
		{ href: '/deadlines', label: 'Deadlines' }
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Instrument+Serif&display=swap"
		rel="stylesheet"
	/>
	<title>Study Hub</title>
</svelte:head>

{#if data.user}
	<header>
		<div class="bar">
			<a class="brand" href="/">
				<span class="mark" aria-hidden="true">S</span>
				<span>Study Hub</span>
			</a>
			<nav>
				{#each links as l}
					<a href={l.href} aria-current={page.url.pathname === l.href ? 'page' : undefined}
						>{l.label}</a
					>
				{/each}
			</nav>
			<div class="me">
				<a class="vault" href={data.repoUrl} target="_blank" rel="noreferrer">Vault on GitHub ↗</a>
				<img src={data.user.avatar} alt="" width="28" height="28" />
				<form method="POST" action="/auth/logout">
					<button class="signout" title="Sign out {data.user.login}">Sign out</button>
				</form>
			</div>
		</div>
	</header>
{/if}

<main>
	{@render children()}
</main>

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 10;
		background: color-mix(in srgb, var(--bg) 85%, transparent);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid var(--line);
	}

	.bar {
		max-width: 1120px;
		margin: 0 auto;
		height: 60px;
		padding: 0 20px;
		display: flex;
		align-items: center;
		gap: 24px;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 600;
		text-decoration: none;
	}

	.mark {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 8px;
		background: var(--accent);
		color: var(--accent-ink);
		font-family: var(--font-display);
		font-size: 20px;
		line-height: 1;
	}

	nav {
		display: flex;
		gap: 4px;
	}

	nav a {
		padding: 6px 12px;
		border-radius: 8px;
		text-decoration: none;
		color: var(--ink-2);
		font-weight: 500;
	}

	nav a:hover {
		color: var(--ink);
		background: var(--surface-2);
	}

	nav a[aria-current='page'] {
		color: var(--ink);
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
	}

	.me {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.vault {
		font-size: 13px;
		color: var(--ink-2);
		text-decoration: none;
	}

	.vault:hover {
		color: var(--ink);
	}

	img {
		border-radius: 50%;
		border: 1px solid var(--line);
	}

	.signout {
		border: 0;
		background: none;
		color: var(--ink-3);
		font-size: 13px;
		cursor: pointer;
		padding: 0;
	}

	.signout:hover {
		color: var(--ink);
	}

	main {
		max-width: 1120px;
		margin: 0 auto;
		padding: 32px 20px 80px;
	}

	@media (max-width: 640px) {
		.bar {
			gap: 12px;
			padding: 0 16px;
		}
		.brand span:last-child,
		.vault {
			display: none;
		}
		main {
			padding: 20px 16px 64px;
		}
	}
</style>
