<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { CATEGORIES, type CategoryId } from '#lib/types.js';
	import { countdown, daysUntil, fileKind, fileSize, stepDates, timeAgo, urgency } from '#lib/format.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Workers accept up to 100 MB per request; base64 adds a third on top.
	const MAX_BYTES = 70 * 1024 * 1024;
	const NEW = '__new';

	interface Item {
		id: string;
		file: File;
		status: 'queued' | 'uploading' | 'done' | 'error';
		progress: number;
		sha?: string;
		error?: string;
	}

	let subject = $state(loadPref('subject') ?? '');
	const savedCategory = loadPref('category');
	let category = $state<CategoryId>(
		CATEGORIES.find((c) => c.id === savedCategory)?.id ?? 'lecture-slides'
	);
	let week = $state('');
	let newSubject = $state({ name: '', code: '', lecturer: '' });
	let items = $state<Item[]>([]);
	let busy = $state(false);
	let dragging = $state(false);
	let result = $state<{ ok: boolean; text: string; paths?: string[] } | null>(null);
	let picker: HTMLInputElement;
	let openSubject = $state<string | null>(null);

	$effect(() => {
		if (!subject && data.subjects.length) subject = data.subjects[0].slug;
		if (subject !== NEW && subject && !data.subjects.some((s) => s.slug === subject))
			subject = data.subjects[0]?.slug ?? NEW;
	});

	const ready = $derived(
		items.length > 0 &&
			items.every((i) => i.file.size <= MAX_BYTES) &&
			(subject !== NEW || newSubject.name.trim().length > 0) &&
			!!subject
	);
	const totalSize = $derived(items.reduce((n, i) => n + i.file.size, 0));

	function loadPref(key: string) {
		try {
			return localStorage.getItem(`sh:${key}`);
		} catch {
			return null;
		}
	}
	function savePref(key: string, value: string) {
		try {
			localStorage.setItem(`sh:${key}`, value);
		} catch {}
	}

	function add(files: FileList | File[]) {
		result = null;
		for (const file of files) {
			if (file.name.startsWith('.')) continue;
			items.push({ id: crypto.randomUUID(), file, status: 'queued', progress: 0 });
		}
	}

	function remove(id: string) {
		items = items.filter((i) => i.id !== id);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		if (e.dataTransfer?.files.length) add(e.dataTransfer.files);
	}

	function toBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const r = new FileReader();
			r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
			r.onerror = () => reject(r.error);
			r.readAsDataURL(file);
		});
	}

	function sendBlob(item: Item): Promise<string> {
		return toBase64(item.file).then(
			(b64) =>
				new Promise((resolve, reject) => {
					const xhr = new XMLHttpRequest();
					xhr.open('POST', '/api/blob');
					xhr.setRequestHeader('Content-Type', 'application/json');
					xhr.upload.onprogress = (e) => {
						if (e.lengthComputable) item.progress = e.loaded / e.total;
					};
					xhr.onload = () => {
						if (xhr.status === 200) resolve(JSON.parse(xhr.responseText).sha);
						else reject(new Error(xhr.status === 413 ? 'Too large for GitHub' : 'Upload failed'));
					};
					xhr.onerror = () => reject(new Error('Network error'));
					xhr.send(`{"content":"${b64}","encoding":"base64"}`);
				})
		);
	}

	async function upload() {
		if (!ready || busy) return;
		busy = true;
		result = null;
		savePref('subject', subject);
		savePref('category', category);
		try {
			// Two at a time keeps the bars moving without hammering GitHub.
			const queue = items.filter((i) => i.status !== 'done');
			const worker = async () => {
				for (let item = queue.shift(); item; item = queue.shift()) {
					item.status = 'uploading';
					try {
						item.sha = await sendBlob(item);
						item.progress = 1;
						item.status = 'done';
					} catch (e) {
						item.status = 'error';
						item.error = (e as Error).message;
					}
				}
			};
			await Promise.all([worker(), worker()]);
			const uploaded = items.filter((i) => i.status === 'done' && i.sha);
			if (uploaded.length !== items.length) {
				result = { ok: false, text: 'Some files failed. Remove them or try again.' };
				return;
			}
			const res = await fetch('/api/upload', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subject: subject === NEW ? '' : subject,
					newSubject: subject === NEW ? newSubject : undefined,
					category,
					week,
					files: uploaded.map((i) => ({ name: i.file.name, sha: i.sha }))
				})
			});
			if (!res.ok) throw new Error((await res.text()) || 'Saving to the vault failed');
			const { paths } = await res.json();
			result = {
				ok: true,
				text: `${paths.length} file${paths.length > 1 ? 's' : ''} added to the vault.`,
				paths
			};
			items = [];
			week = '';
			if (subject === NEW) {
				subject = paths[0].split('/')[1];
				newSubject = { name: '', code: '', lecturer: '' };
			}
			await invalidateAll();
		} catch (e) {
			result = { ok: false, text: (e as Error).message };
		} finally {
			busy = false;
		}
	}

	const fileUrl = (path: string) =>
		`${data.repoUrl}/blob/${data.branch}/${path.split('/').map(encodeURIComponent).join('/')}`;
