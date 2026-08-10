const fs = require("fs");
const { exec } = require("child_process");
const config = getConfig();
const mode = config.mode;
const path = require("path");
const stripe = require("stripe")(config.stripeKey);
const files = require("./files.js");


function getConfig() {
  let configTxt = fs.readFileSync("config.txt", "utf8").split("\n");
  let config = {};
  configTxt.forEach((line) => {
    if (line.includes("=")) {
      let splitLine = line.split("=");
      config[splitLine[0]] = splitLine[1];
    }
  });
  return config;
}

function readJSON(file) {
  let json = {};
  try {
    if (fs.existsSync(file)) {
      json = JSON.parse(fs.readFileSync(file, "utf8"));
    } else if (!file.includes("servers/") && !file.includes("accounts/")) {
      console.log(file + " does not exist.");
    }
  } catch (error) {
    console.log("error parsing json for " + file, error);
  }
  return json;
}

function writeJSON(file, json) {
  if (file.includes("accounts/")) {
    // Deliberately only the filename: this used to print the whole account
    // object, which put password hashes, salts and tokens in the console.
    console.log("Writing " + file);
  }
  try {
    fs.writeFileSync(file, JSON.stringify(json, null, 2));
  } catch (error) {
    console.log("error writing json for " + file, error);
  }
}

function refreshPermissions() {
  const { exec } = require("child_process");
  exec("sudo chown sysadmin:100 -R servers/", (error, stdout, stderr) => {
    if (error) {
      console.error(`Error setting permissions: ${error}`);
      return;
    }
    exec("sudo chmod 2776 -R servers/", (error, stdout, stderr) => {
      if (error) {
        console.error(`Error setting permissions: ${error}`);
        return;
      }
      console.log("Permissions set successfully.");
      return;
    }); 
 
  });
}

function hasAccess(token, account, id) {
  let server = readJSON(`servers/${id}/server.json`);
  if (mode === "solo") return true;
  // A request with no token header used to throw on token.includes() below,
  // producing a 500 HTML page that callers then tried to parse as JSON.
  if (typeof token !== "string" || account == undefined) return false;
  let accountOwner = token === account.token;
  let serverOwner = server.accountId == account.accountId;
  let allowedAccount = false;
  if (server.allowedAccounts !== undefined) {
    allowedAccount = server.allowedAccounts.includes(account.accountId);
  }
  if (token.includes("grz")) console.log("Checking access for account: \n" + accountOwner + "\n" + serverOwner + "\n" + allowedAccount);

  return accountOwner && (serverOwner || allowedAccount);
}

function sanitizePath(userInput) {
  // Step 1: Block null bytes (common in attacks)
  if (userInput.includes("\0")) {
    console.log("null byte blocked: " + userInput);
    return "invalid";
  }

  // Step 2: Normalize the path to resolve `..` and `.`
  const normalized = path.normalize(userInput);

  // Step 3: Split into parts and filter out traversal attempts
  const parts = normalized.split(path.sep); // Handles OS-specific separators
  const filteredParts = parts.filter((part) => {
    // Reject empty parts (e.g., from leading/trailing slashes)
    if (part === "") return false;
    // Block parent directory traversal
    if (part === "..") return false;
    return true;
  });

  // Step 4: Rebuild the sanitized path
  const sanitized = filteredParts.join(path.sep);

  // Step 5: Block absolute paths (e.g., /etc/passwd or C:\Windows)
  if (path.isAbsolute(sanitized)) {
    console.log("absolute path blocked: " + sanitized);
    return "invalid";
  }

  return sanitized;
}

// Pull every subscription Stripe knows about for a billing email.
// Returns null when the email has no customer record at all — callers treat
// that as "we don't know" and leave the server alone, which is deliberately
// different from a customer that exists with zero subscriptions (expired).
async function fetchSubscriptionsForEmail(email) {
  const customers = await stripe.customers.list({ limit: 100, email: email });
  if (customers.data.length === 0) {
    console.log("No customer found for " + email);
    return null;
  }

  console.log("Customer found for " + email);
  const subscriptions = [];
  for (const customer of customers.data) {
    if (!customer.id) continue;
    console.log("Getting subscriptions for customer " + customer.id);
    const list = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 100,
    });
    for (const sub of list.data) {
      const price = sub.items?.data[0]?.price;
      subscriptions.push({
        status: sub.status,
        ended_at: sub.ended_at,
        current_period_end: sub.current_period_end,
        start_date: sub.start_date,
        productID: price?.product,
        unitAmount: price?.unit_amount,
        interval: price?.recurring?.interval,
        intervalCount: price?.recurring?.interval_count,
      });
    }
  }
  return subscriptions;
}

// Live second opinion, asked immediately before anything destructive.
async function hasActiveStripeSubscription(email) {
  const customers = await stripe.customers.list({ email: email, limit: 1 });
  if (customers.data.length === 0) return false;

  const subscriptions = await stripe.subscriptions.list({
    customer: customers.data[0].id,
    status: "all",
    limit: 100,
  });
  return subscriptions.data.some(
    (s) => s.status === "active" || s.status === "trialing"
  );
}

