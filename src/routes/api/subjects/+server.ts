import { error, json } from '@sveltejs/kit';
import { commit, readText } from '#lib/server/github.js';
import {
	addDecision,
	addTask,
	decisionsPath,
	tasksPath,
	updateTask
} from '#lib/server/subject.js';
import { addToIndex, appendLog, subjectName, today } from '#lib/server/vault.js';
import type { RequestHandler } from './$types';

type Body = { slug: string } & (
	| { action: 'addTask'; text: string; owner?: string; due?: string }
	| { action: 'toggleTask'; index: number; text: string; done: boolean }
	| { action: 'deleteTask'; index: number; text: string }
	| { action: 'addDecision'; decision: string; why?: string }
);

const clean = (v: unknown, max = 200) =>
	typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, max) : '';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { token, login } = locals.session!;
	const body = (await request.json()) as Body;
	if (!/^[\w.-]+$/.test(body.slug ?? '')) error(400, 'Bad subject');
	const isTask = body.action !== 'addDecision';
	const path = isTask ? tasksPath(body.slug) : decisionsPath(body.slug);

	let summary = '';
	await commit(token, `${body.slug}: update ${isTask ? 'tasks' : 'decisions'} (via Study Hub)`, async (snap) => {
		if (!snap.entries.some((e) => e.path.startsWith(`subjects/${body.slug}/`)))
			error(404, 'No such subject');
		const [file, log, index, name] = await Promise.all([
			readText(token, path, snap.commitSha),
			readText(token, 'log.md', snap.commitSha),
			readText(token, 'index.md', snap.commitSha),
			subjectName(token, snap, body.slug)
		]);
		let next: string | null;
		if (body.action === 'addTask') {
			const text = clean(body.text);
			if (!text) error(400, 'The task needs a description');
			const owner = clean(body.owner, 40).replace(/^@/, '');
			const due = clean(body.due, 10);
			next = addTask(
				file,
				{
					text,
					owner: /^[\w-]+$/.test(owner) ? owner : undefined,
					due: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : undefined
				},
				body.slug,
				name,
				login
			);
			summary = `${name}: new task "${text}"${owner ? ` for @${owner}` : ''}`;
		} else if (body.action === 'addDecision') {
			const decision = clean(body.decision, 300);
			if (!decision) error(400, 'The decision needs some text');
			next = addDecision(
				file,
				{ date: today(), decision, why: clean(body.why, 300) },
				body.slug,
				name,
				login
			);
			summary = `${name}: decided "${decision}"`;
		} else {
			if (!file) error(404, 'No tasks yet. Reload the page.');
			next = updateTask(
				file,
				Number(body.index),
				String(body.text),
				body.action === 'deleteTask' ? 'delete' : { done: !!body.done }
			);
			if (next === null) error(404, 'That task changed in the meantime. Reload the page.');
			summary =
				body.action === 'deleteTask'
					? `${name}: removed task "${body.text}"`
					: `${name}: task ${body.done ? 'done' : 'reopened'}: "${body.text}"`;
		}
		const changes = [
			{ path, content: next },
			{ path: 'log.md', content: appendLog(log, login, summary) }
		];
		if (!file) {
			const label = isTask ? 'Tasks' : 'Decisions';
			const nextIndex = addToIndex(
				index,
				'Subjects',
				`- [[${path.replace(/\.md$/, '')}|${name} — ${label}]]`
			);
			if (nextIndex !== index) changes.push({ path: 'index.md', content: nextIndex });
		}
		return changes;
	});
	return json({ ok: true });
};
