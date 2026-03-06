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
    for (const serverId of account.servers) {
      const serverPath = `servers/${serverId}`;

      if (fs.existsSync(serverPath) && fs.existsSync(`${serverPath}/server.json`)) {
        const server = readJSON(`${serverPath}/server.json`);

        // Check if server is marked as expired
        if (server.expired || server.markedExpired) {
          expiredServers.push({
            id: serverId,
            name: server.serverName || `Server ${serverId}`,
            software: server.software || "Unknown",
            version: server.version || "Unknown"
          });
        }
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

    // Verify server belongs to user
    if (!account.servers.includes(targetServerId)) {
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

function handleServerRecovery(res, email, accountId, verified) {
  try {
    if (!verified) {
      return res.status(403).json({ success: false, message: "Verification failed" });
    }

    const account = readJSON(`accounts/${email}.json`);

    // Find the server - look for most recently expired/unmarked server
    let recoveredServer = null;
    let recoveredServerId = null;

    // Check all servers in account
    for (const serverId of account.servers) {
      const serverPath = `servers/${serverId}`;

      // Check if server directory exists
      if (fs.existsSync(serverPath)) {
        // Check if server.json exists
        if (fs.existsSync(`${serverPath}/server.json`)) {
          const server = readJSON(`${serverPath}/server.json`);

          // Check if server is marked as expired
          if (server.expired || server.markedExpired) {
            // Server exists but is marked expired - restore it
            recoveredServer = server;
            recoveredServerId = serverId;
            break; // Recover the first expired one found
          }
        }
      }
    }

    if (recoveredServer) {
      // Restore the server
      recoveredServer.expired = false;
      recoveredServer.markedExpired = false;
      recoveredServer.restoredDate = Date.now();

      writeJSON(`servers/${recoveredServerId}/server.json`, recoveredServer);

      // Log recovery
      console.log(`Server ${recoveredServerId} recovered for account ${email}`);

      return res.status(200).json({
        success: true,
        message: "Your server has been restored! You can now start using it again.",
        serverId: recoveredServerId,
        serverName: recoveredServer.serverName || `Server ${recoveredServerId}`
      });
    } else {
      // Server not found in servers directory - must be deleted/trashed
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