// Billing email for an account: email logins carry it in the filename, OAuth
// logins carry it in the account body.
function billingEmailFor(file, account) {
  if (file.includes("email:")) return file.split("email:")[1].split(".json")[0];
  return account.email;
}

// Map each server folder to the account that owns it. At most one entry per
// server: linked accounts (same person, two login methods) both list a server
// in `servers`, and a duplicate here would process the same server twice.
function resolveServerOwners(servers, storageSizes) {
  const accounts = [];
  for (const file of fs.readdirSync("accounts")) {
    // Skips editor swapfiles, and the solo-mode account which never owns a
    // billable server.
    if (!file.endsWith(".json") || file === "noemail.json") continue;
    try {
      accounts.push({ file: file, data: readJSON(`accounts/${file}`) });
    } catch (e) {
      console.log("Error reading accounts/" + file + ": " + e);
    }
  }

  const data = [];
  for (let i = 0; i < servers.length; i++) {
    const serverId = servers[i];
    const storage = storageSizes[i];
    try {
      let owner;
      if (fs.existsSync(`servers/${serverId}/server.json`)) {
        const json = readJSON(`servers/${serverId}/server.json`);
        if (json.adminServer) continue;
        owner = accounts.find((a) => a.data.accountId === json.accountId);
      } else {
        // No server.json to name an owner, so fall back to whoever claims it.
        owner = accounts.find(
          (a) =>
            Array.isArray(a.data.servers) &&
            (a.data.servers.includes(serverId) ||
              a.data.servers.includes(parseInt(serverId)))
        );
      }

      if (!owner) continue;
      data.push({
        serverId: serverId,
        owner: owner.file,
        email: billingEmailFor(owner.file, owner.data),
        storage: storage,
        accountId: owner.data.accountId,
      });
    } catch (e) {
      console.log("Error resolving owner for server " + serverId + ": " + e);
    }
  }
  return data;
}

// Mark the server ":freed" on the owner and on any linked account (same person,
// second login method) that also lists it. Leaving a linked entry unmarked
// points it at a folder that no longer exists, which surfaces as a bare
// "error 101" card instead of the expired-server card the owner gets.
function markServerFreed(entry) {
  // Required lazily to avoid a circular import (accountLinking pulls readJSON
  // from this module).
  const accountLinking = require("./accountLinking.js");
  const ownerName = entry.owner.replace(/\.json$/, "");
  const ownerAccount = readJSON(`accounts/${entry.owner}`);

  for (const file of accountLinking.getLinkedAccountFiles(ownerName, ownerAccount)) {
    const linkedAccount = readJSON(`accounts/${file}`);
    if (!Array.isArray(linkedAccount.servers)) continue;
    if (!linkedAccount.servers.includes(entry.serverId)) continue;

    linkedAccount.servers = linkedAccount.servers.filter(
      (server) => server !== entry.serverId
    );
    linkedAccount.servers.push(entry.serverId + ":freed");
    writeJSON(`accounts/${file}`, linkedAccount);
  }
}

function moveServerToTrashbin(entry) {
  const logLine =
    "server " + entry.serverId + " moved to trashbin. Subscription data: \n" +
    JSON.stringify(entry, null, 2) + "\n";

  if (!fs.existsSync("logs/trashbin.log")) fs.writeFileSync("logs/trashbin.log", "");
  fs.appendFileSync("logs/trashbin.log", logLine);
  if (!fs.existsSync("trashbin")) fs.mkdirSync("trashbin");

  const target = `trashbin/${entry.serverId}-${entry.owner.split(".json")[0]}`;
  try {
    if (fs.existsSync(`servers/${entry.serverId}`) && !fs.existsSync(target)) {
      fs.renameSync(`servers/${entry.serverId}`, target);

      // Sometimes an empty folder is left behind, so we delete it
      if (fs.existsSync(`servers/${entry.serverId}`)) {
        fs.rmSync(`servers/${entry.serverId}`, { recursive: true, force: true });
      }

      markServerFreed(entry);
    } else if (fs.existsSync(`servers/${entry.serverId}`)) {
      console.log("Deleting empty server folder " + entry.serverId);
      fs.rmSync(`servers/${entry.serverId}`, { recursive: true, force: true });
    }

    // The sftp container's bind mount pins the old folder inode, so FTP would
    // keep serving the binned (or emptied) directory until the next rebuild.
    // Lazy require: ftp.js imports from utils.js at top level.
    try {
      require("./ftp").startFtpServer();
    } catch (ftpError) {
      console.log("Error restarting FTP server after trashbin move: " + ftpError);
    }
  } catch (e) {
    console.log("Error moving server to trashbin " + entry.serverId);
    console.log(e);
  }
}

