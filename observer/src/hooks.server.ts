// SvelteKit server hooks - runs on server startup
import { startNodeMonitoring } from '$lib/server/nodeMonitor';
import type { Handle } from '@sveltejs/kit';
import dotenv from 'dotenv';

// Load .env file in production (dev mode loads it automatically)
dotenv.config();

// Initialize node monitoring once on first request
// This replaces ocelot_old's run.js startup behavior
let initialized = false;

// Standard SvelteKit request handler
export const handle: Handle = async ({ event, resolve }) => {
  // Initialize monitoring on first request (when env vars are available)
  if (!initialized) {
    initialized = true; // Set immediately to prevent race conditions

    // Use process.env directly for server-side access to PUBLIC_ variables
    const usingOcelot = process.env.PUBLIC_USING_OCELOT;
    const allNodes = process.env.PUBLIC_ALL_NODES;

    // Check if Ocelot is enabled
    if (usingOcelot === 'true') {
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
      console.log('[Observer] Ocelot disabled (PUBLIC_USING_OCELOT=' + usingOcelot + ')');
    }
  }

  return resolve(event);
};
