// API endpoint to get list of registered Quartz node URLs
// Replaces ocelot_old's GET /nodeInfo/list endpoint

import { json } from '@sveltejs/kit';
import { getNodeList } from '$lib/server/nodeMonitor';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  try {
    const nodeList = getNodeList();

    // Return array of node URLs
    return json(nodeList);
  } catch (error) {
    console.error('[API] Error reading node list:', error);
    return json({ error: 'Error reading file' }, { status: 500 });
  }
};
