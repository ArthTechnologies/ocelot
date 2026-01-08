// API endpoint to get node capacity information
// Replaces ocelot_old's GET /nodeInfo/ endpoint

import { json } from '@sveltejs/kit';
import { getNodeInfo } from '$lib/server/nodeMonitor';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  try {
    const nodeInfo = getNodeInfo();

    // Return in same format as ocelot_old: [[url, numServers, maxServers], ...]
    // This maintains compatibility with any existing clients
    return json(nodeInfo);
  } catch (error) {
    console.error('[API] Error reading node info:', error);
    return json({ error: 'Error reading file' }, { status: 500 });
  }
};
