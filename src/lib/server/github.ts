import { repoConfig } from './config';

const api = () => repoConfig().api;

export class GitHubError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

export async function gh<T = any>(token: string, path: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(path.startsWith('http') ? path : `${api()}${path}`, {
		...init,
		headers: {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${token}`,
			'User-Agent': 'study-hub',
			'X-GitHub-Api-Version': '2022-11-28',
			...(init.body ? { 'Content-Type': 'application/json' } : {}),
			...init.headers
		}
	});
	if (!res.ok) {
		const body = await res.text();
		let message = body;
		try {
			message = JSON.parse(body).message ?? body;
		} catch {}
		throw new GitHubError(res.status, message);
	}
	if (res.status === 204) return undefined as T;
	return res.json();
}

/** `/repos/<owner>/<repo>` for the vault repo. */
export function repoPath(suffix = '') {
	const { owner, repo } = repoConfig();
	return `/repos/${owner}/${repo}${suffix}`;
}

export interface TreeEntry {
	path: string;
	type: 'blob' | 'tree';
	sha: string;
	size?: number;
}

export interface Snapshot {
	commitSha: string;
	treeSha: string;
	entries: TreeEntry[];
}

/** The whole vault at the tip of the branch: one API call for every path. */
export async function snapshot(token: string): Promise<Snapshot> {
	const { branch } = repoConfig();
	const ref = await gh(token, repoPath(`/git/ref/heads/${branch}`));
	const commit = await gh(token, repoPath(`/git/commits/${ref.object.sha}`));
	const tree = await gh(token, repoPath(`/git/trees/${commit.tree.sha}?recursive=1`));
	return { commitSha: ref.object.sha, treeSha: commit.tree.sha, entries: tree.tree };
}

export async function readText(token: string, path: string, ref?: string): Promise<string | null> {
	try {
		const q = ref ? `?ref=${ref}` : '';
		const res = await fetch(`${api()}${repoPath(`/contents/${encodePath(path)}${q}`)}`, {
			headers: {
				Accept: 'application/vnd.github.raw+json',
				Authorization: `Bearer ${token}`,
				'User-Agent': 'study-hub'
			}
		});
		if (res.status === 404) return null;
		if (!res.ok) throw new GitHubError(res.status, await res.text());
		return res.text();
	} catch (e) {
		if (e instanceof GitHubError && e.status === 404) return null;
		throw e;
	}
}

export function encodePath(path: string) {
	return path.split('/').map(encodeURIComponent).join('/');
}

/** A file change for one commit: either an already-uploaded blob or new text content. */
export type Change = { path: string; sha: string } | { path: string; content: string };

/**
 * Commit a set of changes on top of the branch tip. `build` gets the snapshot it is building on,
 * so text edits (log.md appends etc.) are recomputed if someone else pushed in between.
 */
export async function commit(
	token: string,
	message: string,
	build: (snap: Snapshot) => Promise<Change[]>
): Promise<string> {
	const { branch } = repoConfig();
	for (let attempt = 0; attempt < 3; attempt++) {
		const snap = await snapshot(token);
		const changes = await build(snap);
		const tree = await gh(token, repoPath('/git/trees'), {
			method: 'POST',
			body: JSON.stringify({
				base_tree: snap.treeSha,
				tree: changes.map((c) => ({ mode: '100644', type: 'blob', ...c }))
			})
		});
		const created = await gh(token, repoPath('/git/commits'), {
			method: 'POST',
			body: JSON.stringify({ message, tree: tree.sha, parents: [snap.commitSha] })
		});
		try {
			await gh(token, repoPath(`/git/refs/heads/${branch}`), {
				method: 'PATCH',
				body: JSON.stringify({ sha: created.sha, force: false })
			});
			return created.sha;
		} catch (e) {
			// 422 = someone pushed in between (not a fast-forward). Rebuild on the new tip.
			if (!(e instanceof GitHubError) || e.status !== 422) throw e;
		}
	}
	throw new Error('The vault changed three times while saving. Try again.');
}
