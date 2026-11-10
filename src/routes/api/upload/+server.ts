import { error, json } from '@sveltejs/kit';
import { commit, readText, type Change } from '#lib/server/github.js';
import {
	addToIndex,
	appendLog,
	appendRows,
	newOverview,
	newSubjectNote,
	safeFileName,
	slugify,
	subjectName,
	uniquePath
} from '#lib/server/vault.js';
import { CATEGORIES } from '#lib/types.js';
import type { RequestHandler } from './$types';

interface Body {
	subject: string; // existing slug, or "" for a new one
	newSubject?: { name: string; code: string; lecturer: string; email?: string; lms?: string };
	category: string;
	week: string;
	files: { name: string; sha: string }[];
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { token, login } = locals.session!;
	const body = (await request.json()) as Body;
	if (!body.files?.length) error(400, 'No files');
	if (!CATEGORIES.some((c) => c.id === body.category)) error(400, 'Unknown category');
	if (body.files.some((f) => !/^[0-9a-f]{40}$/.test(f.sha))) error(400, 'Bad file id');
	const week = String(body.week ?? '').trim().slice(0, 10);

	const isNew = !body.subject;
	let slug = body.subject;
	let code = '';
	let displayName = '';
	if (isNew) {
		const n = body.newSubject;
		if (!n?.name?.trim()) error(400, 'New subject needs a name');
		code = n.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
		slug = slugify(n.name) + (code ? `-${code}` : '');
		displayName = n.name.trim();
	} else {
		if (!/^[\w.-]+$/.test(slug)) error(400, 'Bad subject');
	}
	const folder = `subjects/${slug}/${body.category}`;
	const categoryLabel = CATEGORIES.find((c) => c.id === body.category)!.label;
	const count = `${body.files.length} file${body.files.length > 1 ? 's' : ''}`;
	const placed: string[] = [];

	const message = `${slug}: add ${count} to ${categoryLabel} (via Study Hub)`;
	const sha = await commit(token, message, async (snap) => {
		if (!isNew) displayName = await subjectName(token, snap, slug);
		const taken = new Set(snap.entries.map((e) => e.path));
		const changes: Change[] = [];
		placed.length = 0;
		for (const f of body.files) {
			const path = uniquePath(`${folder}/${safeFileName(f.name)}`, taken);
			taken.add(path);
			placed.push(path);
			changes.push({ path, sha: f.sha });
		}

		const ref = snap.commitSha;
		const overviewPath = `${folder}/overview.md`;
		const [overview, log, index] = await Promise.all([
			readText(token, overviewPath, ref),
			readText(token, 'log.md', ref),
			readText(token, 'index.md', ref)
		]);
		const rows = placed.map((p) => {
			const name = p.split('/').at(-1)!;
			const title = name.replace(/\.[^.]+$/, '');
			return { week, link: `[[${name}\\|${title}]]`, login };
		});
		const base = overview ?? newOverview(displayName, body.category, login);
		changes.push({ path: overviewPath, content: appendRows(base, rows) });

		let nextIndex = index;
		if (isNew && !taken.has(`subjects/${slug}/overview.md`)) {
			const n = body.newSubject!;
			changes.push({
				path: `subjects/${slug}/overview.md`,
				content: newSubjectNote(
					displayName,
					code,
					{
						lecturer: n.lecturer.trim().slice(0, 100),
						email: String(n.email ?? '').trim().slice(0, 100),
						lms: /^https:\/\/\S+$/.test(String(n.lms ?? '').trim()) ? String(n.lms).trim().slice(0, 300) : ''
					},
					login
				)
			});
			nextIndex = addToIndex(nextIndex, 'Subjects', `- [[subjects/${slug}/overview|${displayName}]]`);
		}
		if (!overview) {
			const label = CATEGORIES.find((c) => c.id === body.category)!.label;
			nextIndex = addToIndex(
				nextIndex,
				'Subjects',
				`- [[${overviewPath.replace(/\.md$/, '')}|${displayName} — ${label}]]`
			);
		}
		if (nextIndex !== index) changes.push({ path: 'index.md', content: nextIndex! });

		const list = placed
			.map((p) => `\`${p.split('/').at(-1)}\``)
			.join(', ');
		changes.push({
			path: 'log.md',
			content: appendLog(
				log,
				login,
				`Added ${count} to ${categoryLabel} in ${displayName}`,
				`Added to \`${folder}/\`${week ? ` (week ${week})` : ''}: ${list}. Uploaded via Study Hub.`
			)
		});
		return changes;
	});

	return json({ commit: sha, paths: placed });
};
