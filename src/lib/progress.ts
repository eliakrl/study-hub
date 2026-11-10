import { effectiveDue, timeline, type Assessment, type Task } from './types';

/** Tasks plus deadline steps for one subject: what's done, what's left, what's next. */
export function progress(tasks: Task[], assessments: Assessment[], today: string) {
	const steps = timeline(assessments);
	const total = tasks.length + steps.length;
	const done = tasks.filter((t) => t.done).length + steps.filter((s) => s.step.done).length;
	const next = steps.find((s) => !s.step.done && effectiveDue(s.step, today) >= today);
	return {
		total,
		done,
		openTasks: tasks.filter((t) => !t.done).length,
		next: next && {
			title: next.assessment.title,
			step: next.step,
			due: effectiveDue(next.step, today)
		}
	};
}
