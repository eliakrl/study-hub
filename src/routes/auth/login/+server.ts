import { redirect } from '@sveltejs/kit';
import { config } from '#lib/server/config.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url, cookies }) => {
	const state = crypto.randomUUID();
	cookies.set('sh_oauth_state', state, { path: '/auth', sameSite: 'lax', maxAge: 600 });
	const params = new URLSearchParams({
		client_id: config().clientId,
		redirect_uri: `${url.origin}/auth/callback`,
		// `repo` is needed to write to a private repository.
		scope: 'repo read:user',
		state
	});
	redirect(302, `https://github.com/login/oauth/authorize?${params}`, {
		external: ['https://github.com']
	});
};
