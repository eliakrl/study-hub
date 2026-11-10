<script lang="ts">
	import { countdown, daysUntil, urgency } from '#lib/format.js';
	import { stepName } from '#lib/types.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<div class="head">
	<h1 class="display">Subjects</h1>
	<p class="muted">Materials, to-dos, decisions and deadlines for each module.</p>
</div>

<div class="grid">
	{#each data.subjects as s (s.slug)}
		{@const p = s.progress}
		{@const pct = p.total ? Math.round((p.done / p.total) * 100) : 0}
		<a class="card subject" href="/subjects/{s.slug}">
			<div class="top">
				<h2>{s.name}</h2>
				{#if s.code}<span class="code">{s.code}</span>{/if}
			</div>
			{#if s.lecturer}<p class="teacher">{s.lecturer}</p>{/if}
			<div class="bar" aria-hidden="true"><div style="width: {pct}%"></div></div>
			<p class="stats">
				{#if p.total}
					<strong>{p.done} of {p.total}</strong> done
				{:else}
					Nothing to track yet
				{/if}
				<span>·</span>
				{s.files} file{s.files === 1 ? '' : 's'}
				{#if p.openTasks}<span>·</span> {p.openTasks} open task{p.openTasks === 1 ? '' : 's'}{/if}
			</p>
			{#if p.next}
				{@const days = daysUntil(p.next.due, data.today)}
				<p class="next {urgency(days, false)}">
					<span class="pill">{countdown(days)}</span>
					{stepName(p.next.step)} · {p.next.title}
				</p>
			{/if}
		</a>
	{:else}
		<div class="card empty">
			<p><strong>No subjects yet.</strong></p>
			<p class="muted">Upload a file to a new subject on the <a href="/">Upload</a> page.</p>
		</div>
	{/each}
</div>

<style>
	.head {
		margin-bottom: 24px;
	}
	.head h1 {
		font-size: 40px;
		line-height: 1.1;
	}
	.head p {
		margin: 8px 0 0;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
		gap: 16px;
	}
	.subject {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 20px;
		text-decoration: none;
		transition:
			border-color 0.15s,
			transform 0.15s;
	}
	.subject:hover {
		border-color: var(--ink-3);
		transform: translateY(-1px);
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}
	h2 {
		font-size: 18px;
		letter-spacing: -0.02em;
	}
	.code {
		flex: none;
		font-size: 12px;
		color: var(--ink-3);
		background: var(--surface-2);
		border-radius: 6px;
		padding: 2px 7px;
	}
	.teacher {
		margin: -6px 0 0;
		font-size: 13px;
		color: var(--ink-2);
	}
	.bar {
		height: 6px;
		border-radius: 3px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.bar div {
		height: 100%;
		background: var(--accent);
		border-radius: 3px;
	}
	.stats {
		margin: 0;
		font-size: 13px;
		color: var(--ink-2);
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.stats strong {
		color: var(--ink);
		font-weight: 600;
	}
	.next {
		margin: 0;
		font-size: 13px;
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--ink-2);
	}
	.pill {
		flex: none;
		font-size: 12px;
		font-weight: 500;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--accent-soft);
		color: var(--accent);
	}
	.soon .pill {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.near .pill {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.empty {
		padding: 28px;
		text-align: center;
	}
	.empty p {
		margin: 4px 0;
	}
	@media (max-width: 640px) {
		.head h1 {
			font-size: 32px;
		}
	}
</style>
