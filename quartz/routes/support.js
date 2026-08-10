const express = require("express");
const router = express.Router();
const fs = require("fs");
const config = require("../scripts/utils.js").getConfig();
const readJSON = require("../scripts/utils.js").readJSON;
const writeJSON = require("../scripts/utils.js").writeJSON;
const stripeKey = config.stripeKey;
const stripe = require("stripe")(stripeKey);
const mode = config.mode;

// List expired servers for recovery selection
router.get("/listExpiredServers", async (req, res) => {
  try {
    const email = req.headers.username;
    const token = req.headers.token;

    if (!email || !fs.existsSync(`accounts/${email}.json`)) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const account = readJSON(`accounts/${email}.json`);
    if (token !== account.token) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const expiredServers = [];

    // Check all servers in account
    for (let serverEntry of account.servers) {
      let serverId = serverEntry;
      let isExpired = false;
      let serverData = null;

      // Check if server entry has `:freed` flag (moved to trashbin)
      if (typeof serverEntry === "string" && serverEntry.includes(":freed")) {
        serverId = serverEntry.replace(":freed", "");
        isExpired = true;

        // Try to find server data in trashbin
        try {
          if (fs.existsSync("trashbin")) {
            const trashbinItems = fs.readdirSync("trashbin");
            // Extract email owner from account email (without .json extension)
            const emailOwner = email.includes(".json") ? email.replace(".json", "") : email;

            for (const item of trashbinItems) {
              // Trashbin format: "serverId-emailOwner"
              // Only load if it matches both the server ID AND the correct email owner
              if (item === `${serverId}-${emailOwner}`) {
                const trashPath = `trashbin/${item}`;
                if (fs.existsSync(`${trashPath}/server.json`)) {
                  serverData = readJSON(`${trashPath}/server.json`);
                  break;
                }
              }
            }
          }
        } catch (e) {
          console.error("Error reading trashbin:", e);
        }
      } else {
        // Check if server exists in servers directory
        if (fs.existsSync(`servers/${serverId}/server.json`)) {
          serverData = readJSON(`servers/${serverId}/server.json`);

          // Check subscription status (same logic as /servers endpoint)
          if (mode === "provider") {
            let hasValidSubscription = false;
            let latestStartDate = 0;

            try {
              const subscriptionsJson = readJSON(`logs/subscriptions.json`);

              for (let sub of subscriptionsJson) {
                if (sub.owner == email + ".json" && sub.subscriptions != undefined) {
                  for (let item of sub.subscriptions) {
                    if (item.start_date > latestStartDate) {
                      latestStartDate = item.start_date;
                    }
                    if (item.status == "active") {
                      hasValidSubscription = true;
                      break;
                    }
                  }
                }
                if (hasValidSubscription) break;
              }

              // Check if recent subscription started (within 24 hours)
              if (latestStartDate > 0 && latestStartDate > Date.now() - 86400000) {
                hasValidSubscription = true;
              }

              if (!hasValidSubscription) {
                isExpired = true;
              }
            } catch (e) {
              console.error("Error checking subscription status:", e);
            }
          }
        }
      }

      // Add expired server to list
      if (isExpired) {
        const software = serverData?.software || "Unknown";
        const version = serverData?.version || "Unknown";

        expiredServers.push({
          id: serverId,
          name: serverData?.serverName || `Server ${serverId}`,
          software: software,
          version: version
        });
      }
    }

    res.status(200).json({
      success: true,
      expiredServers: expiredServers
    });
  } catch (error) {
    console.error("List expired servers error:", error);
    res.status(500).json({ success: false, message: "An error occurred" });
  }
});

