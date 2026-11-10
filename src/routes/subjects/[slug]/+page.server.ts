import { error } from '@sveltejs/kit';
import { readText, snapshot } from '#lib/server/github.js';
import {
	decisionsPath,
	members,
	parseDecisions,
	parseTasks,
	tasksPath
} from '#lib/server/subject.js';
import { loadDeadlines, subjects, today } from '#lib/server/vault.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const token = locals.session!.token;
	const snap = await snapshot(token);
	const all = await subjects(token, snap);
	const subject = all.find((s) => s.slug === params.slug);
	if (!subject) error(404, 'No such subject in the vault');
	const read = (path: string) =>
		snap.entries.some((e) => e.path === path) ? readText(token, path, snap.commitSha) : null;
	const [tasks, decisions, assessments, team] = await Promise.all([
		read(tasksPath(subject.slug)),
		read(decisionsPath(subject.slug)),
		loadDeadlines(token, snap),
		members(token)
	]);
	// A project folder whose name the subject starts with, e.g. projects/capstone for capstone-B8AF124.
	const project = snap.entries.find(
		(e) =>
			/^projects\/[^/]+\/brief\.md$/.test(e.path) &&
			subject.slug.toLowerCase().startsWith(e.path.split('/')[1].toLowerCase())
	);
	return {
		subject,
		tasks: parseTasks(tasks),
		decisions: parseDecisions(decisions).reverse(),
		assessments: assessments.filter((a) => a.subject === subject.name),
		members: team,
		project: project ? project.path.replace(/\/brief\.md$/, '') : null,
		today: today()
	};
};
