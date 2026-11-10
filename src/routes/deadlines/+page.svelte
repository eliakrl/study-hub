<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { countdown, daysUntil, longDate, stepDates, urgency } from '#lib/format.js';
	import {
		STEP_TYPES,
		effectiveDue,
		stepName,
		timeline,
		type Assessment,
		type Step,
		type StepType,
		type TimelineItem
	} from '#lib/types.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const NO_SUBJECT = 'No subject';
	const OTHER = '__other';

	let view = $state<'timeline' | 'subjects'>(loadView());
	let filter = $state('all');
	let showDone = $state(false);
	let adding = $state(false);
	let saving = $state(false);
	let pending = $state<string | null>(null);
	let message = $state<string | null>(null);
	let form = $state(blank());

	interface DraftStep {
		type: StepType;
		label: string;
		due: string;
		or: string;
		time: string;
		either: boolean;
	}

	function draftStep(type: StepType = 'submission'): DraftStep {
		return { type, label: '', due: '', or: '', time: '', either: false };
	}

	function blank() {
		return {
			title: '',
			subject: '',
			otherSubject: '',
			weight: '',
			notes: '',
			steps: [draftStep()]
		};
	}

	function loadView() {
		try {
			return localStorage.getItem('sh:deadlines-view') === 'subjects' ? 'subjects' : 'timeline';
		} catch {
			return 'timeline';
		}
	}
	function setView(v: 'timeline' | 'subjects') {
		view = v;
		try {
			localStorage.setItem('sh:deadlines-view', v);
		} catch {}
	}

	const due = (step: Step) => effectiveDue(step, data.today);
	const daysFor = (step: Step) => daysUntil(due(step), data.today);
	const subjectOf = (a: Assessment) => a.subject || NO_SUBJECT;

	const subjectsInUse = $derived([...new Set(data.assessments.map(subjectOf))].sort());
	const visible = $derived(
		data.assessments.filter((a) => filter === 'all' || subjectOf(a) === filter)
	);
	const items = $derived(timeline(visible));
	const open = $derived(items.filter((i) => !i.step.done));
	const next = $derived(open.find((i) => due(i.step) >= data.today));
	const doneCount = $derived(items.length - open.length);

	const groups = $derived.by(() => {
		const g: { title: string; items: TimelineItem[] }[] = [
			{ title: 'Overdue', items: [] },
			{ title: 'This week', items: [] },
			{ title: 'Next few weeks', items: [] },
			{ title: 'Later', items: [] }
		];
		for (const i of open) {
			const days = daysFor(i.step);
			g[days < 0 ? 0 : days <= 7 ? 1 : days <= 31 ? 2 : 3].items.push(i);
		}
		if (showDone) g.push({ title: 'Done', items: items.filter((i) => i.step.done).reverse() });
		return g.filter((x) => x.items.length);
	});

	/** Subjects with their assessments, the one with the nearest open step first. */
	const bySubject = $derived.by(() => {
		const map = new Map<string, Assessment[]>();
		for (const a of data.assessments) {
			const k = subjectOf(a);
			if (!map.has(k)) map.set(k, []);
			map.get(k)!.push(a);
		}
		const nextDate = (a: Assessment) =>
			a.steps.filter((s) => !s.done).map(due).sort()[0] ?? '9999';
		return [...map.entries()]
			.map(([subject, list]) => {
				list.sort((x, y) => nextDate(x).localeCompare(nextDate(y)));
				const openSteps = list.flatMap((a) => a.steps.filter((s) => !s.done));
				return { subject, list, open: openSteps.length, next: nextDate(list[0]) };
			})
			.sort((x, y) => x.next.localeCompare(y.next) || x.subject.localeCompare(y.subject));
	});

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
			const subject = form.subject === OTHER ? form.otherSubject : form.subject;
			await send({
				action: 'add',
				deadline: {
					title: form.title,
					subject,
					weight: form.weight,
					notes: form.notes,
					steps: form.steps.map((s) => ({
						type: s.type,
						label: s.type === 'other' ? s.label : '',
						due: s.due,
						or: s.either ? s.or : '',
						time: s.time
					}))
				}
			});
			form = blank();
			adding = false;
		} catch (err) {
			message = (err as Error).message;
		} finally {
			saving = false;
		}
	}

	async function act(body: { action: string; id: string; [k: string]: unknown }, confirmText?: string) {
		if (confirmText && !confirm(confirmText)) return;
		pending = body.id;
		message = null;
		try {
			await send(body);
		} catch (err) {
			message = (err as Error).message;
		} finally {
			pending = null;
		}
	}

	const toggle = (step: Step) => act({ action: 'toggle', id: step.id, done: !step.done });
	const remove = (a: Assessment) =>
		act(
			{ action: 'delete', id: a.id },
			`Remove "${a.title}" and all its dates (${a.steps.length}) from the deadlines?`
		);
	const pick = (step: Step, date: string) => act({ action: 'pick', id: step.id, date });

	const sourceUrl = (path: string) => `${data.repoUrl}/blob/${data.branch}/${path}`;
	const day = (iso: string) => new Date(`${iso}T12:00:00`).getDate();
	const month = (iso: string) =>
		new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { month: 'short' });
	const shortDate = (iso: string) =>
		new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
	const stepLabel = (step: Step) => (step.done ? (step.type === 'submission' ? 'Submitted' : 'Done') : countdown(daysFor(step)));
	const stepTitle = (step: Step) =>
		step.done ? 'Mark as open' : step.type === 'submission' ? 'Mark submitted' : 'Mark done';
