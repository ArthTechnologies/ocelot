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

  // Same group resolution as /world-info: the archive is named after whichever
  // login owned the server, and servers/{id} only counts as "yours" when the
  // server.json in it actually names this account group. A freed id can be
  // reassigned, and the conflict view would otherwise report the new owner's
  // world size, mod count and player count.
  const members = resolveGroup(email, account);
  if (!groupClaimsId(members, rawId)) {
    return res.status(403).json({ msg: 'Server not found on this account.' });
  }
  const archives = findArchives(members, rawId);
  const trashPath = archives.length ? archives[0].path : null;

  let liveIsOurs = false;
  if (fs.existsSync(`${livePath}/server.json`)) {
    try {
      liveIsOurs = serverBelongsToGroup(readJSON(`${livePath}/server.json`), accountIdsOf(members));
    } catch (e) {}
  }

  if (!liveIsOurs || !trashPath) {
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
  const freedEntry = `${rawId}:freed`;

  const members = resolveGroup(email, account);
  const archives = findArchives(members, rawId);
  const trashPath = archives.length ? archives[0].path : null;

  // The ":freed" marker can sit on the sibling login rather than this one.
  const markerHolder = members.find(
    m => Array.isArray(m.data.servers) && m.data.servers.includes(freedEntry)
  );
  if (!markerHolder) {
    return res.status(400).json({ msg: 'Server not in conflict state.' });
  }

  // Confirmed before either branch: choosing "trashbin" renames servers/{id}
  // out of the way, and that folder is only ours to move if the server in it
  // belongs to this account group.
  let liveIsOurs = false;
  if (fs.existsSync(`${livePath}/server.json`)) {
    try {
      liveIsOurs = serverBelongsToGroup(readJSON(`${livePath}/server.json`), accountIdsOf(members));
    } catch (e) {}
  }
  if (!liveIsOurs) {
    return res.status(400).json({ msg: 'Server is not in a conflict state.' });
  }

  if (choice === 'trashbin' && !trashPath) {
    return res.status(400).json({ msg: 'Archived version no longer exists.' });
  }

  try {
    if (choice === 'trashbin') {
      const displacedPath = `trashbin/${rawId}-${markerHolder.name}-displaced-${Date.now()}`;
      fs.renameSync(livePath, displacedPath);
      fs.renameSync(trashPath, livePath);
    }

    // Cleared on every login that carries it — a marker left on the sibling
    // account keeps pointing that login at a server that is no longer freed.
    for (const member of members) {
      const linked = readJSON(`accounts/${member.file}`);
      if (!linked || !Array.isArray(linked.servers)) continue;
      if (!linked.servers.includes(freedEntry)) continue;
      linked.servers = linked.servers.map(s => (s === freedEntry ? rawId : s));
      writeJSON(`accounts/${member.file}`, linked);
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

  // Resolved across every login sharing this billing email: the archive folder
  // is named after the account that owned the server, and the ":freed" marker
  // may sit on the sibling account rather than this one.
  const members = resolveGroup(email, account);
  if (!groupClaimsId(members, rawId)) {
    return res.status(403).json({ msg: 'Server not found on this account.' });
  }

  const groupAccountIds = accountIdsOf(members);
  const archives = findArchives(members, rawId);

  const livePath = `servers/${rawId}`;
  const trashPath = archives.length ? archives[0].path : null;

  // Existence alone proves nothing: once a slot is freed it can be reassigned,
  // so servers/{id} may well be a different customer's server. Reporting its
  // world size and player count here would hand their data to the wrong person.
  let hasLive = false;
  if (fs.existsSync(`${livePath}/server.json`)) {
    try {
      hasLive = serverBelongsToGroup(readJSON(`${livePath}/server.json`), groupAccountIds);
    } catch (e) {}
  }
  const hasTrashbin = trashPath !== null;

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

// ---------------------------------------------------------------------------
// Restoring an expired server
//
// The expired page walks the user through three checks (subscription, slot,
// world data) and then hands off here. Everything below re-derives that state
// server-side rather than trusting what the page decided — the page's answers
// can be minutes old, and the slot it saw free may have been claimed since.
// ---------------------------------------------------------------------------

const accountLinking = require("../scripts/accountLinking.js");
const security = require("../scripts/security.js");
const schedules = require("../scripts/schedules.js");
const ftp = require("../scripts/ftp.js");

// mc.js is large and pulls in the whole server runtime; required lazily so the
// route file stays cheap to load and can't deadlock on require order.
function mc() {
  return require("../scripts/mc.js");
}

const WORLD_FOLDERS = ["world", "world_nether", "world_the_end"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function authenticate(req) {
  const email = req.headers.username;
  const token = req.headers.token;
  if (!email || typeof email !== "string") return null;
  if (email.includes("/") || email.includes("..")) return null;
  if (!fs.existsSync(`accounts/${email}.json`)) return null;

  const account = readJSON(`accounts/${email}.json`);
  if (!account || !account.accountId) return null;
  if (mode !== "solo" && token !== account.token) return null;
  return { email, account };
}

// Every account file sharing this billing email. A server's trashbin folder is
// named after the account that *owned* it, and subscriptions are logged against
// that same file, so a user signed in through their second login method finds
// neither unless the whole group is resolved.
function resolveGroup(email, account) {
  const members = [];
  for (const file of accountLinking.getLinkedAccountFiles(email, account)) {
    const data = readJSON(`accounts/${file}`);
    if (!data || !data.accountId) continue;
    members.push({ file, name: file.replace(/\.json$/, ""), data });
  }
  if (!members.some((m) => m.name === email)) {
    members.push({ file: `${email}.json`, name: email, data: account });
  }
  return members;
}

function accountIdsOf(members) {
  return members.map((m) => m.data.accountId).filter(Boolean);
}

// Access needs the accountId on the server *or* a place in allowedAccounts —
// the same contract /server/:id/allowAccount and utils.hasAccess use.
function serverBelongsToGroup(server, accountIds) {
  if (!server) return false;
  if (server.accountId && accountIds.includes(server.accountId)) return true;
  return accountLinking
    .parseAllowedAccounts(server)
    .some((id) => accountIds.includes(id));
}

function groupClaimsId(members, rawId) {
  return members.some(
    (m) =>
      Array.isArray(m.data.servers) &&
      m.data.servers.some(
        (entry) => String(entry) === rawId || String(entry) === `${rawId}:freed`
      )
  );
}

// Exact "{id}-{owner}" matches only. bug-resolver parks the version it displaces
// as "{id}-{owner}-displaced-{ts}", and those must never be picked up as the
// archive to restore.
function findArchives(members, rawId) {
  const archives = [];
  for (const member of members) {
    const path = `trashbin/${rawId}-${member.name}`;
    if (!fs.existsSync(path)) continue;
    let mtime = 0;
    try {
      mtime = fs.statSync(path).mtimeMs;
    } catch (e) {}
    archives.push({ path, owner: member.name, mtime });
  }
  // Newest first — an id reused across two logins can leave more than one.
  archives.sort((a, b) => b.mtime - a.mtime);
  return archives;
}

// Ids some account still holds as a plain (non-":freed") entry. A folderless id
// can still be spoken for: /server/reserve hands one out before the folder is
// ever created.
function claimedIds() {
  const claimed = new Map();
  let accountFiles = [];
  try {
    accountFiles = fs.readdirSync("accounts");
  } catch (e) {
    return claimed;
  }

  for (const file of accountFiles) {
    if (!file.endsWith(".json")) continue;
    let account;
    try {
      account = readJSON(`accounts/${file}`);
    } catch (e) {
      continue;
    }
    for (const entry of (account && account.servers) || []) {
      const value = String(entry);
      if (value.includes(":freed")) continue;
      if (!claimed.has(value)) claimed.set(value, file.replace(/\.json$/, ""));
    }
  }
  return claimed;
}

function isDirEmpty(dir) {
  try {
    return fs.readdirSync(dir).length === 0;
  } catch (e) {
    return false;
  }
}

// Slots a restore has claimed but not yet filled. The folder it creates to hold
// the id looks like an abandoned empty folder to every other check, so without
// this a second restore starting moments later would reclaim it.
const pendingSlots = new Set();

// What stands between us and writing into servers/{id}.
//   ours     - a live server this account group already owns
//   free     - nothing there
//   empty    - an abandoned folder with no server.json and no claimant
//   taken    - someone else's server, folder or reservation
function inspectSlot(id, accountIds, claimed, ownNames) {
  const dir = `servers/${id}`;
  const jsonPath = `${dir}/server.json`;

  if (fs.existsSync(jsonPath)) {
    let server = null;
    try {
      server = readJSON(jsonPath);
    } catch (e) {}
    return serverBelongsToGroup(server, accountIds)
      ? { state: "ours", reason: null }
      : { state: "taken", reason: "another_server" };
  }

  if (pendingSlots.has(String(id))) {
    return { state: "taken", reason: "restore_in_progress" };
  }

  const claimant = claimed.get(String(id));
  if (claimant && !(ownNames || []).includes(claimant)) {
    return { state: "taken", reason: "reserved_by_another_account" };
  }

  if (fs.existsSync(dir)) {
    if (isDirEmpty(dir)) return { state: "empty", reason: null };
    return { state: "taken", reason: "occupied_folder" };
  }

  return { state: "free", reason: null };
}

function findFreeSlot(accountIds, claimed) {
  const offset = parseInt(config.idOffset);
  const max = parseInt(config.maxServers);
  if (!Number.isFinite(offset) || !Number.isFinite(max)) return null;

  for (let i = offset; i < offset + max; i++) {
    const slot = inspectSlot(i, accountIds, claimed, []);
    if (slot.state === "free" || slot.state === "empty") return i;
  }
  return null;
}

// Live servers the group currently holds, by id. Used to check that a restore
// doesn't hand out more servers than the group is paying for.
function liveServerIds(members, accountIds) {
  const ids = new Set();
  for (const member of members) {
    for (const entry of member.data.servers || []) {
      const value = String(entry);
      if (value.includes(":freed")) continue;
      if (!fs.existsSync(`servers/${value}/server.json`)) continue;
      let server = null;
      try {
        server = readJSON(`servers/${value}/server.json`);
      } catch (e) {}
      if (serverBelongsToGroup(server, accountIds)) ids.add(value);
    }
  }
  return ids;
}

// Every subscription Stripe holds for the group, deduplicated. Two account
// files sharing a billing email usually resolve to the same Stripe customer,
// and counting that customer twice would hand out a server they never paid for.
async function fetchGroupSubscriptions(members) {
  const subscriptions = new Map();
  const customerIds = new Set();
  const seenEmails = new Set();

  for (const member of members) {
    const email = member.data.email;
    if (email && !seenEmails.has(String(email).toLowerCase())) {
      seenEmails.add(String(email).toLowerCase());
      try {
        const customers = await stripe.customers.list({ email, limit: 100 });
        for (const customer of customers.data) customerIds.add(customer.id);
      } catch (e) {
        console.error("Stripe customer lookup failed for " + email + ":", e.message);
      }
    }
    if (member.data.stripeCustomerId) customerIds.add(member.data.stripeCustomerId);
  }

  for (const customerId of customerIds) {
    try {
      const list = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      });
      for (const sub of list.data) subscriptions.set(sub.id, sub);
    } catch (e) {
      console.error("Stripe subscription lookup failed for " + customerId + ":", e.message);
    }
  }

  return Array.from(subscriptions.values());
}

// Only "active" and "trialing" count. "past_due" looks tempting — the customer
// hasn't cancelled — but enforceSubscription() in utils.js treats anything else
// as lapsed and, with no ended_at to measure a grace period from, would bin the
// server again on the very next sweep.
function summariseSubscriptions(subs) {
  const entitled = subs.filter(
    (s) => s.status === "active" || s.status === "trialing"
  );
  return {
    active: entitled.length,
    pastDue: subs.filter((s) => s.status === "past_due").length,
    total: subs.length,
  };
}

// Same shape checkSubscriptions() writes, so logs/subscriptions.json stays
// readable by info.js until the next nightly sweep rebuilds it.
function toSubscriptionLogEntries(subs) {
  return subs.map((sub) => {
    const price = sub.items && sub.items.data[0] ? sub.items.data[0].price : null;
    return {
      status: sub.status,
      ended_at: sub.ended_at,
      current_period_end: sub.current_period_end,
      start_date: sub.start_date,
      productID: price ? price.product : undefined,
      unitAmount: price ? price.unit_amount : undefined,
      interval: price && price.recurring ? price.recurring.interval : undefined,
      intervalCount: price && price.recurring ? price.recurring.interval_count : undefined,
    };
  });
}

// Everything the restore needs to know, derived fresh from disk and Stripe.
// Called both by the preflight endpoint and again at the top of the job, so a
// slot that disappears in between is caught rather than overwritten.
async function buildRestorePlan(email, account, rawId) {
  const members = resolveGroup(email, account);
  const accountIds = accountIdsOf(members);
  const blockers = [];
  const warnings = [];

  if (!groupClaimsId(members, rawId)) {
    return {
      serverId: rawId,
      kind: "not_owned",
      canRestore: false,
      blockers: [
        {
          code: "not_owned",
          message: "This server isn't listed on your account.",
        },
      ],
      warnings: [],
      members,
      accountIds,
    };
  }

  const archives = findArchives(members, rawId);
  const liveJsonPath = `servers/${rawId}/server.json`;
  let liveServer = null;
  if (fs.existsSync(liveJsonPath)) {
    try {
      liveServer = readJSON(liveJsonPath);
    } catch (e) {}
  }
  const liveIsOurs = serverBelongsToGroup(liveServer, accountIds);

  let kind;
  if (archives.length && liveIsOurs) kind = "conflict";
  else if (archives.length) kind = "archive";
  else if (liveIsOurs) kind = "live";
  else kind = "missing";

  if (archives.length > 1) {
    warnings.push({
      code: "multiple_archives",
      message:
        "More than one archived copy of this server exists. The most recent one will be restored; the others stay in storage.",
    });
  }

  if (kind === "conflict") {
    blockers.push({
      code: "world_conflict",
      message:
        "Two copies of this server exist. Choose which one to keep before restoring.",
    });
  }

  if (kind === "missing") {
    blockers.push({
      code: "no_data",
      message:
        "We couldn't find any data for this server — it's past the recovery window. Please contact support.",
    });
  }

  // Caught here rather than after the move: without a server.json the restore
  // can't finish, and a failure halfway would leave the files sitting in a
  // slot with nothing pointing at them.
  if (kind === "archive" && !fs.existsSync(`${archives[0].path}/server.json`)) {
    blockers.push({
      code: "archive_incomplete",
      message:
        "Your server's stored copy is missing its configuration, so it can't be restored automatically. Please contact support — your files are safe.",
    });
  }

  // --- slot ---------------------------------------------------------------
  const claimed = claimedIds();
  const groupNames = members.map((m) => m.name);
  const originalSlot = inspectSlot(rawId, accountIds, claimed, groupNames);
  let targetId = rawId;
  let needsNewSlot = false;

  if (kind === "archive") {
    if (originalSlot.state === "taken") {
      needsNewSlot = true;
      const free = findFreeSlot(accountIds, claimed);
      if (free === null) {
        targetId = null;
        blockers.push({
          code: "no_slots",
          message:
            "This location is currently full, so there's no slot to restore into. Please check back later or contact support.",
        });
      } else {
        targetId = String(free);
        warnings.push({
          code: "slot_changed",
          message: `Your original slot (#${rawId}) was reassigned, so your server will be restored as #${free}. Its IP address will change.`,
        });
        const archiveServer = readJSON(`${archives[0].path}/server.json`);
        if (archiveServer && archiveServer.subdomain) {
          warnings.push({
            code: "subdomain_released",
            message: `Your custom address (${archiveServer.subdomain}) is tied to the old slot and will need to be claimed again.`,
          });
        }
      }
    }
  } else if (kind === "live" && originalSlot.state !== "ours") {
    // Shouldn't happen — liveIsOurs is what set kind === "live" — but never
    // write into a folder we just failed to confirm ownership of.
    blockers.push({
      code: "slot_conflict",
      message: "This server slot is in an unexpected state. Please contact support.",
    });
  }

  // --- subscription -------------------------------------------------------
  const live = liveServerIds(members, accountIds);
  const freeServers = Math.max(
    0,
    ...members.map((m) => parseInt(m.data.freeServers) || 0)
  );
  const required = live.size + (kind === "archive" ? 1 : 0);

  let subscription = {
    checked: false,
    active: 0,
    pastDue: 0,
    freeServers,
    liveServers: live.size,
    required,
    sufficient: true,
  };
  let rawSubscriptions = [];

  if (mode === "provider") {
    rawSubscriptions = await fetchGroupSubscriptions(members);
    const summary = summariseSubscriptions(rawSubscriptions);
    subscription = {
      checked: true,
      active: summary.active,
      pastDue: summary.pastDue,
      freeServers,
      liveServers: live.size,
      required,
      sufficient: summary.active + freeServers >= required,
    };

    if (summary.active === 0) {
      blockers.push({
        code: summary.pastDue > 0 ? "payment_pending" : "no_subscription",
        message:
          summary.pastDue > 0
            ? "Your latest payment hasn't gone through yet. Once it clears, your server can be restored."
            : "You need an active subscription before this server can be restored.",
      });
    } else if (!subscription.sufficient) {
      blockers.push({
        code: "insufficient_subscriptions",
        message: `Your ${summary.active} subscription${
          summary.active === 1 ? "" : "s"
        } already cover${summary.active === 1 ? "s" : ""} ${
          live.size
        } active server${
          live.size === 1 ? "" : "s"
        }. Add another subscription to bring this one back too.`,
      });
    }
  }

  return {
    serverId: rawId,
    kind,
    canRestore: blockers.length === 0,
    blockers,
    warnings,
    slot: {
      originalId: rawId,
      originalState: originalSlot.state,
      originalReason: originalSlot.reason,
      targetId,
      needsNewSlot,
    },
    data: {
      source: kind === "archive" ? "storage" : kind === "live" ? "live" : "none",
      hasLive: liveIsOurs,
      hasArchive: archives.length > 0,
      archiveCount: archives.length,
    },
    subscription,
    // Internals — stripped before the plan is sent to the browser.
    members,
    accountIds,
    archives,
    rawSubscriptions,
  };
}

function publicPlan(plan) {
  const { members, accountIds, archives, rawSubscriptions, ...rest } = plan;
  return rest;
}

// --- job bookkeeping -------------------------------------------------------

const RESTORE_STEPS = [
  { key: "verify", label: "Verifying your account and server" },
  { key: "subscription", label: "Confirming your subscription" },
  { key: "slot", label: "Securing a server slot" },
  { key: "data", label: "Restoring your server files" },
  { key: "world", label: "Applying your world preference" },
  { key: "account", label: "Relinking the server to your account" },
  { key: "access", label: "Rebuilding file and FTP access" },
  { key: "billing", label: "Refreshing your billing records" },
  { key: "finalize", label: "Running final checks" },
];

const restoreJobs = new Map();
const JOB_RETENTION_MS = 1000 * 60 * 15;

// Slot selection and the folder move that follows must not interleave, or two
// restores running seconds apart both pick the same "free" id.
let slotLock = Promise.resolve();
function withSlotLock(fn) {
  const run = slotLock.then(fn, fn);
  slotLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function createJob(rawId, email) {
  return {
    id: `restore_${rawId}_${Date.now()}`,
    serverId: rawId,
    account: email,
    status: "running",
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
    result: null,
    warnings: [],
    steps: RESTORE_STEPS.map((step) => ({
      key: step.key,
      label: step.label,
      status: "pending",
      detail: null,
    })),
  };
}

function jobStep(job, key) {
  return job.steps.find((step) => step.key === key);
}

async function beginStep(job, key) {
  const step = jobStep(job, key);
  step.status = "running";
  // The filesystem work is near-instant; without a beat between steps the
  // modal would jump straight from "starting" to "done" and show nothing.
  await sleep(280);
}

function finishStep(job, key, detail) {
  const step = jobStep(job, key);
  step.status = "done";
  if (detail) step.detail = detail;
}

function skipStep(job, key, detail) {
  const step = jobStep(job, key);
  step.status = "skipped";
  if (detail) step.detail = detail;
}

function failJob(job, key, message) {
  if (key) {
    const step = jobStep(job, key);
    if (step) {
      step.status = "failed";
      step.detail = message;
    }
  }
  for (const step of job.steps) {
    if (step.status === "pending" || step.status === "running") {
      step.status = "cancelled";
    }
  }
  job.status = "failed";
  job.error = message;
  job.finishedAt = Date.now();
}

function publicJob(job) {
  return {
    jobId: job.id,
    serverId: job.serverId,
    status: job.status,
    steps: job.steps,
    error: job.error,
    result: job.result,
    warnings: job.warnings,
  };
}

function pruneJobs() {
  for (const [key, job] of restoreJobs) {
    if (job.status === "running") continue;
    if (Date.now() - (job.finishedAt || job.startedAt) > JOB_RETENTION_MS) {
      restoreJobs.delete(key);
    }
  }
}

// --- the restore itself ----------------------------------------------------

// Move the world folders aside instead of deleting them. The user asked for a
// fresh world, not for their old one to be unrecoverable — a mis-tapped toggle
// shouldn't cost them their base.
function archiveWorldFolders(serverDir, rawId, ownerName) {
  const present = WORLD_FOLDERS.filter((folder) =>
    fs.existsSync(`${serverDir}/${folder}`)
  );
  if (!present.length) return { moved: [], destination: null };

  if (!fs.existsSync("trashbin")) fs.mkdirSync("trashbin");
  const destination = `trashbin/${rawId}-${ownerName}-world-${Date.now()}`;
  fs.mkdirSync(destination, { recursive: true });

  const moved = [];
  for (const folder of present) {
    fs.renameSync(`${serverDir}/${folder}`, `${destination}/${folder}`);
    moved.push(folder);
  }
  return { moved, destination };
}

// Rewrite the account entries for this id across the whole group: the ":freed"
// marker (or a stale plain entry) becomes the id the server actually lives at
// now. Both halves of the access contract are written — the id on the account,
// and the account on the server — the same pairing /server/:id/allowAccount and
// the duplicate-email migration use.
function relinkAccounts(members, rawId, targetId, oldSlotTakenByOthers) {
  const touched = [];

  for (const member of members) {
    const account = readJSON(`accounts/${member.file}`);
    if (!account || !Array.isArray(account.servers)) continue;

    const before = JSON.stringify(account.servers);
    const next = [];
    for (const entry of account.servers) {
      const value = String(entry);
      if (value === `${rawId}:freed` || value === rawId) {
        // A plain entry for an id someone else now owns is a dead pointer —
        // leaving it behind shows the sibling login a "not your server" card.
        if (value === rawId && targetId !== rawId && oldSlotTakenByOthers) continue;
        next.push(String(targetId));
        continue;
      }
      next.push(entry);
    }

    account.servers = next.filter(
      (entry, index) => next.findIndex((e) => String(e) === String(entry)) === index
    );

    if (JSON.stringify(account.servers) !== before) {
      writeJSON(`accounts/${member.file}`, account);
      touched.push(member.name);
      member.data = account;
    }
  }

  return touched;
}

async function runRestore(job, email, account, rawId, restoreWorld) {
  try {
    // 1. verify ------------------------------------------------------------
    await beginStep(job, "verify");
    const plan = await buildRestorePlan(email, account, rawId);
    if (!plan.canRestore) {
      failJob(job, "verify", plan.blockers[0].message);
      return;
    }
    job.warnings = plan.warnings;
    const { members, accountIds, archives } = plan;
    finishStep(
      job,
      "verify",
      plan.kind === "archive"
        ? "Found your server in storage"
        : "Your server is still on this node"
    );

    // 2. subscription ------------------------------------------------------
    await beginStep(job, "subscription");
    if (!plan.subscription.checked) {
      skipStep(job, "subscription", "No billing on this panel");
    } else {
      finishStep(
        job,
        "subscription",
        `${plan.subscription.active} active subscription${
          plan.subscription.active === 1 ? "" : "s"
        }`
      );
    }

    // 3. slot --------------------------------------------------------------
    await beginStep(job, "slot");
    let targetId = rawId;
    let oldSlotTakenByOthers = false;

    if (plan.kind === "archive") {
      // Re-checked under the lock: the plan's answer is already a few hundred
      // milliseconds old, and /server/reserve hands out ids continuously.
      const reserved = await withSlotLock(() => {
        const claimed = claimedIds();
        const groupNames = members.map((m) => m.name);
        const original = inspectSlot(rawId, accountIds, claimed, groupNames);

        let chosen = null;
        if (original.state === "free" || original.state === "empty") {
          chosen = rawId;
        } else {
          const free = findFreeSlot(accountIds, claimed);
          if (free !== null) chosen = String(free);
        }
        if (chosen === null) return null;

        // An abandoned empty folder blocks the rename; clearing it is safe
        // because inspectSlot only calls a folder "empty" when it holds
        // nothing and no account has reserved the id.
        const dir = `servers/${chosen}`;
        if (fs.existsSync(dir) && isDirEmpty(dir)) fs.rmdirSync(dir);

        // Held until the job ends, so nothing else treats this id as spare
        // while the (potentially slow) folder move runs.
        pendingSlots.add(String(chosen));
        job.reservedSlot = String(chosen);
        return { chosen, originalState: original.state };
      });

      if (!reserved) {
        failJob(
          job,
          "slot",
          "Every slot on this location was taken while we were restoring. Please try again shortly."
        );
        return;
      }

      targetId = reserved.chosen;
      oldSlotTakenByOthers = targetId !== rawId;
      finishStep(
        job,
        "slot",
        targetId === rawId
          ? `Reclaimed your original slot #${rawId}`
          : `Original slot was taken — assigned slot #${targetId}`
      );
    } else {
      skipStep(job, "slot", `Still on slot #${rawId}`);
    }

    const serverDir = `servers/${targetId}`;
    const ownerName = archives.length ? archives[0].owner : email;

    // 4. data --------------------------------------------------------------
    await beginStep(job, "data");
    if (plan.kind === "archive") {
      // Re-checked immediately before the move — buildRestorePlan blocks on
      // this too, but the archive is only ours to trust at the moment we take
      // it, not a second earlier.
      if (!fs.existsSync(`${archives[0].path}/server.json`)) {
        failJob(
          job,
          "data",
          "Your server's stored copy is missing its configuration. Please contact support — your files are safe."
        );
        return;
      }

      try {
        if (!fs.existsSync("servers")) fs.mkdirSync("servers");
        // rename refuses a destination that already exists, even an empty one.
        if (fs.existsSync(serverDir) && isDirEmpty(serverDir)) fs.rmdirSync(serverDir);
        fs.renameSync(archives[0].path, serverDir);
      } catch (e) {
        console.error(`Restore of server ${rawId} failed while moving files:`, e);
        // Leave no half-claimed folder behind for /server/reserve to trip over.
        try {
          if (fs.existsSync(serverDir) && isDirEmpty(serverDir)) fs.rmdirSync(serverDir);
        } catch (cleanupError) {}
        failJob(
          job,
          "data",
          "We couldn't move your server files out of storage. Please contact support."
        );
        return;
      }

      if (!fs.existsSync(`${serverDir}/server.json`)) {
        failJob(
          job,
          "data",
          "Your server files were restored but the configuration is missing. Please contact support."
        );
        return;
      }
      finishStep(job, "data", "Server files moved back from storage");
    } else {
      skipStep(job, "data", "Your files never left this node");
    }

    // 5. world -------------------------------------------------------------
    await beginStep(job, "world");
    if (restoreWorld) {
      skipStep(job, "world", "Keeping your existing world");
    } else {
      // Yanking the world folder out from under a running server corrupts it.
      // A server in this state is normally stopped already, so this only fires
      // on the "live" path where it somehow survived.
      try {
        if (mc().getState(targetId) !== "false") {
          await new Promise((resolve) => {
            let settled = false;
            const done = () => {
              if (settled) return;
              settled = true;
              resolve();
            };
            mc().killAsync(targetId, done);
            setTimeout(done, 20000);
          });
        }
      } catch (e) {
        console.log(`Could not confirm server ${targetId} was stopped: ${e}`);
      }

      try {
        const archived = archiveWorldFolders(serverDir, rawId, ownerName);
        finishStep(
          job,
          "world",
          archived.moved.length
            ? "Old world moved to storage — you'll start on a fresh one"
            : "No existing world to clear"
        );
      } catch (e) {
        console.error(`Could not clear world for server ${targetId}:`, e);
        // Not fatal: the server is restored either way, the user just keeps the
        // world they asked to leave behind.
        jobStep(job, "world").status = "done";
        jobStep(job, "world").detail =
          "Couldn't clear the old world — it was kept in place";
        job.warnings.push({
          code: "world_not_cleared",
          message:
            "We couldn't move your old world aside, so your server was restored with it. You can delete it from the Files tab.",
        });
      }
    }

    // 6. account -----------------------------------------------------------
    await beginStep(job, "account");
    const server = readJSON(`${serverDir}/server.json`);
    server.id = String(targetId);
    server.expired = false;
    server.markedExpired = false;
    server.restoredDate = Date.now();

    // Every login this person uses keeps access, so the sibling account doesn't
    // land on a "not your server" card after the restore.
    const allowed = new Set(accountLinking.parseAllowedAccounts(server));
    for (const id of accountIds) {
      if (id && id !== server.accountId) allowed.add(id);
    }
    server.allowedAccounts = Array.from(allowed).join(",");

    if (targetId !== rawId && server.subdomain) {
      // The SRV record points at port 10000+oldId. subdomainCleanup deletes
      // records that no live server claims, so dropping the field here is
      // enough — the stale record is collected on the next sweep.
      delete server.subdomain;
    }
    writeJSON(`${serverDir}/server.json`, server);

    const touched = relinkAccounts(members, rawId, targetId, oldSlotTakenByOthers);

    if (targetId !== rawId) {
      try {
        schedules.remapServerId(rawId, targetId);
      } catch (e) {
        console.error(`Could not remap schedules from ${rawId} to ${targetId}:`, e);
      }
      try {
        if (fs.existsSync(`backups/${rawId}`) && !fs.existsSync(`backups/${targetId}`)) {
          fs.renameSync(`backups/${rawId}`, `backups/${targetId}`);
        }
      } catch (e) {
        console.error(`Could not move backups from ${rawId} to ${targetId}:`, e);
      }
    }

    finishStep(
      job,
      "account",
      touched.length > 1
        ? `Relinked across ${touched.length} logins`
        : "Relinked to your account"
    );

    // 7. access ------------------------------------------------------------
    await beginStep(job, "access");
    try {
      // ensureKey, not refreshKeys — the latter rotates every server's key and
      // would drop the file sessions of every other customer on this node.
      security.ensureKey(String(targetId));
      ftp.startFtpServer();
      finishStep(job, "access", "File manager and FTP access rebuilt");
    } catch (e) {
      console.error(`Could not rebuild access for server ${targetId}:`, e);
      jobStep(job, "access").status = "done";
      jobStep(job, "access").detail = "File access will finish rebuilding shortly";
      job.warnings.push({
        code: "ftp_pending",
        message:
          "FTP access is still rebuilding. If you can't connect, try again in a few minutes.",
      });
    }

    // 8. billing -----------------------------------------------------------
    await beginStep(job, "billing");
    if (mode !== "provider") {
      skipStep(job, "billing", "No billing on this panel");
    } else {
      try {
        const owner = members.find((m) => m.data.accountId === server.accountId) ||
          members.find((m) => m.name === email) ||
          members[0];
        let log = readJSON("logs/subscriptions.json");
        if (!Array.isArray(log)) log = [];

        // info.js reads this file to decide whether a server is expired. Left
        // holding the pre-restore answer, the server would show as expired
        // again the moment the page reloaded.
        const memberFiles = members.map((m) => m.file);
        log = log.filter(
          (entry) =>
            !(
              (String(entry.serverId) === rawId ||
                String(entry.serverId) === String(targetId)) &&
              memberFiles.includes(entry.owner)
            )
        );
        log.push({
          serverId: String(targetId),
          owner: owner.file,
          email: owner.data.email,
          storage: 0,
          accountId: owner.data.accountId,
          subscriptions: toSubscriptionLogEntries(plan.rawSubscriptions),
        });
        writeJSON("logs/subscriptions.json", log);
        finishStep(job, "billing", "Subscription records updated");
      } catch (e) {
        console.error(`Could not refresh subscription records for ${targetId}:`, e);
        jobStep(job, "billing").status = "done";
        jobStep(job, "billing").detail = "Records will refresh on the next check";
      }
    }

    // 9. finalize ----------------------------------------------------------
    await beginStep(job, "finalize");
    if (!fs.existsSync(`${serverDir}/server.json`)) {
      failJob(job, "finalize", "The restored server couldn't be verified. Please contact support.");
      return;
    }
    const finalServer = readJSON(`${serverDir}/server.json`);
    if (!serverBelongsToGroup(finalServer, accountIds)) {
      failJob(job, "finalize", "The restored server couldn't be verified. Please contact support.");
      return;
    }
    finishStep(job, "finalize", "Everything checks out");

    job.status = "done";
    job.finishedAt = Date.now();
    job.result = {
      serverId: String(targetId),
      previousServerId: rawId,
      movedSlot: String(targetId) !== rawId,
      serverName: finalServer.name || `Server ${targetId}`,
      software: finalServer.software || "unknown",
      version: finalServer.version || "unknown",
      worldKept: restoreWorld,
    };
    console.log(
      `Server ${rawId} restored to slot ${targetId} for ${email} (${plan.kind})`
    );
  } catch (e) {
    console.error(`Unhandled error restoring server ${rawId}:`, e);
    const running = job.steps.find((step) => step.status === "running");
    failJob(
      job,
      running ? running.key : null,
      "Something went wrong while restoring your server. Please contact support."
    );
  } finally {
    if (job.reservedSlot) pendingSlots.delete(job.reservedSlot);
    if (job.status === "running") {
      // Nothing above set a terminal status — never leave a job polling forever.
      failJob(job, null, "The restore ended unexpectedly. Please contact support.");
    }
  }
}

// Preflight: what would happen, and what's in the way. Drives the slot step and
// the enabled state of the Restore button on the expired page.
router.get("/restore/:id/plan", async function (req, res) {
  const auth = authenticate(req);
  if (!auth) return res.status(401).json({ msg: "Unauthorized" });

  const rawId = String(req.params.id);
  if (!/^\d+$/.test(rawId)) return res.status(400).json({ msg: "Invalid server id." });

  try {
    const plan = await buildRestorePlan(auth.email, auth.account, rawId);
    const running = restoreJobs.get(rawId);
    res.status(200).json({
      ...publicPlan(plan),
      activeJob: running && running.status === "running" ? publicJob(running) : null,
    });
  } catch (e) {
    console.error(`Error building restore plan for server ${rawId}:`, e);
    res.status(500).json({ msg: "Couldn't work out how to restore this server." });
  }
});

router.post("/restore/:id", function (req, res) {
  const auth = authenticate(req);
  if (!auth) return res.status(401).json({ msg: "Unauthorized" });

  const rawId = String(req.params.id);
  if (!/^\d+$/.test(rawId)) return res.status(400).json({ msg: "Invalid server id." });

  // Checked before anything is read back to the caller — otherwise anyone could
  // POST an id they don't own and read another customer's restore job.
  const members = resolveGroup(auth.email, auth.account);
  if (!groupClaimsId(members, rawId)) {
    return res.status(403).json({ msg: "This server isn't listed on your account." });
  }

  pruneJobs();

  const existing = restoreJobs.get(rawId);
  if (existing && existing.status === "running") {
    // A double-tapped button, or the page reopened mid-restore.
    return res.status(200).json({ ...publicJob(existing), alreadyRunning: true });
  }
  // A finished job is history, not a result to hand back: a server can expire
  // again, and a failed attempt is meant to be retried. Replaying the old job
  // here reported success for a restore that never ran.
  restoreJobs.delete(rawId);

  // restoreWorld defaults to true: the safe reading of a missing field is
  // "keep the customer's world".
  const restoreWorld = req.body && req.body.restoreWorld === false ? false : true;

  const job = createJob(rawId, auth.email);
  restoreJobs.set(rawId, job);
  res.status(202).json(publicJob(job));

  runRestore(job, auth.email, auth.account, rawId, restoreWorld);
});

router.get("/restore/:id/progress", function (req, res) {
  const auth = authenticate(req);
  if (!auth) return res.status(401).json({ msg: "Unauthorized" });

  const rawId = String(req.params.id);
  const job = restoreJobs.get(rawId);
  if (!job) return res.status(404).json({ msg: "No restore in progress." });

  // A restore started by one login is visible to its siblings, but not to an
  // unrelated account that happens to guess the id.
  const members = resolveGroup(auth.email, auth.account).map((m) => m.name);
  if (job.account !== auth.email && !members.includes(job.account)) {
    return res.status(403).json({ msg: "No restore in progress." });
  }

  res.status(200).json(publicJob(job));
});

module.exports = router;
