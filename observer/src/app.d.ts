// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
// and what to do when importing types
declare namespace App {
	// interface Locals {}
	// interface PageData {}
	interface Error {
		message: string;
		// Populated by the handleError hooks so production shows the real
		// failure instead of SvelteKit's generic "Internal Error".
		stack?: string;
	}
	// interface Platform {}
}
