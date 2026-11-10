import { parse, parseDocument, stringify } from 'yaml';
import {
	CATEGORIES,
	STEP_TYPES,
	type Activity,
	type Assessment,
	type Step,
	type StepType,
	type Subject,
	type VaultFile
} from '#lib/types.js';
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

/**
 * A subject's display name: the H1 of `subjects/<slug>/overview.md` without the "(CODE)" suffix,
 * falling back to a name built from the folder.
 */
export async function subjectName(token: string, snap: Snapshot, slug: string) {
	const path = `subjects/${slug}/overview.md`;
	const fallback = subjectLabel(slug).name;
	if (!snap.entries.some((e) => e.path === path)) return fallback;
	const text = await readText(token, path, snap.commitSha).catch(() => null);
	const h1 = text && splitFrontmatter(text).body.match(/^#\s+(.+)$/m)?.[1];
	return h1?.replace(/\s*\([A-Z0-9]{4,}\)\s*$/, '').trim() || fallback;
}

export async function subjects(token: string, snap: Snapshot): Promise<Subject[]> {
	const list = subjectFiles(snap);
	const names = await Promise.all(list.map((s) => subjectName(token, snap, s.slug)));
	list.forEach((s, i) => (s.name = names[i]));
	return list.sort((a, b) => a.name.localeCompare(b.name));
}

function subjectFiles(snap: Snapshot): Subject[] {
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

interface StoredStep {
	type: StepType;
	label?: string;
	due: string;
	or?: string;
	time?: string;
	done?: boolean;
}

interface StoredDeadline {
	/** Fixed at creation so it survives edits to the title or dates. */
	id: string;
	title: string;
	subject?: string;
	weight?: string;
	notes?: string;
	added_by?: string;
	steps: StoredStep[];
}

const asDate = (v: unknown) =>
	v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' ? v.slice(0, 10) : '';
const asTime = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : String(v));

/** Accepts the current shape and the old one-date shape (`due`, `time`, `done` on the item). */
function normalize(raw: any): StoredDeadline | null {
	if (!raw?.title) return null;
	const rawSteps: any[] = Array.isArray(raw.steps) && raw.steps.length ? raw.steps : [raw];
	const steps = rawSteps
		.map((s) => ({
			type: STEP_TYPES.some((t) => t.id === s.type) ? s.type : 'submission',
			...(s.label ? { label: String(s.label) } : {}),
			due: asDate(s.due),
			...(asDate(s.or) ? { or: asDate(s.or) } : {}),
			...(asTime(s.time) ? { time: asTime(s.time) } : {}),
			...(s.done === true ? { done: true } : {})
		}))
		.filter((s) => s.due);
	if (!steps.length) return null;
	const title = String(raw.title);
	return {
		id: raw.id ? String(raw.id) : `${steps.map((s) => s.due).sort()[0]}-${slugify(title)}`.slice(0, 80),
		title,
		...(raw.subject ? { subject: String(raw.subject) } : {}),
		...(raw.weight ? { weight: String(raw.weight) } : {}),
		...(raw.notes ? { notes: String(raw.notes) } : {}),
		...(raw.added_by ? { added_by: String(raw.added_by) } : {}),
		steps
	};
}

const firstDue = (d: StoredDeadline) => d.steps.map((s) => s.due).sort()[0];

export function newDeadlineId(title: string, taken: Set<string>) {
	const base = slugify(title).slice(0, 60) || 'deadline';
	let id = base;
	for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
	return id;
}

/** Step ids are `<assessment id>~<index>`; project steps use their type instead of an index. */
export function splitStepId(id: string) {
	const at = id.lastIndexOf('~');
	return at === -1 ? null : { assessment: id.slice(0, at), step: id.slice(at + 1) };
}

/** Project dates come from the brief: `due:` (submission) and optionally `presentation:` (a date, or two for either/or). */
function projectAssessment(path: string, text: string): Assessment | null {
	const { data, body } = splitFrontmatter(text);
	const project = path.split('/')[1];
	const id = `project-${project}`;
	const steps: Step[] = [];
	const due = asDate(data.due);
	if (due)
		steps.push({
			id: `${id}~submission`,
			type: 'submission',
			due,
			time: asTime(data.time),
			done: data.status === 'submitted' || data.status === 'done' || data.submitted === true
		});
	const pres = (Array.isArray(data.presentation) ? data.presentation : [data.presentation])
		.map(asDate)
		.filter(Boolean)
		.sort();
	if (pres.length)
		steps.push({
			id: `${id}~presentation`,
			type: 'presentation',
			due: pres[0],
			alt: pres[1],
			time: asTime(data.presentation_time),
			done: data.presented === true
		});
	if (!steps.length) return null;
	const weight =
		data.weight ?? body.match(/\*{0,2}(\d{1,3}%)\*{0,2}\s+of the (?:final )?grade/i)?.[1];
	return {
		id,
		title: body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? project,
		subject: data.subject ?? subjectLabel(project).name,
		weight: weight ? String(weight) : undefined,
		kind: 'project',
		source: path,
		steps
	};
}

export async function loadDeadlines(token: string, snap: Snapshot): Promise<Assessment[]> {
	const briefs = snap.entries.filter((e) => /^projects\/[^/]+\/brief\.md$/.test(e.path));
	const [stored, ...briefTexts] = await Promise.all([
		readStoredDeadlines(token, snap.commitSha),
		...briefs.map((b) => readText(token, b.path, snap.commitSha))
	]);

	const out: Assessment[] = [];
	briefs.forEach((b, i) => {
		const a = briefTexts[i] && projectAssessment(b.path, briefTexts[i]!);
		if (a) out.push(a);
	});
	for (const d of stored) {
		const id = d.id;
		out.push({
			id,
			title: d.title,
			subject: d.subject,
			weight: d.weight,
			notes: d.notes,
			kind: 'deadline',
			source: DEADLINES_FILE,
			addedBy: d.added_by,
			steps: d.steps.map((s, i) => ({
				id: `${id}~${i}`,
				type: s.type,
				label: s.label,
				due: s.due,
				alt: s.or,
				time: s.time,
				done: s.done === true
			}))
		});
	}
	return out;
}

/** Rewrite shared/deadlines.md: the frontmatter is the data, the table is for reading in Obsidian. */
export function renderDeadlinesFile(list: StoredDeadline[]) {
	const sorted = [...list].sort((a, b) => firstDue(a).localeCompare(firstDue(b)));
	const cell = (v?: string) => (v ? v.replace(/\|/g, '\\|') : '–');
	const rows = sorted
		.flatMap((d) =>
			d.steps.map((s) => ({
				sort: s.due,
				row: `| ${s.due}${s.or ? ` or ${s.or}` : ''}${s.time ? ` ${s.time}` : ''} | ${cell(d.title)} | ${cell(s.label ?? STEP_TYPES.find((t) => t.id === s.type)?.label)} | ${cell(d.subject)} | ${cell(d.weight)} | ${s.done ? 'done' : 'open'} |`
			}))
		)
		.sort((a, b) => a.sort.localeCompare(b.sort))
		.map((r) => r.row);
	return `---
${stringify({ tags: ['group', 'deadlines'], date: today(), owner: 'group', deadlines: sorted }).trimEnd()}
---
# Deadlines

Assessments that aren't a group project folder (CAs, quizzes, individual hand-ins), each with its steps (presentation, submission…). Project deadlines live in each project's \`brief.md\` (\`due:\`, and optionally \`presentation:\`). Edit this list on Study Hub, or edit the frontmatter above by hand.

| Date | What | Step | Subject | Weight | Status |
| --- | --- | --- | --- | --- | --- |
${rows.join('\n')}
`;
}

export async function readStoredDeadlines(token: string, ref: string): Promise<StoredDeadline[]> {
	const text = await readText(token, DEADLINES_FILE, ref);
	if (!text) return [];
	const list = splitFrontmatter(text).data.deadlines;
	return (Array.isArray(list) ? list : []).map(normalize).filter((d): d is StoredDeadline => !!d);
}

export type { StoredDeadline, StoredStep, Change };
