// SvelteKit server hooks - runs on server startup
import { startNodeMonitoring } from '$lib/server/nodeMonitor';
import { env } from '$env/dynamic/public';
import type { Handle, HandleServerError } from '@sveltejs/kit';

// SvelteKit replaces the message of an unexpected error with "Internal Error"
// in production so internals aren't leaked to users. This panel is operated by
// the people who run it, so surface the real failure instead — otherwise a
// broken page in production is indistinguishable from a missing route.
//
// NOTE: this deliberately exposes internal messages, file paths and stack
// frames to anyone who can trigger an error. Remove the `stack` line (or the
// whole hook) if the panel is ever opened to untrusted users.
export const handleError: HandleServerError = ({ error, event }) => {
  const err = error as Error;
  const message = err?.message ?? String(error);

  console.error(`[Observer] Unhandled error on ${event.url.pathname}:`, error);

  return { message, stack: err?.stack };
};

// Initialize node monitoring once on first request
// This replaces ocelot_old's run.js startup behavior
let initialized = false;

// Standard SvelteKit request handler
export const handle: Handle = async ({ event, resolve }) => {
  // Initialize monitoring on first request (when env vars are available)
  if (!initialized) {
    initialized = true; // Set immediately to prevent race conditions

    const multinode = env.PUBLIC_MULTINODE;
    const allNodes = env.PUBLIC_ALL_NODES;

    // Check if Ocelot is enabled
    if (multinode === 'true') {
      if (allNodes) {
        const nodes = allNodes.split(',').map(n => n.trim()).filter(n => n.length > 0);

        if (nodes.length > 0) {
          console.log('[Observer] Initializing Ocelot node monitoring with', nodes.length, 'nodes');
          startNodeMonitoring(nodes);
        } else {
          console.log('[Observer] PUBLIC_ALL_NODES is empty, skipping node monitoring');
        }
      } else {
        console.log('[Observer] PUBLIC_ALL_NODES not set, skipping node monitoring');
      }
    } else {
      console.log('[Observer] Multinode disabled (PUBLIC_MULTINODE=' + multinode + ')');
    }
  }

  return resolve(event);
};
