import { error } from '@sveltejs/kit';
import { repoConfig } from '#lib/server/config.js';
import { encodePath, repoPath } from '#lib/server/github.js';
import type { RequestHandler } from './$types';

const TYPES: Record<string, string> = {
	pdf: 'application/pdf',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	svg: 'image/svg+xml',
	txt: 'text/plain; charset=utf-8',
	md: 'text/plain; charset=utf-8',
	csv: 'text/plain; charset=utf-8',
	pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
// Shown in the browser; everything else downloads.
const INLINE = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'md', 'csv']);

/** Streams a vault file from the private repo with the member's own token, so it opens in the browser. */
export const GET: RequestHandler = async ({ params, locals, url }) => {
	const path = params.path;
	if (!path || path.split('/').some((p) => p === '..' || p === '')) error(400, 'Bad path');
	const res = await fetch(`${repoConfig().api}${repoPath(`/contents/${encodePath(path)}`)}`, {
		headers: {
			Accept: 'application/vnd.github.raw+json',
			Authorization: `Bearer ${locals.session!.token}`,
			'User-Agent': 'study-hub'
		}
	});
	if (res.status === 404) error(404, 'File not found');
	if (!res.ok) error(502, 'GitHub refused the file');
	const name = path.split('/').at(-1)!;
	const ext = name.split('.').pop()!.toLowerCase();
	const disposition = INLINE.has(ext) && !url.searchParams.has('download') ? 'inline' : 'attachment';
	return new Response(res.body, {
		headers: {
			'Content-Type': TYPES[ext] ?? 'application/octet-stream',
			'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
			'Cache-Control': 'private, max-age=300',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