// Recover specific expired server after payment issues resolved
router.post("/serverRecovery", async (req, res) => {
  try {
    const email = req.headers.username;
    const token = req.headers.token;
    const accountId = req.body.accountId;
    const targetServerId = req.body.targetServerId; // Which server to recover

    if (mode === "solo") {
      // Solo mode - always allow
      return handleServerRecovery(res, email, targetServerId, true);
    }

    // Get account and verify token
    if (!email || !fs.existsSync(`accounts/${email}.json`)) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const account = readJSON(`accounts/${email}.json`);
    if (token !== account.token) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Verify server belongs to user (handle both regular and :freed entries)
    const serverExists = account.servers.some(s => {
      const serverId = typeof s === "string" ? s.replace(":freed", "") : s;
      return serverId === targetServerId;
    });
    if (!serverExists) {
      return res.status(403).json({ success: false, message: "Server not found" });
    }

    // Silent check: verify user has at least one valid subscription
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: account.stripeCustomerId,
        limit: 100
      });

      // Check if user has at least one active or past_due subscription
      const hasValidSubscription = subscriptions.data.some(sub =>
        sub.status === "active" || sub.status === "past_due"
      );

      if (!hasValidSubscription) {
        // Check if the subscription exists on a sibling account with a different
        // login prefix (e.g. "email:user@x.com" vs "google:user@x.com").
        const bareEmail = email.includes(":") ? email.split(":").slice(1).join(":") : email;
        try {
          const accountFiles = fs.readdirSync("accounts").filter(f => f.endsWith(".json"));
          for (const file of accountFiles) {
            const fileEmail = file.replace(".json", "");
            if (fileEmail === email) continue;
            const fileBareEmail = fileEmail.includes(":") ? fileEmail.split(":").slice(1).join(":") : fileEmail;
            if (fileBareEmail !== bareEmail) continue;

            // Same underlying email, different prefix — check its Stripe customer
            const otherAccount = readJSON(`accounts/${file}`);
            if (!otherAccount.stripeCustomerId) continue;
            try {
              const otherSubs = await stripe.subscriptions.list({
                customer: otherAccount.stripeCustomerId,
                limit: 100
              });
              const otherHasValid = otherSubs.data.some(sub =>
                sub.status === "active" || sub.status === "past_due"
              );
              if (otherHasValid) {
                return res.status(403).json({
                  success: false,
                  duplicateAccount: true,
                  loginMethod: fileEmail.includes(":") ? fileEmail.split(":")[0] : "email",
                  message: `Your subscription is linked to a different login method. Please sign in with "${fileEmail.split(":")[0]}" instead.`
                });
              }
            } catch (stripeErr) {
              console.error("Stripe check for sibling account failed:", stripeErr);
            }
          }
        } catch (scanErr) {
          console.error("Sibling account scan error:", scanErr);
        }

        // No sibling account found with a valid subscription
        return res.status(403).json({
          success: false,
          message: "You must have an active subscription to use this feature"
        });
      }

      // User has valid subscription - proceed with recovery
      return handleServerRecovery(res, email, targetServerId, true);
    } catch (stripeError) {
      console.error("Stripe check error:", stripeError);
      // If Stripe check fails, still allow recovery attempt
      return handleServerRecovery(res, email, targetServerId, true);
    }
  } catch (error) {
    console.error("Server recovery error:", error);
    res.status(500).json({ success: false, message: "An error occurred" });
  }
});