</script>

<svelte:window
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={(e) => {
		if (!e.relatedTarget) dragging = false;
	}}
	ondrop={onDrop}
/>

<div class="intro">
	<h1 class="display">Add to the vault</h1>
	<p class="muted">
		Drop slides, readings or notes. They land in the shared vault on GitHub and show up in
		everyone's Obsidian on the next sync.
	</p>
</div>

<div class="layout">
	<section class="card upload">
		<div class="step">
			<span class="label">Subject</span>
			<div class="chips">
				{#each data.subjects as s}
					<button class="chip" aria-pressed={subject === s.slug} onclick={() => (subject = s.slug)}>
						{s.name}
						{#if s.code}<span class="code">{s.code}</span>{/if}
					</button>
				{/each}
				<button class="chip" aria-pressed={subject === NEW} onclick={() => (subject = NEW)}>
					+ New subject
				</button>
			</div>
			{#if subject === NEW}
				<div class="new-subject">
					<label class="field">
						Name
						<input class="input" bind:value={newSubject.name} placeholder="Marketing in Action" />
					</label>
					<label class="field">
						Module code
						<input class="input" bind:value={newSubject.code} placeholder="B8MK101" />
					</label>
					<label class="field">
						Lecturer
						<input class="input" bind:value={newSubject.lecturer} placeholder="optional" />
					</label>
				</div>
			{/if}
		</div>

		<div class="step row">
			<div class="grow">
				<span class="label">Type</span>
				<div class="segmented" role="radiogroup" aria-label="Type">
					{#each CATEGORIES as c}
						<button
							role="radio"
							aria-checked={category === c.id}
							onclick={() => (category = c.id)}>{c.label}</button
						>
					{/each}
				</div>
			</div>
			<label class="week">
				<span class="label">Week</span>
				<input class="input" bind:value={week} inputmode="numeric" placeholder="e.g. 3" />
			</label>
		</div>

		<button
			class="drop"
			class:dragging
			class:has-items={items.length > 0}
			onclick={() => picker.click()}
			type="button"
		>
			<svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M12 16V4m0 0 4.5 4.5M12 4 7.5 8.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			<strong>Drop files here or click to choose</strong>
			<span class="muted">PDF, PowerPoint, Word, images · up to 70 MB each</span>
		</button>
		<input
			bind:this={picker}
			type="file"
			multiple
			class="sr-only"
			onchange={(e) => {
				const input = e.currentTarget;
				if (input.files) add(input.files);
				input.value = '';
			}}
		/>

		{#if items.length}
			<ul class="queue">
				{#each items as item (item.id)}
					<li class:error={item.status === 'error' || item.file.size > MAX_BYTES}>
						<span class="kind">{fileKind(item.file.name)}</span>
						<div class="meta">
							<span class="name">{item.file.name}</span>
							<span class="sub">
								{fileSize(item.file.size)}
								{#if item.file.size > MAX_BYTES}· too large (max 70 MB){/if}
								{#if item.error}· {item.error}{/if}
								{#if item.status === 'done'}· uploaded{/if}
							</span>
							{#if item.status === 'uploading' || item.status === 'done'}
								<div class="bar"><div style="width: {item.progress * 100}%"></div></div>
							{/if}
						</div>
						{#if !busy}
							<button class="x" aria-label="Remove {item.file.name}" onclick={() => remove(item.id)}
								>×</button
							>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<div class="actions">
			{#if result}
				<p class="result" class:ok={result.ok} role="status">
					{result.text}
					{#if result.paths}
						<a href={fileUrl(result.paths[0])} target="_blank" rel="noreferrer">View on GitHub ↗</a>
					{/if}
				</p>
			{:else if items.length}
				<p class="muted">{items.length} file{items.length > 1 ? 's' : ''} · {fileSize(totalSize)}</p>
			{:else}
				<span></span>
			{/if}
			<button class="btn primary" disabled={!ready || busy} onclick={upload}>
				{busy ? 'Uploading…' : items.length ? `Upload ${items.length}` : 'Upload'}
			</button>
		</div>
	</section>

	<aside>
		<section class="card panel">
			<div class="panel-head">
				<h2>Coming up</h2>
				<a href="/deadlines">All deadlines →</a>
			</div>
			{#if data.upcoming.length}
				<ul class="upcoming">
					{#each data.upcoming as d}
						{@const days = daysUntil(d.due, data.today)}
						<li class={urgency(days, false)}>
							<span class="when">{countdown(days)}</span>
							<span class="what">{d.step} · {d.title}</span>
							<span class="sub">{stepDates(d.due, d.alt)}{d.subject ? ` · ${d.subject}` : ''}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted empty">Nothing due. <a href="/deadlines">Add a deadline</a></p>
			{/if}
		</section>

		<section class="card panel">
			<div class="panel-head"><h2>Library</h2></div>
			<ul class="library">
				{#each data.subjects as s}
					<li>
						<button
							class="subject"
							aria-expanded={openSubject === s.slug}
							onclick={() => (openSubject = openSubject === s.slug ? null : s.slug)}
						>
							<span>{s.name}</span>
							<span class="count">{s.files.length}</span>
						</button>
						{#if openSubject === s.slug}
							<ul class="files">
								{#each s.files as f}
									<li>
										<a href={fileUrl(f.path)} target="_blank" rel="noreferrer">
											<span class="kind small">{fileKind(f.name)}</span>
											<span class="name">{f.name}</span>
										</a>
									</li>
								{:else}
									<li class="muted">No files yet</li>
								{/each}
							</ul>
						{/if}
					</li>
				{:else}
					<li class="muted empty">No subjects yet</li>
				{/each}
			</ul>
		</section>

		{#if data.activity.length}
			<section class="card panel">
				<div class="panel-head"><h2>Recently added</h2></div>
				<ul class="activity">
					{#each data.activity as a}
						<li>
							{#if a.avatar}<img src={a.avatar} alt="" width="22" height="22" />{/if}
							<div>
								<a href={a.url} target="_blank" rel="noreferrer">{a.message}</a>
								<span class="sub">{a.login} · {timeAgo(a.date)}</span>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</aside>
</div>

{#if dragging}
	<div class="overlay" aria-hidden="true"><span>Drop to add</span></div>
{/if}

<style>
	.intro {
		margin-bottom: 24px;
	}
	.intro h1 {
		font-size: 44px;
		line-height: 1.1;
	}
	.intro p {
		margin: 8px 0 0;
		max-width: 560px;
	}

	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 340px;
		gap: 20px;
		align-items: start;
	}

	.upload {
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}

	.step {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.step.row {
		flex-direction: row;
		align-items: flex-end;
		gap: 16px;
	}
	.grow {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	.week {
		width: 110px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.new-subject {
		display: grid;
		grid-template-columns: 2fr 1fr 1.5fr;
		gap: 10px;
	}

	.segmented {
		display: flex;
		padding: 3px;
		border-radius: 11px;
		background: var(--surface-2);
		overflow-x: auto;
	}
	.segmented button {
		flex: 1;
		height: 34px;
		padding: 0 12px;
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

	.drop {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 40px 20px;
		border: 1.5px dashed var(--line);
		border-radius: var(--radius);
		background: var(--bg);
		cursor: pointer;
		color: var(--ink);
		text-align: center;
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.drop svg {
		color: var(--accent);
		margin-bottom: 4px;
	}
	.drop .muted {
		font-size: 13px;
	}
	.drop:hover,
	.drop.dragging {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.drop.has-items {
		padding: 22px 20px;
	}

	.queue {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.queue li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 10px;
	}
	.queue li.error {
		border-color: var(--danger);
		background: var(--danger-soft);
	}
	.kind {
		flex: none;
		display: grid;
		place-items: center;
		width: 44px;
		height: 32px;
		border-radius: 7px;
		background: var(--surface-2);
		font-size: 11px;
		font-weight: 600;
		color: var(--ink-2);
	}
	.kind.small {
		width: 38px;
		height: 22px;
		font-size: 10px;
	}
	.meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sub {
		font-size: 12px;
		color: var(--ink-3);
	}
	.bar {
		height: 4px;
		margin-top: 6px;
		border-radius: 2px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.bar div {
		height: 100%;
		background: var(--accent);
		transition: width 0.2s;
	}
	.x {
		border: 0;
		background: none;
		font-size: 20px;
		line-height: 1;
		color: var(--ink-3);
		cursor: pointer;
		padding: 4px 6px;
	}
	.x:hover {
		color: var(--ink);
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}
	.actions p {
		margin: 0;
		font-size: 14px;
	}
	.result {
		color: var(--danger);
	}
	.result.ok {
		color: var(--accent);
		font-weight: 500;
	}
	.result a {
		margin-left: 6px;
		font-weight: 400;
	}

	aside {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.panel {
		padding: 18px;
	}
	.panel-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 12px;
	}
	.panel-head h2 {
		font-size: 15px;
	}
	.panel-head a {
		font-size: 13px;
		color: var(--ink-2);
		text-decoration: none;
	}
	.panel ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.empty {
		margin: 0;
		font-size: 14px;
	}

	.upcoming {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.upcoming li {
		display: flex;
		flex-direction: column;
		padding-left: 12px;
		border-left: 3px solid var(--line);
	}
	.upcoming li.soon {
		border-color: var(--danger);
	}
	.upcoming li.near {
		border-color: var(--warn);
	}
	.upcoming li.later {
		border-color: var(--accent);
	}
	.when {
		font-size: 12px;
		font-weight: 600;
		color: var(--ink-2);
	}
	.soon .when {
		color: var(--danger);
	}
	.near .when {
		color: var(--warn);
	}
	.what {
		font-weight: 500;
	}

	.library > li + li {
		border-top: 1px solid var(--line);
	}
	.subject {
		width: 100%;
		display: flex;
		justify-content: space-between;
		padding: 9px 0;
		border: 0;
		background: none;
		cursor: pointer;
		text-align: left;
	}
	.subject:hover span:first-child {
		text-decoration: underline;
	}
	.count {
		font-size: 12px;
		color: var(--ink-3);
		background: var(--surface-2);
		border-radius: 999px;
		padding: 1px 8px;
	}
	.files {
		padding-bottom: 10px !important;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
	}
	.files a {
		display: flex;
		align-items: center;
		gap: 8px;
		text-decoration: none;
		min-width: 0;
	}
	.files a:hover .name {
		text-decoration: underline;
	}

	.activity {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.activity li {
		display: flex;
		gap: 10px;
		font-size: 13px;
	}
	.activity img {
		border-radius: 50%;
		flex: none;
	}
	.activity div {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.activity a {
		text-decoration: none;
	}
	.activity a:hover {
		text-decoration: underline;
	}

	.overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		background: color-mix(in srgb, var(--accent) 18%, transparent);
		border: 3px dashed var(--accent);
		pointer-events: none;
	}
	.overlay span {
		background: var(--accent);
		color: var(--accent-ink);
		padding: 12px 22px;
		border-radius: 999px;
		font-weight: 600;
	}

	@media (max-width: 900px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 640px) {
		.intro h1 {
			font-size: 34px;
		}
		.upload {
			padding: 18px;
		}
		.new-subject {
			grid-template-columns: 1fr;
		}
		.step.row {
			flex-direction: column;
			align-items: stretch;
		}
		.week {
			width: 100%;
		}
		.segmented {
			display: grid;
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
