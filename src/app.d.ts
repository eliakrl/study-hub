// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Session } from '#lib/server/session.js';

declare global {
	namespace App {
		interface Locals {
			session: Session | null;
		}
	}
}

export {};
