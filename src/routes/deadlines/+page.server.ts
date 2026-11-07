import { snapshot } from '#lib/server/github.js';
import { loadDeadlines, subjects, today } from '#lib/server/vault.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const token = locals.session!.token;
	const snap = await snapshot(token);
	return {
		deadlines: await loadDeadlines(token, snap),
		subjects: subjects(snap).map((s) => s.name),
		today: today()
	};
};