// Stop, and eventually bin, a server whose subscription has lapsed.
async function enforceSubscription(entry) {
  // undefined means Stripe never gave a usable answer (no customer record, or
  // the lookup failed). Never act on that — only on a confirmed empty list.
  if (entry.subscriptions == undefined) {
    console.log("No subscriptions found for " + entry.serverId);
    return;
  }

  try {
    if (readJSON(`servers/${entry.serverId}/server.json`).adminServer) {
      console.log("Skipping admin server " + entry.serverId);
      return;
    }
  } catch (e) {
    console.log("Error reading server.json for " + entry.serverId);
    console.log(e);
  }

  console.log("Checking server " + entry.serverId);
  let isActiveSubscription = false;
  let latestEndDate = 0;
  let latestStartDate = 0;
  for (const sub of entry.subscriptions) {
    if (sub.status == "active" || sub.status == "trialing") {
      isActiveSubscription = true;
      break;
    }
    if (sub.ended_at > latestEndDate) latestEndDate = sub.ended_at;
    if (sub.start_date > latestStartDate) latestStartDate = sub.start_date;
  }

  // If the latest start date was within the past 24 hours, treat it as active:
  // subscriptions.json may simply not have caught up yet.
  if (latestStartDate > Date.now() - 1000 * 60 * 60 * 24) {
    isActiveSubscription = true;
  }

  if (isActiveSubscription) {
    console.log("Server " + entry.serverId + " has an active subscription.");
    return;
  }

  console.log(
    "Stopping server " + entry.serverId + " due to no active subscriptions."
  );
  const f = require("./mc.js");
  f.stopAsync(entry.serverId, () => {
    console.log("Server " + entry.serverId + " stopped.");
  });

  const timeToTrash = Date.now() - latestEndDate > 1000 * 60 * 60 * 24 * 7;
  let newOwner = false;
  if (fs.existsSync(`servers/${entry.serverId}/server.json`)) {
    newOwner =
      readJSON(`servers/${entry.serverId}/server.json`).accountId !== entry.accountId;
  }
  console.log("New Owner? " + newOwner);
  console.log("Time to trash? " + timeToTrash);
  if (!timeToTrash || newOwner) return;

  console.log(
    "Checking Stripe subscriptions for " + entry.email +
    " before moving server " + entry.serverId
  );
  try {
    if (await hasActiveStripeSubscription(entry.email)) {
      console.log(
        "Found active subscription(s) for " + entry.email +
        ", skipping server " + entry.serverId
      );
      return;
    }
  } catch (e) {
    // Stripe unreachable — leave the server alone rather than binning it on
    // the strength of a failed call.
    console.log("Error checking Stripe subscriptions for " + entry.email);
    console.log(e);
    return;
  }

  console.log(
    "No active subscriptions found. Moving server " + entry.serverId + " to trashbin."
  );
  moveServerToTrashbin(entry);
}

async function checkSubscriptions() {
  try {
    const servers = fs.readdirSync("servers");
    //sort the folder alphanumerically for debugging purposes
    servers.sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );

    // Calculate all storage sizes in parallel
    const storageSizes = await Promise.all(
      servers.map((serverId) =>
        files.folderSizeRecursiveAsync("servers/" + serverId).catch((e) => {
          console.log("Error calculating storage for " + serverId + ":", e);
          return 0;
        })
      )
    );

    const data = resolveServerOwners(servers, storageSizes);

    // One Stripe round-trip per billing email rather than per server — linked
    // accounts and multi-server customers collapse into a single lookup.
    const byEmail = new Map();
    for (const entry of data) {
      if (!entry.email || byEmail.has(entry.email)) continue;
      console.log("Getting customer for " + entry.email);
      try {
        byEmail.set(entry.email, await fetchSubscriptionsForEmail(entry.email));
      } catch (e) {
        console.log("Error getting customer for " + entry.email);
        console.log(e);
        // null, not [] — an API failure must never read as "no subscriptions".
        byEmail.set(entry.email, null);
      }
    }
    for (const entry of data) {
      const subscriptions = byEmail.get(entry.email);
      if (subscriptions != null) entry.subscriptions = subscriptions;
    }

    fs.writeFileSync("logs/subscriptions.json", JSON.stringify(data, null, 2));
    console.log("Subscriptions checked and logged.");

    //stop any servers with no active subscriptions
    for (const entry of data) {
      await enforceSubscription(entry);
    }
    console.log("Subscription check complete.");
  } catch (e) {
    console.log("Error running subscription check:");
    console.log(e);
  }
}

const subdomainCleanup = require('./subdomainCleanup');

/**
 * Run periodic tasks including subscription checks and subdomain cleanup
 */
async function runPeriodicTasks() {
  console.log('Running periodic tasks...');

  try {
    // Awaited, so cleanup runs when the check has actually finished rather
    // than after a fixed delay that assumed how long it would take.
    await checkSubscriptions();

    // Run subdomain cleanup
    subdomainCleanup.cleanupInactiveSubdomains();
  } catch (error) {
    console.error('Error running periodic tasks:', error);
  } finally {
    // Schedule next run (every 24 hours)
    setTimeout(runPeriodicTasks, 1000 * 60 * 60 * 24);
  }
}

module.exports = { 
  getConfig, 
  readJSON, 
  writeJSON, 
  refreshPermissions, 
  hasAccess, 
  sanitizePath, 
  checkSubscriptions,
  runPeriodicTasks
};