function handleServerRecovery(res, email, targetServerId, verified) {
  try {
    if (!verified) {
      return res.status(403).json({ success: false, message: "Verification failed" });
    }

    const account = readJSON(`accounts/${email}.json`);
    let recoveredServer = null;
    let recoveredServerId = null;
    let serverLocation = null; // "servers" or "trashbin"

    // Find the server to recover
    for (let serverEntry of account.servers) {
      let serverId = serverEntry;

      // Handle :freed flag
      if (typeof serverEntry === "string" && serverEntry.includes(":freed")) {
        serverId = serverEntry.replace(":freed", "");
      }

      // Check if this is the server we're trying to recover
      if (serverId !== targetServerId) {
        continue;
      }

      // Check if server is in trashbin (has :freed flag)
      if (typeof serverEntry === "string" && serverEntry.includes(":freed")) {
        try {
          if (fs.existsSync("trashbin")) {
            const trashbinItems = fs.readdirSync("trashbin");
            // Extract email owner from account email (without .json extension)
            const emailOwner = email.includes(".json") ? email.replace(".json", "") : email;

            for (const item of trashbinItems) {
              // Trashbin format: "serverId-emailOwner"
              // Only restore if it matches both the server ID AND the correct email owner
              if (item === `${serverId}-${emailOwner}`) {
                const trashPath = `trashbin/${item}`;
                if (fs.existsSync(`${trashPath}/server.json`)) {
                  // Check if slot is already taken by another user
                  if (fs.existsSync(`servers/${serverId}`)) {
                    // Slot is taken, cannot restore
                    return res.status(409).json({
                      success: false,
                      message: "This server slot has been claimed by another user. Please contact support to resolve this issue.",
                      recovered: false
                    });
                  }

                  recoveredServer = readJSON(`${trashPath}/server.json`);
                  recoveredServerId = serverId;
                  serverLocation = "trashbin";
                  // Move server back from trashbin to servers/
                  fs.renameSync(trashPath, `servers/${serverId}`);
                  // Remove :freed from account.servers
                  account.servers = account.servers.map(s =>
                    typeof s === "string" && s.includes(":freed") && s.startsWith(serverId) ? serverId : s
                  );
                  writeJSON(`accounts/${email}.json`, account);
                  // Rebuild the sftp container so the restored server gets
                  // its FTP user and mount back
                  try {
                    require("../scripts/ftp.js").startFtpServer();
                  } catch (ftpError) {
                    console.log("Error restarting FTP server after restore: " + ftpError);
                  }
                  break;
                }
              }
            }
          }
        } catch (e) {
          console.error("Error recovering server from trashbin:", e);
        }
      } else {
        // Check if server is in servers directory
        if (fs.existsSync(`servers/${serverId}/server.json`)) {
          recoveredServer = readJSON(`servers/${serverId}/server.json`);
          recoveredServerId = serverId;
          serverLocation = "servers";
          break;
        }
      }

      if (recoveredServer) break;
    }

    if (recoveredServer) {
      // If server was in servers/ and marked with flags, clear them
      if (serverLocation === "servers") {
        recoveredServer.expired = false;
        recoveredServer.markedExpired = false;
      }
      recoveredServer.restoredDate = Date.now();

      writeJSON(`servers/${recoveredServerId}/server.json`, recoveredServer);

      // Log recovery
      console.log(`Server ${recoveredServerId} recovered for account ${email} from ${serverLocation}`);

      return res.status(200).json({
        success: true,
        message: "Your server has been restored! You can now start using it again.",
        serverId: recoveredServerId,
        serverName: recoveredServer.serverName || `Server ${recoveredServerId}`,
        recovered: true
      });
    } else {
      // Server not found - may have been permanently deleted
      return res.status(200).json({
        success: true,
        message: "Your slot has been freed up. You have gone past the grace period, but you may still be able to recover your data. Please contact support for assistance.",
        recovered: false
      });
    }
  } catch (error) {
    console.error("Recovery handler error:", error);
    res.status(500).json({ success: false, message: "An error occurred during recovery" });
  }
}

const files = require('../scripts/files');

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
}

function getLastModified(dir) {
  const logsDir = `${dir}/logs`;
  if (fs.existsSync(logsDir)) {
    const logs = fs.readdirSync(logsDir)
      .filter(f => f !== 'latest.log' && /^\d{4}-\d{2}-\d{2}/.test(f))
      .sort();
    if (logs.length) {
      const match = logs[logs.length - 1].match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
    }
  }
  const worldPath = `${dir}/world`;
  if (fs.existsSync(worldPath)) {
    try {
      return fs.statSync(worldPath).mtime.toISOString().split('T')[0];
    } catch (e) {}
  }
  return null;
}

function getWarnings(dir) {
  const warnings = [];
  if (!fs.existsSync(`${dir}/world`)) warnings.push('missing_world');
  try {
    const hasJar = fs.existsSync(dir) && fs.readdirSync(dir).some(f => f.endsWith('.jar'));
    if (!hasJar) warnings.push('missing_jar');
  } catch (e) {}
  if (!fs.existsSync(`${dir}/server.json`)) warnings.push('missing_server_json');
  return warnings;
}

function getPlayerCount(dir) {
  const usercachePath = `${dir}/usercache.json`;
  if (fs.existsSync(usercachePath)) {
    try {
      const cache = readJSON(usercachePath);
      return Array.isArray(cache) ? cache.length : 0;
    } catch (e) {}
  }
  const playerdataPath = `${dir}/world/playerdata`;
  if (fs.existsSync(playerdataPath)) {
    return fs.readdirSync(playerdataPath).filter(f => f.endsWith('.dat') && !f.endsWith('.dat_old')).length;
  }
  return 0;
}

