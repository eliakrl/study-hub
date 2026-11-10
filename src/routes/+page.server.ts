import { recentActivity, subjects, loadDeadlines, today } from '#lib/server/vault.js';
import { snapshot } from '#lib/server/github.js';
import { effectiveDue, stepName, timeline } from '#lib/types.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const token = locals.session!.token;
	const snap = await snapshot(token);
	const [activity, assessments, subjectList] = await Promise.all([
		recentActivity(token).catch(() => []),
		loadDeadlines(token, snap).catch(() => []),
		subjects(token, snap)
	]);
	const now = today();
	const upcoming = timeline(assessments)
		.filter(({ step }) => !step.done && effectiveDue(step, now) >= now)
		.slice(0, 3)
		.map(({ assessment, step }) => ({
			title: assessment.title,
			step: stepName(step),
			due: effectiveDue(step, now),
			alt: step.alt && step.due >= now ? step.alt : undefined,
			subject: assessment.subject
		}));
	return { subjects: subjectList, activity, upcoming, today: now };
};
