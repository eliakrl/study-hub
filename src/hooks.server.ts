import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { readSession } from '#lib/server/session.js';

const PUBLIC = ['/login', '/auth/'];

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.session = await readSession(event.cookies);
	const path = event.url.pathname;
	if (!event.locals.session && !PUBLIC.some((p) => path.startsWith(p))) {
		if (path.startsWith('/api/')) return new Response('Not signed in', { status: 401 });
		redirect(303, '/login');
	}
	return resolve(event);
};
