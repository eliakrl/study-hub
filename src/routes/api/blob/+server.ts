import { error, json } from '@sveltejs/kit';
import { repoPath } from '#lib/server/github.js';
import { repoConfig } from '#lib/server/config.js';
import type { RequestHandler } from './$types';

/**
 * The browser sends `{"content": "<base64>", "encoding": "base64"}` and we stream it straight to
 * GitHub's blob API, so a big PDF never sits in the Worker's memory. Returns the blob sha.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const res = await fetch(`${repoConfig().api}${repoPath('/git/blobs')}`, {
		method: 'POST',
		headers: {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${locals.session!.token}`,
			'Content-Type': 'application/json',
			'User-Agent': 'study-hub',
			'X-GitHub-Api-Version': '2022-11-28'
		},
		body: request.body,
		// @ts-expect-error: required by fetch when streaming a request body
		duplex: 'half'
	});
	if (!res.ok) error(res.status === 422 ? 413 : 502, `GitHub refused the file: ${await res.text()}`);
	const { sha } = (await res.json()) as { sha: string };
	return json({ sha });
};
