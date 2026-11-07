import { parse, parseDocument, stringify } from 'yaml';
import { CATEGORIES, type Activity, type Deadline, type Subject, type VaultFile } from '#lib/types.js';
import { gh, readText, repoPath, type Change, type Snapshot } from './github';

export const DEADLINES_FILE = 'shared/deadlines.md';

/** Today's date in Munich, as YYYY-MM-DD. */
export function today() {
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
}

export function slugify(text: string) {
	return text
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** "capstone-B8AF124" → { name: "Capstone", code: "B8AF124" } */
export function subjectLabel(slug: string) {
	const m = slug.match(/^(.*?)-([A-Z0-9]{4,})$/);
	const base = m ? m[1] : slug;
	const name = base.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
	return { name, code: m ? m[2] : '' };
}

/** Keep the name readable (spaces are fine in Obsidian) but strip anything that breaks a path. */
export function safeFileName(name: string) {
	const cleaned = name
		.replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, ' ')
		.replace(/\s+/g, ' ')
		.replace(/^[\s.]+|\s+$/g, '');
	if (cleaned.length <= 150) return cleaned || 'file';
	const dot = cleaned.lastIndexOf('.');
	const ext = dot > 0 ? cleaned.slice(dot) : '';
	return cleaned.slice(0, 150 - ext.length) + ext;
}

/** If the path is taken, add " (2)", " (3)"… before the extension. */
export function uniquePath(path: string, taken: Set<string>) {
	if (!taken.has(path)) return path;
	const dot = path.lastIndexOf('.');
	const [stem, ext] = dot > path.lastIndexOf('/') ? [path.slice(0, dot), path.slice(dot)] : [path, ''];
	for (let n = 2; ; n++) {
		const next = `${stem} (${n})${ext}`;
		if (!taken.has(next)) return next;
	}
}

export function subjects(snap: Snapshot): Subject[] {
	const bySlug = new Map<string, Subject>();
	for (const e of snap.entries) {
		const parts = e.path.split('/');
		if (parts[0] !== 'subjects' || parts.length < 2) continue;
		const slug = parts[1];
		if (!bySlug.has(slug)) bySlug.set(slug, { slug, ...subjectLabel(slug), files: [] });
		if (e.type !== 'blob' || parts.length < 3 || e.path.endsWith('.md') || parts.at(-1)!.startsWith('.'))
			continue;
		const file: VaultFile = {
			path: e.path,
			name: parts.at(-1)!,
			category: parts.length > 3 ? parts[2] : 'other',
			size: e.size ?? 0
		};
		bySlug.get(slug)!.files.push(file);
	}
	return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function recentActivity(token: string): Promise<Activity[]> {
	const commits = await gh<any[]>(token, repoPath('/commits?path=subjects&per_page=8'));
	return commits.map((c) => ({
		message: c.commit.message.split('\n')[0],
		login: c.author?.login ?? c.commit.author.name,
		avatar: c.author?.avatar_url ?? '',
		date: c.commit.author.date,
		url: c.html_url
	}));
}

// ---------- Markdown helpers ----------

export function splitFrontmatter(text: string): { data: Record<string, any>; body: string; raw: string } {
	const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!m) return { data: {}, body: text, raw: '' };
	let data: Record<string, any> = {};
	try {
		data = parse(m[1]) ?? {};
	} catch {}
	return { data, body: text.slice(m[0].length), raw: m[1] };
}

/** Change frontmatter keys without reformatting the rest of the file. */
export function setFrontmatter(text: string, updates: Record<string, unknown>) {
	const { raw, body } = splitFrontmatter(text);
	const doc = parseDocument(raw || '');
	for (const [k, v] of Object.entries(updates)) {
		if (v === undefined) doc.delete(k);
		else doc.set(k, v);
	}
	return `---\n${doc.toString({ flowCollectionPadding: false }).trimEnd()}\n---\n${body}`;
}

export function appendLog(log: string | null, login: string, title: string, details = '') {
	const entry = `## ${today()} | ${login} | ${title}${details ? `\n${details}` : ''}\n`;
	if (!log) return `# Log\n\n${entry}`;
	return `${log.trimEnd()}\n\n${entry}`;
}

/** Add a line under a `## Heading` in index.md (creating the heading if needed). */
export function addToIndex(index: string | null, heading: string, line: string) {
	const text = index ?? '# Index\n';
	if (text.includes(line)) return text;
	const lines = text.split('\n');
	const h = lines.findIndex((l) => l.trim() === `## ${heading}`);
	if (h === -1) return `${text.trimEnd()}\n\n## ${heading}\n${line}\n`;
	let end = h + 1;
	while (end < lines.length && !lines[end].startsWith('## ')) end++;
	while (end > h + 1 && lines[end - 1].trim() === '') end--;
	lines.splice(end, 0, line);
	return lines.join('\n');
}

const cells = (row: string) =>
	row
		.trim()
		.replace(/^\||\|$/g, '')
		.split(/(?<!\\)\|/)
		.map((c) => c.trim());

/**
 * Append one row per file to the first table in an overview note, filling columns by their
 * header (Week, Slides/File, Added by); other columns get "–".
 */
