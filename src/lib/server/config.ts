import { env } from 'cloudflare:workers';

/** Settings come from wrangler.jsonc `vars` (repo) and Cloudflare secrets (OAuth, session). */
export function config() {
	const e = env as Record<string, string | undefined>;
	const required = (name: string) => {
		const value = e[name];
		if (!value) throw new Error(`Missing environment variable ${name}`);
		return value;
	};
	return {
		owner: e.REPO_OWNER ?? 'eliakrl',
		repo: e.REPO_NAME ?? 'study-group',
		branch: e.REPO_BRANCH ?? 'main',
		clientId: required('GITHUB_CLIENT_ID'),
		clientSecret: required('GITHUB_CLIENT_SECRET'),
		sessionSecret: required('SESSION_SECRET')
	};
}

export function repoConfig() {
	const e = env as Record<string, string | undefined>;
	return {
		owner: e.REPO_OWNER ?? 'eliakrl',
		repo: e.REPO_NAME ?? 'study-group',
		branch: e.REPO_BRANCH ?? 'main',
		// Only overridden for local testing against a fake API.
		api: e.GITHUB_API ?? 'https://api.github.com'
	};
}
