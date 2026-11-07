<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { countdown, daysUntil, longDate, urgency } from '#lib/format.js';
	import type { Deadline } from '#lib/types.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let filter = $state('all');
	let showDone = $state(false);
	let adding = $state(false);
	let saving = $state(false);
	let pending = $state<string | null>(null);
	let message = $state<string | null>(null);
	let form = $state(blank());

	function blank() {
		return { title: '', due: '', time: '', subject: '', weight: '', notes: '' };
	}

	const subjectsInUse = $derived(
		[...new Set(data.deadlines.map((d) => d.subject).filter(Boolean))].sort() as string[]
	);
	const visible = $derived(
		data.deadlines.filter((d) => filter === 'all' || d.subject === filter)
	);
	const open = $derived(visible.filter((d) => !d.done));
	const next = $derived(open.find((d) => d.due >= data.today));

	const groups = $derived.by(() => {
		const g: { title: string; items: Deadline[] }[] = [
			{ title: 'Overdue', items: [] },
			{ title: 'This week', items: [] },
			{ title: 'Next few weeks', items: [] },
			{ title: 'Later', items: [] }
		];
		for (const d of open) {
			const days = daysUntil(d.due, data.today);
			g[days < 0 ? 0 : days <= 7 ? 1 : days <= 31 ? 2 : 3].items.push(d);
		}
		if (showDone) g.push({ title: 'Done', items: visible.filter((d) => d.done).reverse() });
		return g.filter((x) => x.items.length);
	});
	const doneCount = $derived(visible.filter((d) => d.done).length);

	async function send(body: unknown) {
		const res = await fetch('/api/deadlines', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) throw new Error((await res.text()) || 'Could not save');
		await invalidateAll();
	}

	async function add(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		message = null;
		try {
			await send({ action: 'add', deadline: form });
			form = blank();
			adding = false;
		} catch (err) {
			message = (err as Error).message;
		} finally {
			saving = false;
		}
	}

	async function act(d: Deadline, action: 'toggle' | 'delete') {
		if (action === 'delete' && !confirm(`Remove "${d.title}" from the deadlines?`)) return;
		pending = d.id;
		message = null;
		try {
			await send(action === 'toggle' ? { action, id: d.id, done: !d.done } : { action, id: d.id });
		} catch (err) {
			message = (err as Error).message;
		} finally {
			pending = null;
		}
	}

	const sourceUrl = (path: string) => `${data.repoUrl}/blob/${data.branch}/${path}`;
	const day = (iso: string) => new Date(`${iso}T12:00:00`).getDate();
	const month = (iso: string) =>
		new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { month: 'short' });
</script>

<div class="head">
	<div>
		<h1 class="display">Deadlines</h1>
		<p class="muted">Every hand-in in one place. Project deadlines come from each project's brief.</p>
	</div>
	<button class="btn primary" onclick={() => (adding = !adding)}>
		{adding ? 'Cancel' : '+ Add deadline'}
	</button>
</div>