</script>

{#snippet check(step: Step)}
	<button
		class="check"
		aria-pressed={step.done}
		title={stepTitle(step)}
		disabled={pending !== null}
		onclick={() => toggle(step)}
	>
		<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
			<path
				d="M3.5 8.5 6.5 11.5 12.5 4.5"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		<span class="sr-only">{stepTitle(step)}</span>
	</button>
{/snippet}

{#snippet picker(a: Assessment, step: Step)}
	{#if step.alt && !step.done && a.kind === 'deadline'}
		<span class="pick">
			Which slot is ours?
			<button disabled={pending !== null} onclick={() => pick(step, step.due)}>{shortDate(step.due)}</button>
			<button disabled={pending !== null} onclick={() => pick(step, step.alt!)}>{shortDate(step.alt)}</button>
		</span>
	{/if}
{/snippet}

<div class="head">
	<div>
		<h1 class="display">Deadlines</h1>
		<p class="muted">
			Every presentation and hand-in, by date or by subject. Group projects come from each
			project's brief.
		</p>
	</div>
	<button class="btn primary" onclick={() => (adding = !adding)}>
		{adding ? 'Cancel' : '+ Add deadline'}
	</button>
</div>

{#if adding}
	<form class="card add" onsubmit={add}>
		<div class="add-grid">
			<label class="field span-2">
				What is it
				<input class="input" bind:value={form.title} required placeholder="CA 1 — Group report" />
			</label>
			<label class="field">
				Subject
				<select class="input" bind:value={form.subject}>
					<option value="">No subject</option>
					{#each data.subjects as s}<option value={s}>{s}</option>{/each}
					<option value={OTHER}>Other…</option>
				</select>
			</label>
			{#if form.subject === OTHER}
				<label class="field">
					Subject name
					<input class="input" bind:value={form.otherSubject} placeholder="Marketing in Action" />
				</label>
			{/if}
			<label class="field">
				Weight
				<input class="input" bind:value={form.weight} placeholder="40%" />
			</label>
			<label class="field span-2">
				Notes
				<input class="input" bind:value={form.notes} placeholder="Format, room, what to bring…" />
			</label>
		</div>

		<div class="steps-head">
			<span class="label">Dates</span>
			<span class="muted small">Add one line per step, e.g. presentation and written submission.</span>
		</div>
		<ul class="draft-steps">
			{#each form.steps as s, i}
				<li>
					<select class="input type" bind:value={s.type} aria-label="Step type">
						{#each STEP_TYPES as t}<option value={t.id}>{t.label}</option>{/each}
					</select>
					{#if s.type === 'other'}
						<input class="input" bind:value={s.label} placeholder="e.g. Peer review" aria-label="Step name" />
					{/if}
					<input class="input date" type="date" bind:value={s.due} required aria-label="Date" />
					{#if s.either}
						<span class="or">or</span>
						<input class="input date" type="date" bind:value={s.or} aria-label="Other possible date" />
					{/if}
					<input class="input time" type="time" bind:value={s.time} aria-label="Time (optional)" />
					<label class="either">
						<input type="checkbox" bind:checked={s.either} /> Slot not fixed yet
					</label>
					{#if form.steps.length > 1}
						<button
							type="button"
							class="x"
							aria-label="Remove this date"
							onclick={() => form.steps.splice(i, 1)}>×</button
						>
					{/if}
				</li>
			{/each}
		</ul>
		<div class="add-actions">
			<div class="more">
				<button type="button" class="chip" onclick={() => form.steps.push(draftStep('presentation'))}>
					+ Presentation
				</button>
				<button type="button" class="chip" onclick={() => form.steps.push(draftStep('submission'))}>
					+ Submission
				</button>
				<button type="button" class="chip" onclick={() => form.steps.push(draftStep('other'))}>
					+ Other date
				</button>
			</div>
			<button class="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save deadline'}</button>
		</div>
	</form>
{/if}

{#if message}<p class="error" role="alert">{message}</p>{/if}

{#if next}
	{@const days = daysFor(next.step)}
	<section class="hero card {urgency(days, false)}">
		<div>
			<span class="label">Next up · {stepName(next.step)}</span>
			<h2>{next.assessment.title}</h2>
			<p class="muted">
				{stepDates(due(next.step), next.step.alt && next.step.due >= data.today ? next.step.alt : undefined)}{next.step.time ? `, ${next.step.time}` : ''}
				{#if next.assessment.subject}· {next.assessment.subject}{/if}
				{#if next.assessment.weight}· {next.assessment.weight} of the grade{/if}
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
	<div class="segmented" role="radiogroup" aria-label="View">
		<button role="radio" aria-checked={view === 'timeline'} onclick={() => setView('timeline')}>
			Timeline
		</button>
		<button role="radio" aria-checked={view === 'subjects'} onclick={() => setView('subjects')}>
			By subject
		</button>
	</div>
	{#if view === 'timeline'}
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
	{/if}
</div>

{#if view === 'timeline'}
	{#each groups as group}
		<section class="group">
			<h3 class="label">{group.title}</h3>
			<ul>
				{#each group.items as { assessment: a, step } (step.id)}
					{@const days = daysFor(step)}
					<li class="row card {urgency(days, step.done)}" class:busy={pending === step.id || pending === a.id}>
						<div class="date">
							<span class="d">{day(due(step))}</span>
							<span class="m">{month(due(step))}</span>
						</div>
						<div class="body">
							<span class="title-text">
								<span class="badge {step.type}">{stepName(step)}</span>
								{a.title}
							</span>
							<span class="sub">
								{#if a.subject}<span class="tag">{a.subject}</span>{/if}
								{#if step.alt}<span>{stepDates(step.due, step.alt)}</span>{/if}
								{#if a.weight}<span>{a.weight}</span>{/if}
								{#if step.time}<span>{step.time}</span>{/if}
								{#if a.kind === 'project'}
									<a href={sourceUrl(a.source)} target="_blank" rel="noreferrer">Group project ↗</a>
								{:else if a.addedBy}
									<span>added by {a.addedBy}</span>
								{/if}
							</span>
							{#if a.notes}<span class="notes-text">{a.notes}</span>{/if}
							{@render picker(a, step)}
						</div>
						<span class="pill">{stepLabel(step)}</span>
						<div class="row-actions">
							{@render check(step)}
							{#if a.kind === 'deadline'}
								<button class="del" title="Remove {a.title}" disabled={pending !== null} onclick={() => remove(a)}>
									×<span class="sr-only">Remove {a.title}</span>
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
			<p class="muted">
				Add CAs and hand-ins with "Add deadline". Group projects appear here once their brief has a
				<code>due:</code> date.
			</p>
		</div>
	{/each}
{:else}
	<div class="subjects">
		{#each bySubject as group}
			<section class="card subject">
				<header>
					<h2>{group.subject}</h2>
					<span class="count">{group.open} open</span>
				</header>
				{#each group.list as a (a.id)}
					<article class="assessment" class:busy={pending === a.id}>
						<div class="a-head">
							<h3>{a.title}</h3>
							{#if a.weight}<span class="weight">{a.weight}</span>{/if}
							{#if a.kind === 'project'}
								<a class="src" href={sourceUrl(a.source)} target="_blank" rel="noreferrer">Brief ↗</a>
							{:else}
								<button class="del small" title="Remove {a.title}" disabled={pending !== null} onclick={() => remove(a)}>
									×<span class="sr-only">Remove {a.title}</span>
								</button>
							{/if}
						</div>
						{#if a.notes}<p class="notes-text">{a.notes}</p>{/if}
						<ol class="steps">
							{#each [...a.steps].sort((x, y) => x.due.localeCompare(y.due)) as step (step.id)}
								{@const days = daysFor(step)}
								<li class="{urgency(days, step.done)}" class:busy={pending === step.id}>
									<span class="dot" aria-hidden="true"></span>
									<div class="s-body">
										<span class="s-name">{stepName(step)}</span>
										<span class="sub">
											{stepDates(step.due, step.alt)}{step.time ? `, ${step.time}` : ''}
										</span>
										{@render picker(a, step)}
									</div>
									<span class="pill">{stepLabel(step)}</span>
									{@render check(step)}
								</li>
							{/each}
						</ol>
					</article>
				{/each}
			</section>
		{:else}
			<div class="card empty">
				<p><strong>No deadlines yet.</strong></p>
				<p class="muted">Add one with "Add deadline".</p>
			</div>
		{/each}
	</div>
{/if}

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
	.small {
		font-size: 13px;
	}

	.add {
		padding: 20px;
		margin-bottom: 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.add-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 14px;
	}
	.span-2 {
		grid-column: span 2;
	}
	select.input {
		appearance: auto;
	}
	.steps-head {
		display: flex;
		align-items: baseline;
		gap: 12px;
		flex-wrap: wrap;
	}
	.draft-steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.draft-steps li {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		padding: 10px;
		border-radius: 10px;
		background: var(--bg);
		border: 1px solid var(--line);
	}
	.draft-steps .type {
		width: 150px;
	}
	.draft-steps .date {
		width: 160px;
	}
	.draft-steps .time {
		width: 120px;
	}
	.draft-steps li > input:not(.date):not(.time) {
		width: 170px;
	}
	.or {
		font-size: 13px;
		color: var(--ink-2);
	}
	.either {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--ink-2);
		cursor: pointer;
	}
	.x {
		margin-left: auto;
		border: 0;
		background: none;
		font-size: 20px;
		line-height: 1;
		color: var(--ink-3);
		cursor: pointer;
		padding: 4px 6px;
	}
	.add-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.more {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
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
		align-items: center;
		gap: 16px;
		margin-bottom: 20px;
		flex-wrap: wrap;
	}
	.segmented {
		display: flex;
		padding: 3px;
		border-radius: 11px;
		background: var(--surface-2);
	}
	.segmented button {
		height: 32px;
		padding: 0 14px;
		border: 0;
		border-radius: 8px;
		background: none;
		cursor: pointer;
		color: var(--ink-2);
		font-size: 14px;
		white-space: nowrap;
	}
	.segmented button[aria-checked='true'] {
		background: var(--surface);
		color: var(--ink);
		font-weight: 500;
		box-shadow: var(--shadow);
	}
	.chips {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.toggle {
		margin-left: auto;
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
	.busy {
		opacity: 0.5;
	}
	.row.done {
		box-shadow: none;
		background: transparent;
	}
	.row.done .title-text {
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
	.badge {
		display: inline-block;
		margin-right: 6px;
		padding: 1px 7px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		vertical-align: 2px;
		background: var(--surface-2);
		color: var(--ink-2);
	}
	.badge.presentation {
		background: color-mix(in srgb, #6b4fd8 14%, transparent);
		color: color-mix(in srgb, #6b4fd8 80%, var(--ink));
	}
	.badge.submission {
		background: var(--accent-soft);
		color: var(--accent);
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
		margin: 0;
		font-size: 13px;
		color: var(--ink-2);
	}
	.pick {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
		font-size: 13px;
		color: var(--warn);
		flex-wrap: wrap;
	}
	.pick button {
		height: 26px;
		padding: 0 10px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--surface);
		cursor: pointer;
		font-size: 13px;
	}
	.pick button:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.pill {
		flex: none;
		font-size: 13px;
		font-weight: 500;
		padding: 4px 10px;
		border-radius: 999px;
		background: var(--accent-soft);
		color: var(--accent);
		white-space: nowrap;
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
		flex: none;
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
	.del.small {
		width: 26px;
		height: 26px;
		font-size: 16px;
	}
	.del:hover {
		color: var(--danger);
		border-color: var(--danger);
	}

	.subjects {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr));
		gap: 16px;
		align-items: start;
	}
	.subject {
		padding: 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.subject header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}
	.subject h2 {
		font-size: 17px;
	}
	.count {
		font-size: 12px;
		color: var(--ink-3);
		background: var(--surface-2);
		border-radius: 999px;
		padding: 2px 9px;
		white-space: nowrap;
	}
	.assessment {
		padding-top: 14px;
		border-top: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.a-head {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.a-head h3 {
		font-size: 15px;
		flex: 1;
		min-width: 0;
	}
	.weight {
		font-size: 13px;
		font-weight: 500;
		color: var(--ink-2);
	}
	.src {
		font-size: 13px;
		color: var(--ink-2);
		text-decoration: none;
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.steps li {
		position: relative;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 0 8px 22px;
	}
	.steps li::before {
		content: '';
		position: absolute;
		left: 5px;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--line);
	}
	.steps li:first-child::before {
		top: 50%;
	}
	.steps li:last-child::before {
		bottom: 50%;
	}
	.steps li:only-child::before {
		display: none;
	}
	.dot {
		position: absolute;
		left: 0;
		top: 50%;
		width: 12px;
		height: 12px;
		margin-top: -6px;
		border-radius: 50%;
		background: var(--surface);
		border: 2px solid var(--accent);
	}
	.steps .soon .dot,
	.steps .overdue .dot {
		border-color: var(--danger);
	}
	.steps .near .dot {
		border-color: var(--warn);
	}
	.steps .done .dot {
		background: var(--ink-3);
		border-color: var(--ink-3);
	}
	.s-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.s-name {
		font-weight: 500;
		font-size: 14px;
	}
	.steps .done .s-name {
		color: var(--ink-3);
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
		.add-grid {
			grid-template-columns: 1fr 1fr;
		}
		.draft-steps .type,
		.draft-steps .date,
		.draft-steps .time,
		.draft-steps li > input:not(.date):not(.time) {
			width: calc(50% - 4px);
		}
		.hero {
			padding: 18px;
		}
		.big strong {
			font-size: 44px;
		}
		.toggle {
			margin-left: 0;
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
