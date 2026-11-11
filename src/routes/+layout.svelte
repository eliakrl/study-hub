<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const links = [
		{ href: '/', label: 'Upload' },
		{ href: '/subjects', label: 'Subjects' },
		{ href: '/deadlines', label: 'Deadlines' }
	];
</script>

<svelte:head>
	<link rel="icon" type="image/png" href="/favicon.png" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
	<title>Study Hub</title>
</svelte:head>

{#if data.user}
	<header>
		<div class="bar">
			<a class="brand" href="/">
				<img class="mark" src="/logo.png" alt="" width="28" height="28" />
				<span>Study Hub</span>
			</a>
			<nav>
				{#each links as l}
					<a href={l.href} aria-current={(l.href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(l.href)) ? 'page' : undefined}
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
		width: 28px;
		height: 28px;
		border-radius: 8px;
		object-fit: cover;
		flex: none;
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
		.vault,
		.me img {
			display: none;
		}
		nav {
			gap: 0;
		}
		nav a {
			padding: 6px 8px;
			font-size: 14px;
		}
		main {
			padding: 20px 16px 64px;
		}
	}
</style>
