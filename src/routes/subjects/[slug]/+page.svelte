<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { countdown, daysUntil, fileKind, fileSize, longDate, stepDates, urgency } from '#lib/format.js';
	import { progress } from '#lib/progress.js';
	import { CATEGORIES, effectiveDue, stepName, timeline, type Task } from '#lib/types.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let task = $state({ text: '', owner: '', due: '' });
	let decision = $state({ decision: '', why: '' });
	let showDone = $state(false);
	let busy = $state<string | null>(null);
	let message = $state<string | null>(null);

	const p = $derived(progress(data.tasks, data.assessments, data.today));
	const pct = $derived(p.total ? Math.round((p.done / p.total) * 100) : 0);
	const openTasks = $derived(data.tasks.filter((t) => !t.done));
	const doneTasks = $derived(data.tasks.filter((t) => t.done));
	const steps = $derived(timeline(data.assessments));
	const avatar = (login?: string) => data.members.find((m) => m.login === login)?.avatar;

	const folders = $derived.by(() => {
		const known = CATEGORIES.map((c) => ({ ...c, files: data.subject.files.filter((f) => f.category === c.id) }));
		const other = data.subject.files.filter((f) => !CATEGORIES.some((c) => c.id === f.category));
		const extra = [...new Set(other.map((f) => f.category))].map((id) => ({
			id,
			label: id.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
			files: other.filter((f) => f.category === id)
		}));
		return [...known, ...extra].filter((f) => f.files.length);
	});

	async function send(key: string, body: Record<string, unknown>) {
		busy = key;
		message = null;
		try {
			const res = await fetch('/api/subjects', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ slug: data.subject.slug, ...body })
			});
			if (!res.ok) throw new Error((await res.text()) || 'Could not save');
			await invalidateAll();
			return true;
		} catch (e) {
			message = (e as Error).message;
			return false;
		} finally {
			busy = null;
		}
	}

	async function addTask(e: SubmitEvent) {
		e.preventDefault();
		if (await send('task', { action: 'addTask', ...task })) task = { text: '', owner: task.owner, due: '' };
	}
	async function addDecision(e: SubmitEvent) {
		e.preventDefault();
		if (await send('decision', { action: 'addDecision', ...decision })) decision = { decision: '', why: '' };
	}
	const toggle = (t: Task) =>
		send(`t${t.index}`, { action: 'toggleTask', index: t.index, text: t.text, done: !t.done });
	const remove = (t: Task) => {
		if (confirm(`Remove the task "${t.text}"?`))
			send(`t${t.index}`, { action: 'deleteTask', index: t.index, text: t.text });
	};

	const fileUrl = (path: string) => `/files/${path.split('/').map(encodeURIComponent).join('/')}`;
	const vaultUrl = (path: string) =>
		`${data.repoUrl}/tree/${data.branch}/${path.split('/').map(encodeURIComponent).join('/')}`;
</script>

