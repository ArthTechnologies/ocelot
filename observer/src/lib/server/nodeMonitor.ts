// Server-side only module for monitoring Quartz node capacity
// Migrated from ocelot_old functionality

interface NodeInfo {
  url: string;
  numServers: number;
  maxServers: number;
}

let nodeInfoCache: NodeInfo[] = [];
let monitorInterval: NodeJS.Timeout | null = null;

/**
 * Start monitoring Quartz nodes (called once on server startup)
 * Polls nodes every 5 minutes to check capacity
 */
export function startNodeMonitoring(nodes: string[]) {
  if (nodes.length === 0) {
    console.log('[NodeMonitor] No nodes to monitor');
    return;
  }

  console.log('[NodeMonitor] Starting monitoring for nodes:', nodes);

  // Initial check immediately
  refreshNodes(nodes);

  // Poll every 5 minutes (matching ocelot_old behavior)
  monitorInterval = setInterval(() => {
    refreshNodes(nodes);
  }, 1000 * 60 * 5);
}

/**
 * Stop monitoring (for cleanup)
 */
export function stopNodeMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('[NodeMonitor] Monitoring stopped');
  }
}

/**
 * Refresh capacity info for all nodes
 * Fetches /info/capacity from each Quartz node in parallel
 */
async function refreshNodes(nodes: string[]) {
  console.log('[NodeMonitor] Refreshing nodes...');

  const newArray: NodeInfo[] = [];

  // Fetch capacity from each node in parallel
  const promises = nodes.map(async (nodeUrl) => {
    try {
      // 15 second timeout per request (increased from 5s to handle slower nodes)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${nodeUrl}info/capacity`, {
        signal: controller.signal,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`[NodeMonitor] ${nodeUrl} returned HTTP ${response.status}`);
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      console.log(`[NodeMonitor] ${nodeUrl} - ${data.numServers}/${data.maxServers} servers`);

      return {
        url: nodeUrl,
        numServers: data.numServers,
        maxServers: data.maxServers
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : 'Unknown';
      console.error(`[NodeMonitor] Failed to fetch ${nodeUrl}: ${errorName} - ${errorMsg}`);

      // Mark unreachable nodes as full (100/100) - matches ocelot_old behavior
      return {
        url: nodeUrl,
        numServers: 100,
        maxServers: 100
      };
    }
  });

  const results = await Promise.allSettled(promises);

  // Collect all results (even failed ones with 100/100)
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      newArray.push(result.value);
    } else {
      // This should never happen since we have try/catch, but log it just in case
      console.error(`[NodeMonitor] Promise rejected for ${nodes[index]}: ${result.reason}`);
      newArray.push({
        url: nodes[index],
        numServers: 100,
        maxServers: 100
      });
    }
  });

  // Update cache
  nodeInfoCache = newArray;
  console.log('[NodeMonitor] Updated cache with', newArray.length, 'nodes');
}

/**
 * Get current node capacity data
 * Returns array format: [[url, numServers, maxServers], ...]
 * Matches ocelot_old's files/nodeInfo.json format
 */
export function getNodeInfo(): [string, number, number][] {
  return nodeInfoCache.map(node => [
    node.url,
    node.numServers,
    node.maxServers
  ]);
}

/**
 * Get list of registered node URLs
 * Matches ocelot_old's /nodeInfo/list endpoint
 */
export function getNodeList(): string[] {
  return nodeInfoCache.map(n => n.url);
}

/**
 * Get raw node info (for internal use)
 */
export function getRawNodeInfo(): NodeInfo[] {
  return nodeInfoCache;
}
