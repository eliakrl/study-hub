import { error, json } from '@sveltejs/kit';
import { commit, readText } from '#lib/server/github.js';
import {
	DEADLINES_FILE,
	addToIndex,
	appendLog,
	newDeadlineId,
	readStoredDeadlines,
	renderDeadlinesFile,
	setFrontmatter,
	splitStepId,
	type StoredDeadline,
	type StoredStep
} from '#lib/server/vault.js';
import { STEP_TYPES } from '#lib/types.js';
import type { RequestHandler } from './$types';

type Body =
	| { action: 'add'; deadline: Partial<StoredDeadline> & { steps?: Partial<StoredStep>[] } }
	| { action: 'toggle'; id: string; done: boolean }
	| { action: 'pick'; id: string; date: string }
	| { action: 'delete'; id: string };

const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const stepLabel = (s: StoredStep) => s.label ?? STEP_TYPES.find((t) => t.id === s.type)!.label;

function parseNew(
	d: Extract<Body, { action: 'add' }>['deadline'],
	login: string,
	taken: Set<string>
): StoredDeadline {
	const title = clean(d.title);
	const steps: StoredStep[] = (d.steps ?? []).slice(0, 6).flatMap((s) => {
		const due = clean(s.due, 10);
		if (!isDate(due)) return [];
		const step: StoredStep = {
			type: STEP_TYPES.some((t) => t.id === s.type) ? s.type! : 'submission'
		} as StoredStep;
		const label = clean(s.label, 60);
		if (label) step.label = label;
		const or = clean(s.or, 10);
		// Keep the earlier date as `due` so countdowns use the first possible slot.
		if (isDate(or) && or !== due) [step.due, step.or] = or < due ? [or, due] : [due, or];
		else step.due = due;
		const time = clean(s.time, 5);
		if (/^\d{2}:\d{2}$/.test(time)) step.time = time;
		return [step];
	});
	if (!title || !steps.length) error(400, 'A title and at least one date are required');
	// Key order is what people see when they open shared/deadlines.md in Obsidian.
	const out = { id: newDeadlineId(title, taken), title } as StoredDeadline;
	for (const k of ['subject', 'weight', 'notes'] as const) {
		const v = clean(d[k], k === 'notes' ? 500 : 80);
		if (v) out[k] = v;
	}
	out.added_by = login;
	out.steps = steps;
	return out;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { token, login } = locals.session!;
	const body = (await request.json()) as Body;

	// Project dates live in projects/<name>/brief.md: only "done" can be changed from here.
	if (body.action === 'toggle' && body.id.startsWith('project-')) {
		const ids = splitStepId(body.id);
		const project = ids?.assessment.slice('project-'.length) ?? '';
		if (!/^[\w.-]+$/.test(project) || !ids || !['submission', 'presentation'].includes(ids.step))
			error(400, 'Bad project step');
		const path = `projects/${project}/brief.md`;
		const isSubmission = ids.step === 'submission';
		const what = isSubmission
			? body.done ? 'submitted' : 'not submitted'
			: body.done ? 'presented' : 'not presented';
		await commit(token, `${project}: mark ${what} (via Study Hub)`, async (snap) => {
			const [brief, log] = await Promise.all([
				readText(token, path, snap.commitSha),
				readText(token, 'log.md', snap.commitSha)
			]);
			if (!brief) error(404, 'Project brief not found');
			const update = isSubmission
				? { status: body.done ? 'submitted' : undefined }
				: { presented: body.done ? true : undefined };
			return [
				{ path, content: setFrontmatter(brief, update) },
				{ path: 'log.md', content: appendLog(log, login, `${project} marked ${what}`) }
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
			const entry = parseNew(body.deadline, login, new Set(list.map((d) => d.id)));
			next = [...list, entry];
			const dates = entry.steps
				.map((s) => `${stepLabel(s).toLowerCase()} ${s.due}${s.or ? ` or ${s.or}` : ''}`)
				.join(', ');
			summary = `Added deadline: ${entry.title}${entry.subject ? ` (${entry.subject})` : ''}, ${dates}`;
		} else {
			const ids = body.action === 'delete' ? { assessment: body.id, step: '' } : splitStepId(body.id);
			const hit = ids && list.find((d) => d.id === ids.assessment);
			if (!ids || !hit) error(404, 'Deadline not found (someone may have changed it). Reload the page.');
			const index = Number(ids.step);
			const step = hit.steps[index];
			if (body.action !== 'delete' && !step) error(404, 'Step not found. Reload the page.');
			const withStep = (s: StoredStep) =>
				next.map((d) => (d === hit ? { ...d, steps: d.steps.map((x, i) => (i === index ? s : x)) } : d));
			if (body.action === 'toggle') {
				const { done: _, ...rest } = step;
				next = withStep(body.done ? { ...rest, done: true } : rest);
				summary = `Marked ${body.done ? 'done' : 'open'}: ${hit.title} (${stepLabel(step).toLowerCase()})`;
			} else if (body.action === 'pick') {
				if (!step.or || ![step.due, step.or].includes(body.date)) error(400, 'Not one of the dates');
				const { or: _, ...rest } = step;
				next = withStep({ ...rest, due: body.date });
				summary = `${hit.title}: ${stepLabel(step).toLowerCase()} is on ${body.date}`;
			} else {
				next = list.filter((d) => d !== hit);
				summary = `Removed deadline: ${hit.title}`;
			}
		}
		const changes = [
			{ path: DEADLINES_FILE, content: renderDeadlinesFile(next) },
			{ path: 'log.md', content: appendLog(log, login, summary) }
		];
		const nextIndex = addToIndex(index, 'Shared', `- [[shared/deadlines]] — CAs, presentations and other deadlines`);
		if (nextIndex !== index) changes.push({ path: 'index.md', content: nextIndex });
		return changes;
	});
	return json({ ok: true });
};
