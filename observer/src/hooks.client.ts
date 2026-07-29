import type { HandleClientError } from '@sveltejs/kit';

// Client-side counterpart to handleError in hooks.server.ts. Errors thrown
// while rendering in the browser never reach the server hook, and SvelteKit
// blanks their message in production the same way — which is what made a
// component throwing on /newserver look like a 404.
//
// NOTE: this deliberately exposes internal messages and stack frames. Remove
// the `stack` line (or the whole hook) if the panel is ever opened to
// untrusted users.
export const handleError: HandleClientError = ({ error, event }) => {
  const err = error as Error;
  const message = err?.message ?? String(error);

  console.error(`[Observer] Unhandled client error on ${event.url.pathname}:`, error);

  return { message, stack: err?.stack };
};
