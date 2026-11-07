import type { Cookies } from '@sveltejs/kit';
import { config } from './config';

/** What we keep about a signed-in member. The GitHub token never reaches the browser unencrypted. */
export interface Session {
	token: string;
	login: string;
	name: string;
	avatar: string;
}

const COOKIE = 'sh_session';
const MAX_AGE = 60 * 60 * 24 * 30;

const b64url = {
	encode(bytes: Uint8Array) {
		let s = '';
		for (const b of bytes) s += String.fromCharCode(b);
		return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	},
	decode(text: string) {
		const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
		return Uint8Array.from(s, (c) => c.charCodeAt(0));
	}
};

async function key() {
	const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(config().sessionSecret));
	return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function writeSession(cookies: Cookies, session: Session) {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const data = new TextEncoder().encode(JSON.stringify(session));
	const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), data));
	const out = new Uint8Array(iv.length + sealed.length);
	out.set(iv);
	out.set(sealed, iv.length);
	cookies.set(COOKIE, b64url.encode(out), { path: '/', sameSite: 'lax', maxAge: MAX_AGE });
}

export async function readSession(cookies: Cookies): Promise<Session | null> {
	const value = cookies.get(COOKIE);
	if (!value) return null;
	try {
		const bytes = b64url.decode(value);
		const plain = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: bytes.slice(0, 12) },
			await key(),
			bytes.slice(12)
		);
		return JSON.parse(new TextDecoder().decode(plain));
	} catch {
		cookies.delete(COOKIE, { path: '/' });
		return null;
	}
}

export function clearSession(cookies: Cookies) {
	cookies.delete(COOKIE, { path: '/' });
}
