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
        // User doesn't have valid subscription - don't process
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

module.exports = router;