{#snippet taskRow(t: Task)}
	{@const days = t.due ? daysUntil(t.due, data.today) : null}
	<li class:done={t.done} class:busy={busy === `t${t.index}`}>
		<button
			class="box"
			aria-pressed={t.done}
			title={t.done ? 'Reopen' : 'Mark done'}
			disabled={busy !== null}
			onclick={() => toggle(t)}
		>
			<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
				<path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
			<span class="sr-only">{t.done ? 'Reopen' : 'Mark done'}: {t.text}</span>
		</button>
		<span class="t-text">{t.text}</span>
		{#if t.due}
			<span class="due {t.done ? '' : urgency(days!, false)}" title={longDate(t.due)}>
				{t.done ? longDate(t.due) : countdown(days!)}
			</span>
		{/if}
		{#if t.owner}
			<span class="owner" title="@{t.owner}">
				{#if avatar(t.owner)}<img src={avatar(t.owner)} alt="" width="20" height="20" />{/if}
				<span>{t.owner}</span>
			</span>
		{/if}
		<button class="x" aria-label="Remove {t.text}" disabled={busy !== null} onclick={() => remove(t)}>×</button>
	</li>
{/snippet}

<nav class="crumbs"><a href="/subjects">Subjects</a> <span>/</span></nav>

<header class="head">
	<div class="title">
		<h1 class="display">{data.subject.name}</h1>
		<p class="muted">
			{#if data.subject.code}<span class="code">{data.subject.code}</span>{/if}
			{#if data.lecturer}Lecturer: {data.lecturer}{/if}
		</p>
	</div>
	<div class="head-actions">
		<a class="btn" href="/?subject={data.subject.slug}">Upload here</a>
		{#if data.project}
			<a class="btn" href={vaultUrl(data.project)} target="_blank" rel="noreferrer">Project folder ↗</a>
		{/if}
	</div>
</header>

<section class="card progress">
	<div class="p-top">
		<span class="label">Progress</span>
		<span class="p-num">
			{#if p.total}<strong>{p.done}</strong> of {p.total} done{:else}Nothing to track yet{/if}
		</span>
	</div>
	<div class="bar" aria-hidden="true"><div style="width: {pct}%"></div></div>
	<p class="muted small">
		Counts tasks and deadline steps.
		{#if p.next}
			Next: <strong>{stepName(p.next.step)} · {p.next.title}</strong>, {countdown(daysUntil(p.next.due, data.today)).toLowerCase()}.
		{/if}
	</p>
</section>

{#if message}<p class="error" role="alert">{message}</p>{/if}

<div class="layout">
	<div class="main">
		<section class="card panel">
			<div class="panel-head">
				<h2>To do</h2>
				<span class="count">{openTasks.length} open</span>
			</div>
			<form class="add-task" onsubmit={addTask}>
				<input class="input grow" bind:value={task.text} required placeholder="What needs doing? e.g. Clean the dataset" aria-label="Task" />
				<select class="input" bind:value={task.owner} aria-label="Who">
					<option value="">Anyone</option>
					{#each data.members as m}<option value={m.login}>{m.login}</option>{/each}
				</select>
				<input class="input date" type="date" bind:value={task.due} aria-label="Due (optional)" />
				<button class="btn primary" disabled={busy !== null}>{busy === 'task' ? 'Adding…' : 'Add'}</button>
			</form>
			<ul class="tasks">
				{#each openTasks as t (t.index)}
					{@render taskRow(t)}
				{:else}
					<li class="empty-row muted">Nothing open. Add the next step above.</li>
				{/each}
			</ul>
			{#if doneTasks.length}
				<button class="link" onclick={() => (showDone = !showDone)}>
					{showDone ? 'Hide' : 'Show'} done ({doneTasks.length})
				</button>
				{#if showDone}
					<ul class="tasks">
						{#each doneTasks as t (t.index)}{@render taskRow(t)}{/each}
					</ul>
				{/if}
			{/if}
		</section>

		<section class="card panel">
			<div class="panel-head">
				<h2>Decisions</h2>
				<span class="count">{data.decisions.length}</span>
			</div>
			<form class="add-decision" onsubmit={addDecision}>
				<input class="input" bind:value={decision.decision} required placeholder="What did we decide? e.g. Use the NYC taxi dataset" aria-label="Decision" />
				<input class="input" bind:value={decision.why} placeholder="Why (optional)" aria-label="Why" />
				<button class="btn" disabled={busy !== null}>{busy === 'decision' ? 'Saving…' : 'Record'}</button>
			</form>
			{#if data.decisions.length}
				<ul class="decisions">
					{#each data.decisions as d}
						<li>
							<span class="d-date">{d.date}</span>
							<div>
								<span class="d-text">{d.decision}</span>
								{#if d.why && d.why !== '–'}<span class="d-why">{d.why}</span>{/if}
							</div>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted small empty-row">No decisions yet. Settled choices go here so nobody re-opens them by accident.</p>
			{/if}
		</section>
	</div>

	<aside>
		<section class="card panel">
			<div class="panel-head">
				<h2>Deadlines</h2>
				<a href="/deadlines">All →</a>
			</div>
			{#if steps.length}
				<ul class="steps">
					{#each steps as { assessment: a, step } (step.id)}
						{@const days = daysUntil(effectiveDue(step, data.today), data.today)}
						<li class={urgency(days, step.done)}>
							<div>
								<span class="s-name">{stepName(step)} · {a.title}</span>
								<span class="sub">{stepDates(step.due, step.alt)}{a.weight ? ` · ${a.weight}` : ''}</span>
							</div>
							<span class="pill">{step.done ? 'Done' : countdown(days)}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted small empty-row">No deadlines for this subject. <a href="/deadlines">Add one</a></p>
			{/if}
		</section>

		<section class="card panel">
			<div class="panel-head">
				<h2>Materials</h2>
				<span class="count">{data.subject.files.length}</span>
			</div>
			{#each folders as f}
				<h3 class="label">{f.label}</h3>
				<ul class="files">
					{#each f.files as file}
						<li>
							<a href={fileUrl(file.path)} target="_blank" rel="noreferrer">
								<span class="kind">{fileKind(file.name)}</span>
								<span class="f-name">{file.name}</span>
							</a>
							<span class="f-size">{fileSize(file.size)}</span>
							<a class="dl" href="{fileUrl(file.path)}?download" title="Download {file.name}" aria-label="Download {file.name}">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted small empty-row">No files yet. <a href="/?subject={data.subject.slug}">Upload some</a></p>
			{/each}
		</section>
	</aside>
</div>

<style>
	.crumbs {
		font-size: 14px;
		color: var(--ink-3);
		margin-bottom: 8px;
	}
	.crumbs a {
		color: var(--ink-2);
		text-decoration: none;
	}
	.crumbs a:hover {
		text-decoration: underline;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 16px;
		margin-bottom: 20px;
		flex-wrap: wrap;
	}
	.head h1 {
		font-size: 36px;
		line-height: 1.1;
	}
	.head p {
		margin: 8px 0 0;
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.code {
		font-size: 12px;
		color: var(--ink-2);
		background: var(--surface-2);
		border-radius: 6px;
		padding: 2px 7px;
	}
	.head-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.small {
		font-size: 13px;
	}

	.progress {
		padding: 18px 20px;
		margin-bottom: 20px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.p-top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.p-num {
		font-size: 14px;
		color: var(--ink-2);
	}
	.p-num strong {
		color: var(--ink);
		font-size: 18px;
	}
	.progress p {
		margin: 0;
	}
	.bar {
		height: 8px;
		border-radius: 4px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.bar div {
		height: 100%;
		background: var(--accent);
		border-radius: 4px;
		transition: width 0.3s;
	}

	.error {
		padding: 10px 14px;
		border-radius: 10px;
		background: var(--danger-soft);
		color: var(--danger);
	}

	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 360px;
		gap: 20px;
		align-items: start;
	}
	.main,
	aside {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 0;
	}
	.panel {
		padding: 18px 20px;
	}
	.panel-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 14px;
	}
	.panel-head h2 {
		font-size: 16px;
	}
	.panel-head a {
		font-size: 13px;
		color: var(--ink-2);
		text-decoration: none;
	}
	.count {
		font-size: 12px;
		color: var(--ink-3);
		background: var(--surface-2);
		border-radius: 999px;
		padding: 2px 9px;
	}
	.panel ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.empty-row {
		margin: 0;
		padding: 8px 0;
	}
	select.input {
		appearance: auto;
		width: auto;
	}

	.add-task,
	.add-decision {
		display: flex;
		gap: 8px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}
	.add-task .grow {
		flex: 1 1 220px;
	}
	.add-task .date {
		width: 150px;
	}
	.add-decision .input {
		flex: 1 1 200px;
	}

	.tasks li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 0;
		border-top: 1px solid var(--line);
	}
	.tasks li.empty-row {
		border-top: 0;
	}
	.busy {
		opacity: 0.5;
	}
	.box {
		flex: none;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 6px;
		border: 1.5px solid var(--ink-3);
		background: var(--surface);
		color: transparent;
		cursor: pointer;
		padding: 0;
	}
	.box:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.box[aria-pressed='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}
	.t-text {
		flex: 1;
		min-width: 0;
	}
	.done .t-text {
		text-decoration: line-through;
		color: var(--ink-3);
	}
	.due {
		flex: none;
		font-size: 12px;
		font-weight: 500;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--ink-2);
	}
	.due.soon,
	.due.overdue {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.due.near {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.owner {
		flex: none;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--ink-2);
	}
	.owner img {
		border-radius: 50%;
	}
	.x {
		flex: none;
		border: 0;
		background: none;
		font-size: 18px;
		line-height: 1;
		color: var(--ink-3);
		cursor: pointer;
		padding: 2px 4px;
		opacity: 0;
	}
	li:hover .x,
	.x:focus-visible {
		opacity: 1;
	}
	.x:hover {
		color: var(--danger);
	}
	.link {
		margin-top: 8px;
		border: 0;
		background: none;
		padding: 0;
		font-size: 13px;
		color: var(--ink-2);
		cursor: pointer;
	}
	.link:hover {
		color: var(--ink);
		text-decoration: underline;
	}

	.decisions li {
		display: flex;
		gap: 14px;
		padding: 10px 0;
		border-top: 1px solid var(--line);
	}
	.d-date {
		flex: none;
		font-size: 12px;
		color: var(--ink-3);
		padding-top: 2px;
		font-variant-numeric: tabular-nums;
	}
	.decisions div {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.d-text {
		font-weight: 500;
	}
	.d-why {
		font-size: 13px;
		color: var(--ink-2);
	}

	.steps {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.steps li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		padding-left: 10px;
		border-left: 3px solid var(--accent);
	}
	.steps li.soon,
	.steps li.overdue {
		border-color: var(--danger);
	}
	.steps li.near {
		border-color: var(--warn);
	}
	.steps li.done {
		border-color: var(--line);
		opacity: 0.6;
	}
	.steps div {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.s-name {
		font-weight: 500;
		font-size: 14px;
	}
	.sub {
		font-size: 12px;
		color: var(--ink-3);
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

	.panel h3.label {
		margin: 12px 0 6px;
	}
	.panel h3.label:first-of-type {
		margin-top: 0;
	}
	.files {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.files li {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}
	.files a:first-child {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 0;
		text-decoration: none;
	}
	.files a:first-child:hover .f-name {
		text-decoration: underline;
	}
	.kind {
		flex: none;
		display: grid;
		place-items: center;
		width: 40px;
		height: 22px;
		border-radius: 6px;
		background: var(--surface-2);
		font-size: 10px;
		font-weight: 600;
		color: var(--ink-2);
	}
	.f-name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.f-size {
		flex: none;
		color: var(--ink-3);
		font-size: 12px;
	}
	.dl {
		flex: none;
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 6px;
		color: var(--ink-3);
	}
	.dl:hover {
		background: var(--surface-2);
		color: var(--ink);
	}

	@media (max-width: 900px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 640px) {
		.head h1 {
			font-size: 30px;
		}
		.add-task .date,
		.add-task select {
			flex: 1 1 40%;
			width: auto;
		}
		.add-task .btn,
		.add-decision .btn {
			flex: 1 1 100%;
		}
		.x {
			opacity: 1;
		}
		.tasks li {
			flex-wrap: wrap;
			row-gap: 4px;
		}
		.t-text {
			flex: 1 1 calc(100% - 64px);
		}
		.tasks li .x {
			order: 1;
		}
		.due,
		.owner {
			order: 2;
		}
		.due {
			margin-left: 32px;
		}
	}
</style>
