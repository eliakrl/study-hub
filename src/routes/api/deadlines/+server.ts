import { error, json } from '@sveltejs/kit';
import { commit, readText } from '#lib/server/github.js';
import {
	DEADLINES_FILE,
	addToIndex,
	appendLog,
	deadlineId,
	readStoredDeadlines,
	renderDeadlinesFile,
	setFrontmatter,
	type StoredDeadline
} from '#lib/server/vault.js';
import type { RequestHandler } from './$types';

type Body =
	| { action: 'add'; deadline: StoredDeadline }
	| { action: 'toggle'; id: string; done: boolean }
	| { action: 'delete'; id: string };

const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const POST: RequestHandler = async ({ request, locals }) => {
	const { token, login } = locals.session!;
	const body = (await request.json()) as Body;

	// Project deadlines live in projects/<name>/brief.md: only "done" can be changed from here.
	if (body.action === 'toggle' && body.id.startsWith('project-')) {
		const project = body.id.slice('project-'.length);
		if (!/^[\w.-]+$/.test(project)) error(400, 'Bad project');
		const path = `projects/${project}/brief.md`;
		await commit(token, `${project}: mark ${body.done ? 'submitted' : 'not submitted'} (via Study Hub)`, async (snap) => {
			const [brief, log] = await Promise.all([
				readText(token, path, snap.commitSha),
				readText(token, 'log.md', snap.commitSha)
			]);
			if (!brief) error(404, 'Project brief not found');
			return [
				{ path, content: setFrontmatter(brief, { status: body.done ? 'submitted' : undefined }) },
				{
					path: 'log.md',
					content: appendLog(log, login, `${project} marked ${body.done ? 'submitted' : 'not submitted'}`)
				}
			];
		});
		return json({ ok: true });
	}

	let summary = '';
	await commit(token, 'deadlines: update (via Study Hub)', async (snap) => {
		const [list, log, index] = await Promise.all([
			readStoredDeadlines(token, snap.commitSha),
			readText(token, 'log.md', snap.commitSha),
			readText(token, 'index.md', snap.commitSha)
		]);
		let next = list;
		if (body.action === 'add') {
			const d = body.deadline;
			const entry: StoredDeadline = { title: clean(d.title), due: clean(d.due, 10) };
			if (!entry.title || !/^\d{4}-\d{2}-\d{2}$/.test(entry.due)) error(400, 'Title and date are required');
			if (/^\d{2}:\d{2}$/.test(clean(d.time, 5))) entry.time = clean(d.time, 5);
			for (const k of ['subject', 'weight', 'notes'] as const) {
				const v = clean(d[k], k === 'notes' ? 500 : 80);
				if (v) entry[k] = v;
			}
			entry.added_by = login;
			next = [...list, entry];
			summary = `Added deadline: ${entry.title} (${entry.due})`;
		} else {
			const hit = list.find((d) => deadlineId(d) === body.id);
			if (!hit) error(404, 'Deadline not found (someone may have changed it). Reload the page.');
			if (body.action === 'toggle') {
				next = list.map((d) => (d === hit ? { ...d, done: body.done || undefined } : d));
				summary = `Marked ${body.done ? 'done' : 'open'}: ${hit.title}`;
			} else {
				next = list.filter((d) => d !== hit);
				summary = `Removed deadline: ${hit.title} (${hit.due})`;
			}
		}
		const changes = [
			{ path: DEADLINES_FILE, content: renderDeadlinesFile(next) },
			{ path: 'log.md', content: appendLog(log, login, summary) }
		];
		const nextIndex = addToIndex(index, 'Shared', `- [[shared/deadlines]] — exams, quizzes and other deadlines`);
		if (nextIndex !== index) changes.push({ path: 'index.md', content: nextIndex });
		return changes;
	});
	return json({ ok: true });
};
