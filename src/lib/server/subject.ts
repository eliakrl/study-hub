import type { Decision, Member, Task } from '#lib/types.js';
import { gh, readText, repoPath, type Snapshot } from './github';
import { cells, splitFrontmatter, today } from './vault';

/**
 * Per-subject notes the hub reads and writes, in the same formats the projects already use:
 * `tasks.md` is a `- [ ]` checklist, `decisions.md` a Date | Decision | Why table.
 */
export const tasksPath = (slug: string) => `subjects/${slug}/tasks.md`;
export const decisionsPath = (slug: string) => `subjects/${slug}/decisions.md`;

const TASK_LINE = /^- \[([ xX])\] (.*)$/;

/** "Draft intro (@eliakrl, due 2026-11-20)" → text, owner, due. */
function parseTaskBody(body: string) {
	const meta = body.match(/\s+\(([^()]*)\)\s*$/);
	if (meta) {
		const parts = meta[1].split(',').map((p) => p.trim());
		const owner = parts.find((p) => p.startsWith('@'))?.slice(1);
		const due = parts.find((p) => /^due \d{4}-\d{2}-\d{2}$/.test(p))?.slice(4);
		if ((owner || due) && parts.every((p) => p.startsWith('@') || p.startsWith('due ')))
			return { text: body.slice(0, meta.index).trim(), owner, due };
	}
	return { text: body.trim() };
}

export function parseTasks(text: string | null): Task[] {
	if (!text) return [];
	const out: Task[] = [];
	for (const line of splitFrontmatter(text).body.split('\n')) {
		const m = line.match(TASK_LINE);
		if (!m) continue;
		out.push({ index: out.length, done: m[1] !== ' ', ...parseTaskBody(m[2]) });
	}
	return out;
}

export function taskLine(t: Pick<Task, 'text' | 'done' | 'owner' | 'due'>) {
	const meta = [t.owner ? `@${t.owner}` : '', t.due ? `due ${t.due}` : ''].filter(Boolean);
	return `- [${t.done ? 'x' : ' '}] ${t.text}${meta.length ? ` (${meta.join(', ')})` : ''}`;
}

function newNote(kind: 'tasks' | 'decisions', slug: string, name: string, login: string) {
	const header = `---\ntags: [${slug}, ${kind}]\ndate: ${today()}\nowner: ${login}\n---\n`;
	return kind === 'tasks'
		? `${header}# ${name} — Tasks\n\nWho does what. Tick things off on Study Hub or right here in Obsidian.\n\n`
		: `${header}# ${name} — Decisions\n\nSettled. Don't re-propose unless the group reopens it.\n\n| Date | Decision | Why |\n| --- | --- | --- |\n`;
}

/** Line numbers (in the whole file) of each task, in order. */
function taskLineNumbers(lines: string[]) {
	return lines.flatMap((l, i) => (TASK_LINE.test(l) ? [i] : []));
}

/** Find a task by index, falling back to its text if the list moved underneath us. */
function locate(lines: string[], index: number, text: string) {
	const nums = taskLineNumbers(lines);
	const matches = (n: number) => parseTaskBody(lines[n].match(TASK_LINE)![2]).text === text;
	if (nums[index] !== undefined && matches(nums[index])) return nums[index];
	return nums.find(matches);
}

export function addTask(
	file: string | null,
	task: Pick<Task, 'text' | 'owner' | 'due'>,
	slug: string,
	name: string,
	login: string
) {
	const lines = (file ?? newNote('tasks', slug, name, login)).replace(/\n+$/, '').split('\n');
	const nums = taskLineNumbers(lines);
	const line = taskLine({ ...task, done: false });
	if (nums.length) lines.splice(nums.at(-1)! + 1, 0, line);
	else lines.push('', line);
	return lines.join('\n') + '\n';
}

export function updateTask(
	file: string,
	index: number,
	text: string,
	change: { done: boolean } | 'delete'
) {
	const lines = file.split('\n');
	const at = locate(lines, index, text);
	if (at === undefined) return null;
	if (change === 'delete') lines.splice(at, 1);
	else {
		const m = lines[at].match(TASK_LINE)!;
		lines[at] = taskLine({ ...parseTaskBody(m[2]), done: change.done });
	}
	return lines.join('\n');
}

export function parseDecisions(text: string | null): Decision[] {
	if (!text) return [];
	const lines = splitFrontmatter(text).body.split('\n');
	const head = lines.findIndex((l) => l.trim().startsWith('|') && /decision/i.test(l));
	if (head === -1) return [];
	const header = cells(lines[head]).map((h) => h.toLowerCase());
	const col = (name: string) => header.findIndex((h) => h.includes(name));
	const [d, dec, why] = [col('date'), col('decision'), col('why')];
	const out: Decision[] = [];
	for (let i = head + 2; i < lines.length && lines[i].trim().startsWith('|'); i++) {
		const c = cells(lines[i]).map((x) => x.replace(/\\\|/g, '|'));
		out.push({ date: c[d] ?? '', decision: c[dec] ?? '', why: why === -1 ? '' : (c[why] ?? '') });
	}
	return out;
}

export function addDecision(
	file: string | null,
	row: Decision,
	slug: string,
	name: string,
	login: string
) {
	const text = file ?? newNote('decisions', slug, name, login);
	const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ');
	const line = `| ${row.date} | ${esc(row.decision)} | ${esc(row.why) || '–'} |`;
	const lines = text.replace(/\n+$/, '').split('\n');
	const head = lines.findIndex((l) => l.trim().startsWith('|') && /decision/i.test(l));
	if (head === -1) {
		lines.push('', '| Date | Decision | Why |', '| --- | --- | --- |', line);
	} else {
		let last = head + 1;
		while (last + 1 < lines.length && lines[last + 1].trim().startsWith('|')) last++;
		lines.splice(last + 1, 0, line);
	}
	return lines.join('\n') + '\n';
}

/** "Lecturer: Dr X" from the subject note. */
export async function subjectDetails(token: string, snap: Snapshot, slug: string) {
	const path = `subjects/${slug}/overview.md`;
	if (!snap.entries.some((e) => e.path === path)) return { lecturer: '' };
	const text = await readText(token, path, snap.commitSha);
	return { lecturer: text?.match(/^Lecturer:[ \t]*(.*)$/m)?.[1]?.trim() ?? '' };
}

export async function members(token: string): Promise<Member[]> {
	const list = await gh<any[]>(token, repoPath('/collaborators?per_page=50')).catch(() => []);
	return list.map((m) => ({ login: m.login, avatar: m.avatar_url }));
}