router.get('/bug-resolver/:id', async function (req, res) {
  const email = req.headers.username;
  const token = req.headers.token;
  if (!email || !fs.existsSync(`accounts/${email}.json`)) {
    return res.status(401).json({ msg: 'Unauthorized' });
  }
  const account = readJSON(`accounts/${email}.json`);
  if (token !== account.token) return res.status(401).json({ msg: 'Unauthorized' });

  const rawId = req.params.id;
  const livePath = `servers/${rawId}`;
  const trashPath = `trashbin/${rawId}-${email}`;

  if (!fs.existsSync(`${livePath}/server.json`) || !fs.existsSync(trashPath)) {
    return res.status(400).json({ msg: 'Server is not in a conflict state.' });
  }

  function worldSize(dir) {
    const worldPath = `${dir}/world`;
    return fs.existsSync(worldPath) ? files.folderSizeRecursiveAsync(worldPath) : Promise.resolve(0);
  }

  function countFolder(dir, folder) {
    const p = `${dir}/${folder}`;
    if (!fs.existsSync(p)) return 0;
    try { return fs.readdirSync(p).filter(f => !f.startsWith('.')).length; } catch (e) { return 0; }
  }

  try {
    const [liveSize, trashSize] = await Promise.all([worldSize(livePath), worldSize(trashPath)]);
    let liveServer = { name: `Server ${rawId}`, software: 'unknown', version: 'unknown' };
    let trashServer = { name: `Server ${rawId}`, software: 'unknown', version: 'unknown' };
    try { liveServer = readJSON(`${livePath}/server.json`); } catch (e) {}
    try { trashServer = readJSON(`${trashPath}/server.json`); } catch (e) {}

    const liveMods = countFolder(livePath, 'mods');
    const livePlugins = countFolder(livePath, 'plugins');
    const trashMods = countFolder(trashPath, 'mods');
    const trashPlugins = countFolder(trashPath, 'plugins');

    res.status(200).json({
      live: {
        name: liveServer.name || `Server ${rawId}`,
        software: liveServer.software || 'unknown',
        version: liveServer.version || 'unknown',
        worldSize: formatBytes(liveSize),
        mods: liveMods,
        plugins: livePlugins,
        lastModified: getLastModified(livePath),
        playerCount: getPlayerCount(livePath),
        warnings: getWarnings(livePath)
      },
      trashbin: {
        name: trashServer.name || `Server ${rawId}`,
        software: trashServer.software || 'unknown',
        version: trashServer.version || 'unknown',
        worldSize: formatBytes(trashSize),
        mods: trashMods,
        plugins: trashPlugins,
        lastModified: getLastModified(trashPath),
        playerCount: getPlayerCount(trashPath),
        warnings: getWarnings(trashPath)
      }
    });
  } catch (e) {
    console.error('Bug resolver error:', e);
    res.status(500).json({ msg: 'Error gathering server data.' });
  }
});

router.post('/bug-resolver/:id/resolve', function (req, res) {
  const email = req.headers.username;
  const token = req.headers.token;
  if (!email || !fs.existsSync(`accounts/${email}.json`)) {
    return res.status(401).json({ msg: 'Unauthorized' });
  }
  const account = readJSON(`accounts/${email}.json`);
  if (token !== account.token) return res.status(401).json({ msg: 'Unauthorized' });

  const rawId = req.params.id;
  const { choice } = req.body;
  if (choice !== 'live' && choice !== 'trashbin') {
    return res.status(400).json({ msg: 'Invalid choice.' });
  }

  const livePath = `servers/${rawId}`;
  const trashPath = `trashbin/${rawId}-${email}`;
  const freedEntry = `${rawId}:freed`;

  if (!account.servers.includes(freedEntry)) {
    return res.status(400).json({ msg: 'Server not in conflict state.' });
  }

  if (choice === 'trashbin') {
    if (!fs.existsSync(trashPath)) {
      return res.status(400).json({ msg: 'Archived version no longer exists.' });
    }
    if (!fs.existsSync(livePath)) {
      return res.status(400).json({ msg: 'Live server folder not found.' });
    }
  }

  try {
    if (choice === 'live') {
      account.servers = account.servers.map(s => s === freedEntry ? rawId : s);
      writeJSON(`accounts/${email}.json`, account);
    } else {
      const displacedPath = `trashbin/${rawId}-${email}-displaced-${Date.now()}`;
      fs.renameSync(livePath, displacedPath);
      fs.renameSync(trashPath, livePath);
      account.servers = account.servers.map(s => s === freedEntry ? rawId : s);
      writeJSON(`accounts/${email}.json`, account);
    }
    res.status(200).json({ success: true });
  } catch (e) {
    console.error('Bug resolver resolve error:', e);
    res.status(500).json({ msg: 'Error resolving conflict.' });
  }
});

