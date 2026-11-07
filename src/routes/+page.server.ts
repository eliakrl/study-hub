import { recentActivity, subjects, loadDeadlines, today } from '#lib/server/vault.js';
import { snapshot } from '#lib/server/github.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const token = locals.session!.token;
	const snap = await snapshot(token);
	const [activity, deadlines] = await Promise.all([
		recentActivity(token).catch(() => []),
		loadDeadlines(token, snap).catch(() => [])
	]);
	const now = today();
	return {
		subjects: subjects(snap),
		activity,
		upcoming: deadlines.filter((d) => !d.done && d.due >= now).slice(0, 3),
		today: now
	};
};