{#if adding}
	<form class="card add" onsubmit={add}>
		<label class="field title">
			What's due
			<input class="input" bind:value={form.title} required placeholder="Marketing midterm exam" />
		</label>
		<label class="field">
			Date
			<input class="input" type="date" bind:value={form.due} required />
		</label>
		<label class="field">
			Time
			<input class="input" type="time" bind:value={form.time} />
		</label>
		<label class="field">
			Subject
			<input class="input" bind:value={form.subject} list="subjects" placeholder="Marketing" />
			<datalist id="subjects">
				{#each data.subjects as s}<option value={s}></option>{/each}
			</datalist>
		</label>
		<label class="field">
			Weight
			<input class="input" bind:value={form.weight} placeholder="30%" />
		</label>
		<label class="field notes">
			Notes
			<input class="input" bind:value={form.notes} placeholder="Room, format, what to bring…" />
		</label>
		<div class="add-actions">
			<button class="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save deadline'}</button>
		</div>
	</form>
{/if}

{#if message}<p class="error" role="alert">{message}</p>{/if}

{#if next}
	{@const days = daysUntil(next.due, data.today)}
	<section class="hero card {urgency(days, false)}">
		<div>
			<span class="label">Next up</span>
			<h2>{next.title}</h2>
			<p class="muted">
				{longDate(next.due)}{next.time ? `, ${next.time}` : ''}
				{#if next.subject}· {next.subject}{/if}
				{#if next.weight}· {next.weight} of the grade{/if}
			</p>
		</div>
		<div class="big">
			{#if days === 0}
				<strong>Today</strong>
			{:else}
				<strong>{days}</strong><span>day{days === 1 ? '' : 's'} left</span>
			{/if}
		</div>
	</section>
{/if}

<div class="filters">
	<div class="chips">
		<button class="chip" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
		{#each subjectsInUse as s}
			<button class="chip" aria-pressed={filter === s} onclick={() => (filter = s)}>{s}</button>
		{/each}
	</div>
	{#if doneCount}
		<label class="toggle">
			<input type="checkbox" bind:checked={showDone} />
			Show done ({doneCount})
		</label>
	{/if}
</div>

{#each groups as group}
	<section class="group">
		<h3 class="label">{group.title}</h3>
		<ul>
			{#each group.items as d (d.id)}
				{@const days = daysUntil(d.due, data.today)}
				<li class="row card {urgency(days, d.done)}" class:busy={pending === d.id}>
					<div class="date">
						<span class="d">{day(d.due)}</span>
						<span class="m">{month(d.due)}</span>
					</div>
					<div class="body">
						<span class="title-text">{d.title}</span>
						<span class="sub">
							{#if d.subject}<span class="tag">{d.subject}</span>{/if}
							{#if d.weight}<span>{d.weight}</span>{/if}
							{#if d.time}<span>{d.time}</span>{/if}
							{#if d.kind === 'project'}
								<a href={sourceUrl(d.source)} target="_blank" rel="noreferrer">Group project ↗</a>
							{:else if d.addedBy}
								<span>added by {d.addedBy}</span>
							{/if}
						</span>
						{#if d.notes}<span class="notes-text">{d.notes}</span>{/if}
					</div>
					<span class="pill">{d.done ? (d.kind === 'project' ? 'Submitted' : 'Done') : countdown(days)}</span>
					<div class="row-actions">
						<button
							class="check"
							aria-pressed={d.done}
							title={d.done ? 'Mark as open' : d.kind === 'project' ? 'Mark submitted' : 'Mark done'}
							disabled={pending !== null}
							onclick={() => act(d, 'toggle')}
						>
							<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
								<path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
							<span class="sr-only">{d.done ? 'Mark as open' : 'Mark done'}</span>
						</button>
						{#if d.kind === 'deadline'}
							<button class="del" title="Remove" disabled={pending !== null} onclick={() => act(d, 'delete')}>
								×<span class="sr-only">Remove {d.title}</span>
							</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	</section>
{:else}
	<div class="card empty">
		<p><strong>Nothing coming up.</strong></p>
		<p class="muted">Add exams and hand-ins with "Add deadline". Group projects appear here once their brief has a <code>due:</code> date.</p>
	</div>
{/each}

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 16px;
		margin-bottom: 24px;
	}
	.head h1 {
		font-size: 44px;
		line-height: 1.1;
	}
	.head p {
		margin: 8px 0 0;
	}

	.add {
		display: grid;
		grid-template-columns: 2fr 1fr 0.8fr;
		gap: 14px;
		padding: 20px;
		margin-bottom: 20px;
	}
	.add .title {
		grid-column: span 3;
	}
	.add .notes {
		grid-column: span 2;
	}
	.add-actions {
		grid-column: span 3;
		display: flex;
		justify-content: flex-end;
	}

	.error {
		padding: 10px 14px;
		border-radius: 10px;
		background: var(--danger-soft);
		color: var(--danger);
	}

	.hero {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 20px;
		padding: 24px 28px;
		margin-bottom: 24px;
		border-left: 5px solid var(--accent);
	}
	.hero.soon {
		border-left-color: var(--danger);
	}
	.hero.near {
		border-left-color: var(--warn);
	}
	.hero h2 {
		font-size: 24px;
		margin: 4px 0;
	}
	.hero p {
		margin: 0;
	}
	.big {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		flex: none;
	}
	.big strong {
		font-family: var(--font-display);
		font-weight: 400;
		font-size: 64px;
		line-height: 1;
	}
	.soon .big strong {
		color: var(--danger);
	}
	.near .big strong {
		color: var(--warn);
	}
	.big span {
		font-size: 13px;
		color: var(--ink-2);
	}

	.filters {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		margin-bottom: 20px;
		flex-wrap: wrap;
	}
	.chips {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.toggle {
		display: flex;
		gap: 8px;
		align-items: center;
		font-size: 14px;
		color: var(--ink-2);
		cursor: pointer;
	}

	.group {
		margin-bottom: 28px;
	}
	.group h3 {
		margin-bottom: 10px;
	}
	.group ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 14px 16px;
		transition: opacity 0.2s;
	}
	.row.busy {
		opacity: 0.5;
	}
	.row.done {
		box-shadow: none;
		background: transparent;
	}
	.row.done .title-text {
		text-decoration: line-through;
		color: var(--ink-3);
	}
	.date {
		flex: none;
		width: 48px;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 6px 0;
		border-radius: 10px;
		background: var(--surface-2);
	}
	.date .d {
		font-size: 20px;
		font-weight: 600;
		line-height: 1.1;
	}
	.date .m {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--ink-2);
	}
	.soon .date,
	.overdue .date {
		background: var(--danger-soft);
	}
	.near .date {
		background: var(--warn-soft);
	}
	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.title-text {
		font-weight: 500;
	}
	.sub {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		font-size: 13px;
		color: var(--ink-3);
	}
	.sub a {
		color: var(--ink-2);
		text-decoration: none;
	}
	.sub a:hover {
		text-decoration: underline;
	}
	.tag {
		color: var(--ink-2);
		font-weight: 500;
	}
	.notes-text {
		font-size: 13px;
		color: var(--ink-2);
	}
	.pill {
		flex: none;
		font-size: 13px;
		font-weight: 500;
		padding: 4px 10px;
		border-radius: 999px;
		background: var(--accent-soft);
		color: var(--accent);
	}
	.soon .pill,
	.overdue .pill {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.near .pill {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.done .pill {
		background: var(--surface-2);
		color: var(--ink-3);
	}
	.row-actions {
		display: flex;
		gap: 4px;
		flex: none;
	}
	.check,
	.del {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: var(--surface);
		cursor: pointer;
		color: var(--ink-3);
	}
	.check:hover {
		color: var(--accent);
		border-color: var(--accent);
	}
	.check[aria-pressed='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}
	.del {
		font-size: 18px;
	}
	.del:hover {
		color: var(--danger);
		border-color: var(--danger);
	}

	.empty {
		padding: 28px;
		text-align: center;
	}
	.empty p {
		margin: 4px 0;
	}

	@media (max-width: 720px) {
		.head {
			flex-direction: column;
			align-items: stretch;
		}
		.head h1 {
			font-size: 34px;
		}
		.add {
			grid-template-columns: 1fr 1fr;
		}
		.add .title,
		.add .notes,
		.add-actions {
			grid-column: span 2;
		}
		.hero {
			padding: 18px;
		}
		.big strong {
			font-size: 44px;
		}
		.row {
			flex-wrap: wrap;
			gap: 12px;
		}
		.body {
			flex-basis: calc(100% - 64px);
		}
		.pill {
			margin-left: 64px;
		}
		.row-actions {
			margin-left: auto;
		}
	}
</style>
