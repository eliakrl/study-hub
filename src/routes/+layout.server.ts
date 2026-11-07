import { repoConfig } from '#lib/server/config.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	const s = locals.session;
	const { owner, repo, branch } = repoConfig();
	return {
		user: s ? { login: s.login, name: s.name, avatar: s.avatar } : null,
		repoUrl: `https://github.com/${owner}/${repo}`,
		branch
	};
};
