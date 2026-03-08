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

    // Stripe productID to price mapping
    const priceMap = {
      "prod_Ox8pUPnCkKOdpj": 4.99,  // basic
      "prod_P0QXFRXxZGLcmG": 7.99,  // plus
      "prod_OxNVP2eRfUYgZC": 7.99,  // premium (adjust as needed)
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
              claimedServers: accountData.servers || [], // Store claimed servers for orphan detection
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
            serverMap[parseInt(serverId)] = accountId; // Track actual ownership

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
        // If claimed server exists but is owned by someone else
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

    // Third pass: add subscription data for each account
    for (const subData of subscriptionsData) {
      const email = subData.email;
      // Find account by email
      for (const accountId in accountMap) {
        if (accountMap[accountId].email === email) {
          // Extract subscription info
          if (subData.subscriptions && Array.isArray(subData.subscriptions)) {
            for (const sub of subData.subscriptions) {
              if (sub.status === "active" || sub.status === "canceled") {
                const productId = subData.subscriptions[0]?.productID || "unknown";
                const price = priceMap[productId] || 7.99; // Default price if not found

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

module.exports = router;
