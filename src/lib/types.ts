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

export interface Deadline {
	id: string;
	title: string;
	due: string; // YYYY-MM-DD
	time?: string; // HH:MM
	subject?: string;
	weight?: string;
	notes?: string;
	done: boolean;
	kind: 'project' | 'deadline';
	/** Vault file the deadline lives in. */
	source: string;
	addedBy?: string;
}

export const CATEGORIES = [
	{ id: 'lecture-slides', label: 'Lecture slides' },
	{ id: 'readings', label: 'Readings' },
	{ id: 'briefs', label: 'CA / Briefs' },
	{ id: 'other', label: 'Other' }
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];
