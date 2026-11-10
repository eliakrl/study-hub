export interface User {
	login: string;
	name: string;
	avatar: string;
}

export interface VaultFile {
	path: string;
	name: string;
	category: string;
	size: number;
}

export interface Subject {
	slug: string;
	name: string;
	code: string;
	files: VaultFile[];
}

export interface Activity {
	message: string;
	login: string;
	avatar: string;
	date: string;
	url: string;
}

export const STEP_TYPES = [
	{ id: 'submission', label: 'Submission' },
	{ id: 'presentation', label: 'Presentation' },
	{ id: 'other', label: 'Other' }
] as const;

export type StepType = (typeof STEP_TYPES)[number]['id'];

/** One dated part of an assessment, e.g. the presentation or the written submission. */
export interface Step {
	id: string;
	type: StepType;
	/** Custom name, mainly for "other" steps. */
	label?: string;
	due: string; // YYYY-MM-DD
	/** Second possible date when the slot isn't fixed yet ("Week 10 or Week 11"). */
	alt?: string;
	time?: string; // HH:MM
	done: boolean;
}

/** An assessment (CA, project, quiz) with one or more steps. */
export interface Assessment {
	id: string;
	title: string;
	subject?: string;
	weight?: string;
	notes?: string;
	kind: 'project' | 'deadline';
	/** Vault file the assessment lives in. */
	source: string;
	addedBy?: string;
	steps: Step[];
}

export function stepName(step: Step) {
	return step.label || STEP_TYPES.find((t) => t.id === step.type)?.label || 'Deadline';
}

/** Every step as its own dated entry, soonest first. */
export function timeline(assessments: Assessment[]) {
	return assessments
		.flatMap((assessment) => assessment.steps.map((step) => ({ assessment, step })))
		.sort((a, b) =>
			(a.step.due + (a.step.time ?? '')).localeCompare(b.step.due + (b.step.time ?? ''))
		);
}

export type TimelineItem = ReturnType<typeof timeline>[number];

export const CATEGORIES = [
	{ id: 'lecture-slides', label: 'Lecture slides' },
	{ id: 'readings', label: 'Readings' },
	{ id: 'briefs', label: 'CA / Briefs' },
	{ id: 'other', label: 'Other' }
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

/** The date that counts today: for an either/or slot whose first date has passed, the second one. */
export function effectiveDue(step: Step, today: string) {
	return step.alt && step.due < today ? step.alt : step.due;
}
