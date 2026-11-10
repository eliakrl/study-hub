import { snapshot, readText } from '#lib/server/github.js';
import { parseTasks, tasksPath } from '#lib/server/subject.js';
import { loadDeadlines, subjects, today } from '#lib/server/vault.js';
import { progress } from '#lib/progress.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const token = locals.session!.token;
	const snap = await snapshot(token);
	const now = today();
	const [list, assessments] = await Promise.all([subjects(token, snap), loadDeadlines(token, snap)]);
	const tasks = await Promise.all(
		list.map((s) =>
			snap.entries.some((e) => e.path === tasksPath(s.slug))
				? readText(token, tasksPath(s.slug), snap.commitSha).then(parseTasks)
				: []
		)
	);
	return {
		today: now,
		subjects: list.map((s, i) => ({
			slug: s.slug,
			name: s.name,
			code: s.code,
			files: s.files.length,
			progress: progress(tasks[i], assessments.filter((a) => a.subject === s.name), now)
		}))
	};
};
