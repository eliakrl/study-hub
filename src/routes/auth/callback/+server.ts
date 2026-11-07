import { redirect } from '@sveltejs/kit';
import { config } from '#lib/server/config.js';
import { gh, repoPath } from '#lib/server/github.js';
import { writeSession } from '#lib/server/session.js';
import type { RequestHandler } from './$types';

const fail = (reason: string) => redirect(303, `/login?error=${reason}`);

export const GET: RequestHandler = async ({ url, cookies }) => {
	const state = url.searchParams.get('state');
	const code = url.searchParams.get('code');
	const expected = cookies.get('sh_oauth_state');
	cookies.delete('sh_oauth_state', { path: '/auth' });
	if (!code || !state || state !== expected) fail('state');

	const { clientId, clientSecret } = config();
	const res = await fetch('https://github.com/login/oauth/access_token', {
		method: 'POST',
		headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		body: JSON.stringify({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			redirect_uri: `${url.origin}/auth/callback`
		})
	});
	const { access_token: token } = (await res.json()) as { access_token?: string };
	if (!token) fail('token');

	// Only people who can push to the vault repo get in.
	let canPush = false;
	try {
		const repo = await gh(token!, repoPath());
		canPush = repo.permissions?.push === true;
	} catch {}
	if (!canPush) fail('access');

	const user = await gh(token!, '/user');
	await writeSession(cookies, {
		token: token!,
		login: user.login,
		name: user.name || user.login,
		avatar: user.avatar_url
	});
	redirect(303, '/');
};