// World data for an expired server, tolerant of any combination of live/trashbin presence
// (unlike bug-resolver, which requires both to exist since it's only for the :freed conflict state)
router.get('/world-info/:id', async function (req, res) {
  const email = req.headers.username;
  const token = req.headers.token;
  if (!email || !fs.existsSync(`accounts/${email}.json`)) {
    return res.status(401).json({ msg: 'Unauthorized' });
  }
  const account = readJSON(`accounts/${email}.json`);
  if (token !== account.token) return res.status(401).json({ msg: 'Unauthorized' });

  const rawId = req.params.id;
  const ownsServer = account.servers.includes(rawId) || account.servers.includes(`${rawId}:freed`);
  if (!ownsServer) return res.status(403).json({ msg: 'Server not found on this account.' });

  const livePath = `servers/${rawId}`;
  const trashPath = `trashbin/${rawId}-${email}`;

  const hasLive = fs.existsSync(`${livePath}/server.json`);
  const hasTrashbin = fs.existsSync(trashPath);

  function worldSize(dir) {
    const worldPath = `${dir}/world`;
    return fs.existsSync(worldPath) ? files.folderSizeRecursiveAsync(worldPath) : Promise.resolve(0);
  }

  function countFolder(dir, folder) {
    const p = `${dir}/${folder}`;
    if (!fs.existsSync(p)) return 0;
    try { return fs.readdirSync(p).filter(f => !f.startsWith('.')).length; } catch (e) { return 0; }
  }

  async function buildInfo(dir) {
    const size = await worldSize(dir);
    let server = { name: `Server ${rawId}`, software: 'unknown', version: 'unknown' };
    try { server = readJSON(`${dir}/server.json`); } catch (e) {}

    return {
      name: server.name || `Server ${rawId}`,
      software: server.software || 'unknown',
      version: server.version || 'unknown',
      worldSize: formatBytes(size),
      mods: countFolder(dir, 'mods'),
      plugins: countFolder(dir, 'plugins'),
      lastModified: getLastModified(dir),
      playerCount: getPlayerCount(dir),
      warnings: getWarnings(dir)
    };
  }

  try {
    const [live, trashbin] = await Promise.all([
      hasLive ? buildInfo(livePath) : Promise.resolve(null),
      hasTrashbin ? buildInfo(trashPath) : Promise.resolve(null)
    ]);

    res.status(200).json({ hasLive, hasTrashbin, live, trashbin });
  } catch (e) {
    console.error('World info error:', e);
    res.status(500).json({ msg: 'Error gathering server data.' });
  }
});

// Read-only lookup for an unused slot id. An id with no servers/{id} folder
// isn't necessarily free — an account may have already claimed it via
// /server/reserve and just not created the server yet (pending creation), so
// every account's `servers` list is cross-referenced before an id counts as
// available. Does not reserve or claim anything.
router.get('/available-slot', function (req, res) {
  const email = req.headers.username;
  const token = req.headers.token;
  if (!email || !fs.existsSync(`accounts/${email}.json`)) {
    return res.status(401).json({ msg: 'Unauthorized' });
  }
  const account = readJSON(`accounts/${email}.json`);
  if (token !== account.token) return res.status(401).json({ msg: 'Unauthorized' });

  const idOffset = parseInt(config.idOffset);
  const maxServers = parseInt(config.maxServers);

  const claimedIds = new Set();
  for (const file of fs.readdirSync('accounts')) {
    if (file.includes('swp')) continue;
    try {
      const acc = readJSON(`accounts/${file}`);
      for (const entry of acc.servers || []) {
        // A ":freed" entry means the id was explicitly released for reuse
        // (see mergeDuplicateEmailAccounts / bug-resolver) — only a plain
        // id entry means the slot is still actively claimed.
        if (typeof entry === 'string' && !entry.includes(':freed')) {
          claimedIds.add(entry);
        }
      }
    } catch (e) {}
  }

  let id = null;
  for (let i = idOffset; i < idOffset + maxServers; i++) {
    if (fs.existsSync(`servers/${i}`)) continue;
    if (claimedIds.has(String(i))) continue;
    id = i;
    break;
  }

  res.status(200).json({ available: id !== null, id });
});

module.exports = router;
