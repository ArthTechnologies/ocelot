const express = require("express");
const router = express.Router();
const utils = require("../scripts/utils.js");
const schedules = require("../scripts/schedules.js");
const fs = require("fs");
const path = require("path");
const readJSON = utils.readJSON;
const mc = require("../scripts/mc.js");
const infoRouter = require("./info.js");

// Middleware to verify admin access (solo mode or has adminAccess flag)
function verifyAdmin(req, res, next) {
  const config = utils.getConfig();
  const email = req.headers.username;
  const token = req.headers.token;

  // Allow solo mode
  if (config.mode === "solo") {
    return next();
  }

  // Check if user has adminAccess flag in provider mode
  if (email && token) {
    try {
      const account = readJSON(`accounts/${email}.json`);
      if (token === account.token && account.adminAccess === true) {
        return next();
      }
    } catch (err) {
      // Error reading account
    }
  }

  return res.status(403).json({ error: "Admin access denied" });
}

router.use(verifyAdmin);

// Get system tasks
router.get("/system-tasks", (req, res) => {
  try {
    const allSchedules = schedules.readSchedules();
    res.json({
      systemTasks: allSchedules.systemTasks || [],
    });
  } catch (err) {
    console.error("Error fetching system tasks:", err);
    res.status(500).json({ error: "Failed to fetch system tasks" });
  }
});

// Get subscriptions and server data
router.get("/subscriptions", (req, res) => {
  try {
    let subscriptions = [];
    let servers = [];

    // Read subscriptions from log file
    if (fs.existsSync("logs/subscriptions.json")) {
      try {
        const subsData = readJSON("logs/subscriptions.json");
        subscriptions = Array.isArray(subsData) ? subsData : [];
      } catch (err) {
        console.error("Error reading subscriptions.json:", err);
      }
    }

    // Read all servers and their data
    if (fs.existsSync("servers")) {
      const serverDirs = fs.readdirSync("servers");

      for (const dir of serverDirs) {
        // Skip non-numeric folders
        if (isNaN(parseInt(dir))) continue;

        const serverId = dir;
        const serverJsonPath = `servers/${serverId}/server.json`;

        if (fs.existsSync(serverJsonPath)) {
          try {
            const serverData = readJSON(serverJsonPath);
            servers.push({
              id: serverId,
              name: serverData.name || null,
              owner: serverData.owner || null,
              software: serverData.software || null,
              accountId: serverData.accountId || null,
            });
          } catch (err) {
            console.error(`Error reading server ${serverId}:`, err);
          }
        }
      }
    }

    res.json({
      subscriptions,
      servers,
    });
  } catch (err) {
    console.error("Error fetching subscriptions:", err);
    res.status(500).json({ error: "Failed to fetch subscriptions" });
  }
});