export function appendRows(
	overview: string,
	rows: { week: string; link: string; login: string }[]
) {
	const lines = overview.split('\n');
	const headerAt = lines.findIndex((l) => l.trim().startsWith('|'));
	if (headerAt === -1) {
		return `${overview.trimEnd()}\n\n${table(rows)}`;
	}
	const header = cells(lines[headerAt]);
	let last = headerAt;
	while (last + 1 < lines.length && lines[last + 1].trim().startsWith('|')) last++;
	const out = rows.map(
		(r) =>
			`| ${header
				.map((h) => {
					if (/week/i.test(h)) return r.week || '–';
					if (/slide|file|reading|title|name/i.test(h)) return r.link;
					if (/added|by|who/i.test(h)) return r.login;
					return '–';
				})
				.join(' | ')} |`
	);
	lines.splice(last + 1, 0, ...out);
	return lines.join('\n');
}

function table(rows: { week: string; link: string; login: string }[]) {
	return [
		'| Week | File | Added by |',
		'| --- | --- | --- |',
		...rows.map((r) => `| ${r.week || '–'} | ${r.link} | ${r.login} |`)
	].join('\n') + '\n';
}

export function newOverview(subjectName: string, category: string, login: string) {
	const label = CATEGORIES.find((c) => c.id === category)?.label ?? category;
	return `---
tags: [${slugify(subjectName)}, ${category}]
date: ${today()}
owner: ${login}
---
# ${subjectName} — ${label}

| Week | File | Added by |
| --- | --- | --- |
`;
}

export function newSubjectNote(name: string, code: string, lecturer: string, login: string) {
	return `---
tags: [subject]
date: ${today()}
owner: ${login}
---
# ${name}${code ? ` (${code})` : ''}

Lecturer: ${lecturer}
Assessments:

## Lecture notes
`;
}

// ---------- Deadlines ----------

interface StoredDeadline {
	title: string;
	due: string;
	time?: string;
	subject?: string;
	weight?: string;
	notes?: string;
	done?: boolean;
	added_by?: string;
}

const asDate = (v: unknown) =>
	v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' ? v.slice(0, 10) : '';

export function deadlineId(d: { title: string; due: string }) {
	return `${d.due}-${slugify(d.title)}`.slice(0, 80);
}

export async function loadDeadlines(token: string, snap: Snapshot): Promise<Deadline[]> {
	const briefs = snap.entries.filter((e) => /^projects\/[^/]+\/brief\.md$/.test(e.path));
	const [shared, ...briefTexts] = await Promise.all([
		readText(token, DEADLINES_FILE, snap.commitSha),
		...briefs.map((b) => readText(token, b.path, snap.commitSha))
	]);

	const out: Deadline[] = [];
	briefs.forEach((b, i) => {
		const text = briefTexts[i];
		if (!text) return;
		const { data, body } = splitFrontmatter(text);
		const due = asDate(data.due);
		if (!due) return;
		const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? b.path.split('/')[1];
		const weight =
			data.weight ?? body.match(/\*{0,2}(\d{1,3}%)\*{0,2}\s+of the (?:final )?grade/i)?.[1];
		const project = b.path.split('/')[1];
		out.push({
			id: `project-${project}`,
			title,
			due,
			time: data.time ? String(data.time) : undefined,
			subject: data.subject ?? subjectLabel(project).name,
			weight: weight ? String(weight) : undefined,
			done: data.status === 'submitted' || data.status === 'done' || data.submitted === true,
			kind: 'project',
			source: b.path
		});
	});

	const list: StoredDeadline[] = shared ? (splitFrontmatter(shared).data.deadlines ?? []) : [];
	for (const d of list) {
		const due = asDate(d.due);
		if (!d.title || !due) continue;
		out.push({
			id: deadlineId({ title: d.title, due }),
			title: d.title,
			due,
			time: d.time ? String(d.time) : undefined,
			subject: d.subject || undefined,
			weight: d.weight ? String(d.weight) : undefined,
			notes: d.notes || undefined,
			done: d.done === true,
			kind: 'deadline',
			source: DEADLINES_FILE,
			addedBy: d.added_by
		});
	}
	return out.sort((a, b) => (a.due + (a.time ?? '')).localeCompare(b.due + (b.time ?? '')));
}

/** Rewrite shared/deadlines.md: the frontmatter is the data, the table is for reading in Obsidian. */
export function renderDeadlinesFile(list: StoredDeadline[]) {
	const sorted = [...list].sort((a, b) => a.due.localeCompare(b.due));
	const rows = sorted.map(
		(d) =>
			`| ${d.due}${d.time ? ` ${d.time}` : ''} | ${d.title.replace(/\|/g, '\\|')} | ${d.subject ?? '–'} | ${d.weight ?? '–'} | ${d.done ? 'done' : 'open'} |`
	);
	return `---
${stringify({ tags: ['group', 'deadlines'], date: today(), owner: 'group', deadlines: sorted }).trimEnd()}
---
# Deadlines

Deadlines that aren't a project (exams, quizzes, individual hand-ins). Project deadlines live in each project's \`brief.md\` (\`due:\` in the frontmatter). Edit this list on Study Hub, or edit the frontmatter above by hand.

| Due | What | Subject | Weight | Status |
| --- | --- | --- | --- | --- |
${rows.join('\n')}
`;
}

export async function readStoredDeadlines(token: string, ref: string): Promise<StoredDeadline[]> {
	const text = await readText(token, DEADLINES_FILE, ref);
	if (!text) return [];
	const list = splitFrontmatter(text).data.deadlines ?? [];
	return list.map((d: StoredDeadline) => ({ ...d, due: asDate(d.due) }));
}

export type { StoredDeadline, Change };