// Get admin dashboard data (snapshot, accounts, subscriptions)
router.get("/dashboard", (req, res) => {
  try {
    // Get latest snapshot
    const snapshotHistory = infoRouter.snapshotHistory();
    const latestSnapshot = snapshotHistory.length > 0
      ? snapshotHistory[snapshotHistory.length - 1]
      : null;

    // Stripe productID to price mapping (fallback for entries missing unitAmount)
    const priceMap = {
      "prod_Ox8pUPnCkKOdpj": 4.99,  // basic
      "prod_P0QXFRXxZGLcmG": 7.99,  // plus
      "prod_OxNVP2eRfUYgZC": 7.99,  // premium
    };

    // Read subscriptions data
    let subscriptionsData = [];
    if (fs.existsSync("logs/subscriptions.json")) {
      try {
        const subsFile = readJSON("logs/subscriptions.json");
        subscriptionsData = Array.isArray(subsFile) ? subsFile : [];
      } catch (err) {
        console.error("Error reading subscriptions.json:", err);
      }
    }

    // Build account list with servers and subscriptions
    const accounts = [];
    const accountMap = {}; // Map to group servers by account
    const serverMap = {}; // Map of server ID to actual owner accountId

    // First: Read all account files to get email and accountId mapping
    if (fs.existsSync("accounts")) {
      const accountFiles = fs.readdirSync("accounts");
      for (const file of accountFiles) {
        if (!file.endsWith(".json")) continue;

        const accountPath = `accounts/${file}`;
        try {
          const accountData = readJSON(accountPath);
          if (accountData.accountId) {
            accountMap[accountData.accountId] = {
              accountId: accountData.accountId,
              email: accountData.email || file.split(":")[1]?.split(".")[0] || "unknown",
              servers: [],
              orphanedServers: [],
              subscriptions: [],
              freeServers: accountData.freeServers || 0,
              claimedServers: accountData.servers || [],
            };
          }
        } catch (err) {
          console.error(`Error reading account file ${file}:`, err);
        }
      }
    }

    // Second pass: group servers by account and build server map
    if (fs.existsSync("servers")) {
      const serverDirs = fs.readdirSync("servers");

      for (const dir of serverDirs) {
        if (isNaN(parseInt(dir))) continue;

        const serverId = dir;
        const serverJsonPath = `servers/${serverId}/server.json`;

        if (fs.existsSync(serverJsonPath)) {
          try {
            const serverData = readJSON(serverJsonPath);
            const accountId = serverData.accountId;
            serverMap[parseInt(serverId)] = accountId;

            if (accountMap[accountId]) {
              const playerList = mc.getPlayerList(serverId);
              accountMap[accountId].servers.push({
                id: parseInt(serverId),
                name: serverData.name || `Server ${serverId}`,
                software: serverData.software || "Unknown",
                version: serverData.version || "Unknown",
                players: playerList ? playerList.length : 0,
              });
            }
          } catch (err) {
            console.error(`Error reading server ${serverId}:`, err);
          }
        }
      }
    }

    // Third pass: detect orphaned servers (claimed but owned by someone else)
    for (const accountId in accountMap) {
      const account = accountMap[accountId];
      for (const claimedServerId of account.claimedServers) {
        const actualOwner = serverMap[claimedServerId];
        if (actualOwner && actualOwner !== accountId) {
          const serverId = claimedServerId.toString();
          const serverJsonPath = `servers/${serverId}/server.json`;
          if (fs.existsSync(serverJsonPath)) {
            try {
              const serverData = readJSON(serverJsonPath);
              const playerList = mc.getPlayerList(serverId);
              account.orphanedServers.push({
                id: claimedServerId,
                name: serverData.name || `Server ${serverId}`,
                software: serverData.software || "Unknown",
                version: serverData.version || "Unknown",
                players: playerList ? playerList.length : 0,
                actualOwner: actualOwner,
              });
            } catch (err) {
              console.error(`Error reading orphaned server ${serverId}:`, err);
            }
          }
        }
      }
    }

    // Fourth pass: add subscription data for each account (deduplicated by email)
    const processedEmails = new Set();
    for (const subData of subscriptionsData) {
      const email = subData.email;
      if (processedEmails.has(email)) continue;
      processedEmails.add(email);

      for (const accountId in accountMap) {
        if (accountMap[accountId].email === email) {
          if (subData.subscriptions && Array.isArray(subData.subscriptions)) {
            const seenSubs = new Set();
            for (const sub of subData.subscriptions) {
              if (sub.status === "active" || sub.status === "canceled") {
                const subKey = `${subData.plan}:${sub.status}`;
                if (seenSubs.has(subKey)) continue;
                seenSubs.add(subKey);

                const productId = sub.productID || "unknown";
                let price;
                if (sub.unitAmount != null) {
                  const months = sub.interval === "year"
                    ? (sub.intervalCount || 1) * 12
                    : sub.interval === "week"
                      ? (sub.intervalCount || 1) / 4.33
                      : (sub.intervalCount || 1); // month or default
                  price = (sub.unitAmount / 100) / months;
                } else {
                  price = priceMap[productId] ?? 7.99;
                }

                accountMap[accountId].subscriptions.push({
                  plan: subData.plan || "basic",
                  status: sub.status,
                  price: price,
                });
              }
            }
          }
          break;
        }
      }
    }

    // Convert map to array and sort
    for (const accountId in accountMap) {
      const account = accountMap[accountId];
      // Parse name from email (part before @)
      const name = account.email.split("@")[0] || account.email;

      accounts.push({
        id: accounts.length,
        email: account.email,
        name,
        servers: account.servers.sort((a, b) => a.id - b.id),
        orphanedServers: account.orphanedServers.sort((a, b) => a.id - b.id),
        subscriptions: account.subscriptions,
        accountId: account.accountId,
        freeServers: account.freeServers,
      });
    }

    // Sort accounts: by server count (desc), then by name
    accounts.sort((a, b) => {
      if (a.servers.length !== b.servers.length) {
        return b.servers.length - a.servers.length;
      }
      return a.name.localeCompare(b.name);
    });

    // Calculate totals
    let totalSubscriptions = 0;
    let estimatedMRR = 0;

    for (const account of accounts) {
      for (const sub of account.subscriptions) {
        if (sub.status === "active") {
          totalSubscriptions++;
          estimatedMRR += sub.price;
        }
      }
    }

    res.json({
      snapshot: latestSnapshot,
      accounts: accounts,
      totalSubscriptions: totalSubscriptions,
      estimatedMRR: estimatedMRR,
    });
  } catch (err) {
    console.error("Error fetching dashboard data:", err);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// Lookup a single customer's account + their servers by accountId
router.get("/lookup/:accountId", (req, res) => {
  try {
    const targetId = req.params.accountId;

    if (!fs.existsSync("accounts")) {
      return res.status(404).json({ notFound: true, error: "No accounts directory" });
    }

    const accountFiles = fs.readdirSync("accounts");
    let foundFile = null;
    let foundAccount = null;

    for (const file of accountFiles) {
      if (!file.endsWith(".json")) continue;
      try {
        const data = readJSON(`accounts/${file}`);
        if (data.accountId === targetId) {
          foundFile = file;
          foundAccount = data;
          break;
        }
      } catch (err) {
        // skip unreadable account files
      }
    }

    if (!foundAccount) {
      return res.status(404).json({ notFound: true });
    }

    const accountSafe = {
      accountId: foundAccount.accountId,
      name: foundFile.replace(/\.json$/, ""),
      email: foundAccount.email || null,
      type: foundAccount.type || null,
      servers: Array.isArray(foundAccount.servers) ? foundAccount.servers : [],
      freeServers: foundAccount.freeServers || 0,
      lastSignIn: foundAccount.lastSignIn || null,
      resetAttempts: foundAccount.resetAttempts || 0,
      adminAccess: foundAccount.adminAccess === true,
      token: foundAccount.token || null,
    };

    const servers = [];
    for (const serverId of accountSafe.servers) {
      const idStr = String(serverId).split(":")[0]; // strip ":freed" suffix
      const jsonPath = `servers/${idStr}/server.json`;
      if (!fs.existsSync(jsonPath)) {
        servers.push({ id: serverId, missing: true });
        continue;
      }
      try {
        const s = readJSON(jsonPath);
        servers.push({
          id: serverId,
          name: s.name || null,
          software: s.software || null,
          version: s.version || null,
          state: mc.getState(idStr),
          accountId: s.accountId || null,
          adminServer: s.adminServer === true,
          productID: s.productID || null,
          ownerMismatch: s.accountId && s.accountId !== foundAccount.accountId,
        });
      } catch (err) {
        servers.push({ id: serverId, missing: true, error: String(err) });
      }
    }

    res.json({ notFound: false, account: accountSafe, servers });
  } catch (err) {
    console.error("Error in /admin/lookup:", err);
    res.status(500).json({ error: "Failed to lookup account" });
  }
});

// Helper: ensure URL ends with a slash
function normalizeUrl(url) {
  return url.endsWith("/") ? url : url + "/";
}

// Helper: collect account fingerprints from this node's accounts directory
function getLocalAccountSummaries() {
  const summaries = [];
  if (!fs.existsSync("accounts")) return summaries;
  for (const file of fs.readdirSync("accounts")) {
    if (!file.endsWith(".json")) continue;
    try {
      const data = readJSON(`accounts/${file}`);
      if (!data.accountId) continue;
      const filenameKey = file.replace(/\.json$/, "");
      // e.g. "email:user@example.com" → "user@example.com", "discord:123" → "123"
      const username = filenameKey.includes(":") ? filenameKey.split(":").slice(1).join(":") : filenameKey;
      summaries.push({
        email: data.email || null,
        username,
        accountId: data.accountId,
        type: data.type || null,
      });
    } catch (_) {}
  }
  return summaries;
}

// Check whether accounts with the given emails or usernames exist on this node.
// Called by /admin/cross-node-duplicates on remote nodes. Requires admin auth.
router.post("/check-accounts", (req, res) => {
  try {
    const { emails = [], usernames = [] } = req.body;

    if (!Array.isArray(emails) || !Array.isArray(usernames)) {
      return res.status(400).json({ error: "emails and usernames must be arrays" });
    }

    if (emails.length === 0 && usernames.length === 0) {
      return res.json({ matches: [] });
    }

    const emailSet = new Set(emails.map((e) => e.toLowerCase()));
    const usernameSet = new Set(usernames.map((u) => u.toLowerCase()));
    const matches = [];

    if (!fs.existsSync("accounts")) {
      return res.json({ matches: [] });
    }

    for (const file of fs.readdirSync("accounts")) {
      if (!file.endsWith(".json")) continue;
      try {
        const data = readJSON(`accounts/${file}`);
        if (!data.accountId) continue;

        const filenameKey = file.replace(/\.json$/, "");
        const username = filenameKey.includes(":") ? filenameKey.split(":").slice(1).join(":") : filenameKey;
        const email = data.email || null;

        const emailMatch = email && emailSet.has(email.toLowerCase());
        const usernameMatch = usernameSet.has(username.toLowerCase());

        if (emailMatch || usernameMatch) {
          matches.push({
            email,
            username,
            accountId: data.accountId,
            type: data.type || null,
          });
        }
      } catch (_) {}
    }

    res.json({ matches });
  } catch (err) {
    console.error("Error in /admin/check-accounts:", err);
    res.status(500).json({ error: "Failed to check accounts" });
  }
});

// Scan all nodes registered with observer for accounts that duplicate any account on this node.
// Duplicate = same billing email OR same login username, regardless of account type.
// Body: { observerUrl: string, nodes: [{ url: string, username: string, token: string }] }
router.post("/cross-node-duplicates", async (req, res) => {
  try {
    const { observerUrl, nodes } = req.body;

    if (!observerUrl || !Array.isArray(nodes)) {
      return res.status(400).json({ error: "observerUrl and nodes array are required" });
    }

    // Collect fingerprints from this node
    const localAccounts = getLocalAccountSummaries();
    const localEmails = localAccounts.map((a) => a.email).filter(Boolean);
    const localUsernames = localAccounts.map((a) => a.username).filter(Boolean);

    // Fetch node list from observer
    const observerBase = normalizeUrl(observerUrl);
    let nodeList;
    try {
      const resp = await fetch(`${observerBase}api/nodeInfo/list`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      nodeList = await resp.json();
    } catch (err) {
      return res.status(502).json({ error: `Failed to fetch node list from observer: ${err.message}` });
    }

    if (!Array.isArray(nodeList)) {
      return res.status(502).json({ error: "Observer returned unexpected node list format" });
    }

    // For each node we have credentials for, call /admin/check-accounts
    const results = [];
    for (const nodeUrl of nodeList) {
      const normalizedNodeUrl = normalizeUrl(nodeUrl);
      const creds = nodes.find((n) => normalizeUrl(n.url) === normalizedNodeUrl);
      if (!creds) continue;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const resp = await fetch(`${normalizedNodeUrl}admin/check-accounts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            username: creds.username,
            token: creds.token,
          },
          body: JSON.stringify({ emails: localEmails, usernames: localUsernames }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (resp.ok) {
          const data = await resp.json();
          results.push({ node: normalizedNodeUrl, matches: data.matches || [], error: null });
        } else {
          results.push({ node: normalizedNodeUrl, matches: [], error: `HTTP ${resp.status}` });
        }
      } catch (err) {
        results.push({ node: normalizedNodeUrl, matches: [], error: err.message });
      }
    }

    // Group duplicate accounts: keyed by email (preferred) or username
    const duplicateMap = {};
    for (const { node, matches } of results) {
      for (const match of matches) {
        const key = match.email ? match.email.toLowerCase() : match.username.toLowerCase();
        if (!duplicateMap[key]) {
          duplicateMap[key] = { email: match.email, username: match.username, nodes: [] };
        }
        duplicateMap[key].nodes.push({ node, accountId: match.accountId, type: match.type });
      }
    }

    const config = utils.getConfig();
    res.json({
      localNode: config.nodeName || null,
      scannedNodes: nodeList.length,
      checkedNodes: results.filter((r) => !r.error).length,
      duplicates: Object.values(duplicateMap),
      errors: results.filter((r) => r.error).map((r) => ({ node: r.node, error: r.error })),
    });
  } catch (err) {
    console.error("Error in /admin/cross-node-duplicates:", err);
    res.status(500).json({ error: "Failed to scan cross-node duplicates" });
  }
});

module.exports = router;
