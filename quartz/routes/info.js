const express = require("express");
const router = express.Router();
const fs = require("fs");
let email = "";

const f = require("../scripts/mc.js");
const files = require("../scripts/files.js");
const config = require("../scripts/utils.js").getConfig();
const readJSON = require("../scripts/utils.js").readJSON;
const writeJSON = require("../scripts/utils.js").writeJSON;
const mode = config.mode;
const stripeKey = config.stripeKey;
const stripe = require("stripe")(stripeKey);
const security = require("../scripts/security.js");

router.get(`/servers`, function (req, res) {
  email = req.headers.username;
  token = req.headers.token;

  if (mode === "solo") email = "noemail";
  //prevents a crash that has occurred
  if (email != undefined) {
    account = readJSON(`accounts/${email}.json`);
    console.log(account);
    console.log("../accounts/" + email + ".json");
  }
  console.log(token + " " + account.token);
  if (token === account.token || mode === "solo") {
    //if req.body.email is "noemail" return 404
    if (req.query.username == ("noemail" | "undefined")) {
      //res.status(404).json({ msg: `Invalid email.` });
    }

    if (mode === "solo") {

      let serverFolder = fs.readdirSync("servers");
      //if length is 0, create a server folder
      if (serverFolder.length == 0) {
        fs.mkdirSync("servers/"+config.idOffset, { recursive: true });
        serverFolder = fs.readdirSync("servers");
      }
      for (let i = 0; i < serverFolder.length; i++) {
        //only add if theres no server.json file in the folder 
        if (
          !fs.existsSync(`servers/${serverFolder[i]}/server.json`) &&
          !account.servers.includes(serverFolder[i])
        ) {
          //if the server is not in the account.servers array, add it
          account.servers.push(serverFolder[i]);
        }
      }

      //write to account file
      writeJSON(`accounts/noemail.json`, account);
    }


    const actualAccountId = account.accountId;

    for (let i in account.servers) {
                const serverId = account.servers[i];


  


      let serverObject = { id: serverId };

      let hasValidSubscription = true;
      let parsedSuccesfully = false;
      let resetDate = -1;
      let subscriptionCause = "unknown";

      if (mode === "provider") {
        hasValidSubscription = false;
        let subscriptionsJson = readJSON(`logs/subscriptions.json`);
        let latestStartDate = 0;

        try {
          for (let sub of subscriptionsJson) {
            if (sub.owner == req.headers.username + ".json" && sub.subscriptions != undefined) {
              parsedSuccesfully = true;

              for (let item of sub.subscriptions) {
                if (item.start_date > latestStartDate) {
                  latestStartDate = item.start_date;
                }
                if (item.status == "active" || item.status == "trialing") {
                  hasValidSubscription = true;
                } else {
                  resetDate = parseInt(item.current_period_end) + 604800;
                  if (item.status === "past_due" || item.status === "unpaid") {
                    subscriptionCause = "payment_failed";
                  } else if (item.status === "canceled") {
                    subscriptionCause = "canceled";
                  } else {
                    subscriptionCause = item.status || "unknown";
                  }
                }
              }
            }
          }
        } catch (e) {
          console.log("Error parsing subscriptions.json: " + e);
        }

        console.log("hasValidSubscription: " + hasValidSubscription);
        if (latestStartDate > 0 && latestStartDate > Date.now() - 86400000) {
          hasValidSubscription = true;
        }
      }

      if (fs.existsSync(`servers/${serverId}/server.json`)) {
        let serverData = readJSON(`servers/${serverId}/server.json`);

        if (serverId.includes(":freed")) {
          serverObject.isStandard = false;
          serverObject.error = {
            code: 100,
            resetDate: -1,
            subscriptionCause: "freed"
          };
          account.servers[i] = serverObject;
          continue;
        }

        if (serverData.accountId && serverData.accountId !== actualAccountId) {
          serverObject.isStandard = false;
          serverObject.error = {
            code: 102
          };
          account.servers[i] = serverObject;
          continue;
        }

        if (!hasValidSubscription && parsedSuccesfully) {
          serverObject.isStandard = false;
          serverObject.error = {
            code: 100,
            resetDate: resetDate,
            subscriptionCause: subscriptionCause
          };
          account.servers[i] = serverObject;
          continue;
        }

        account.servers[i] = serverData;
        account.servers[i].state = f.getState(account.servers[i].id);
        try {
          account.servers[i].fileAccessKey = security.getFileAccessKey(account.servers[i].id);
        } catch (e) {
          console.log("Error getting file access key for server " + account.servers[i].id + ": " + e);
          account.servers[i].fileAccessKey = "error";
        }
        account.servers[i].isStandard = true;
      } else {
        serverObject.isStandard = false;
        serverObject.error = {
          code: 101
        };
        account.servers[i] = serverObject;
      }
    }
    res.status(200).json(account.servers);
  } else {
    res.status(401).json({ msg: `Invalid credentials.` });
  }
});

router.get(`/billing`, function (req, res) {
  let email = req.headers.username;
  let token = req.headers.token;
  let account = readJSON(`accounts/${email}.json`);
  if (mode === "solo") email = "noemail";
  if (token === account.token || mode === "solo") {
    let subscriptionsArray = [];
    stripe.customers.list(
      {
        limit: 5,
        email: account.email,
      },
      function (err, customers) {
        if (err) {
          console.log("err", err);
        } else {
          if (customers.data.length == 0) {
            res.status(200).json({subscriptions: [], servers: []});
            return;
          }

          let subscriptionsCount = 0;
          let completedCustomers = 0;

          // Iterate through all customers (up to 5) and fetch their subscriptions
          customers.data.forEach((customer) => {
            stripe.subscriptions.list(
              {
                customer: customer.id,
                limit: 100,
                status: 'all',
              },
              function (err, subscriptions2) {
                completedCustomers++;

                if (!err && subscriptions2 && subscriptions2.data) {
                  for (let i in subscriptions2.data) {
                    let plan = subscriptions2.data[i].items.data[0].plan;
                    try {
                      let name = "basic";
                      if (config.plus == plan.product) name = "plus";
                      if (config.premium == plan.product) name = "premium";
                      subscriptionsArray.push({
                        id: subscriptions2.data[i].id,
                        name: name,
                        status: subscriptions2.data[i].status,
                        price: plan.amount / 100,
                        interval: plan.interval,
                        currency: plan.currency,
                        created: subscriptions2.data[i].created,
                        canceled_at: subscriptions2.data[i].canceled_at,
                        trial_end: subscriptions2.data[i].trial_end,
                      });

                    } catch {

                    }
                  }
                }

                // Once all customers have been processed, return the response
                if (completedCustomers === customers.data.length) {
                  let serversArray = [];
                  for (let i in account.servers) {
                    const serverId = account.servers[i];
                    if (fs.existsSync(`servers/${serverId}/server.json`)) {
                      let serverData = readJSON(`servers/${serverId}/server.json`);
                      let planName = "basic";
                      if (serverData.productID == config.plus) planName = "plus";
                      if (serverData.productID == config.premium) planName = "premium";
                      serversArray.push({
                        id: serverId,
                        software: serverData.software || "Unknown",
                        version: serverData.version || "Unknown",
                        plan: planName
                      });
                    } else {
                      serversArray.push({
                        id: serverId,
                        software: "Unknown",
                        version: "Unknown",
                        plan: "not created yet"
                      });
                    }
                  }
                  res.status(200).json({
                    subscriptions: subscriptionsArray,
                    servers: serversArray,
                  });
                }
              }
            );
          });
        }
      }
    );
  } else {
    res.status(401).json({ msg: `Invalid credentials.` });
  }
});

router.get(`/billing/invoiceHistory`, function (req, res) {
  let email = req.headers.username;
  let token = req.headers.token;
  let account = readJSON(`accounts/${email}.json`);
  if (mode === "solo") email = "noemail";
  if (token === account.token || mode === "solo") {
    let subscriptionId = req.query.subscriptionId;
    if (!subscriptionId) {
      return res.status(400).json({ msg: "subscriptionId required" });
    }

    stripe.invoices.list(
      {
        subscription: subscriptionId,
        limit: 5,
      },
      function (err, invoices) {
        if (err) {
          console.log("Error fetching invoices:", err);
          return res.status(500).json({ msg: "Failed to fetch invoice history" });
        }

        let invoicesData = [];
        if (invoices && invoices.data) {
          for (let invoice of invoices.data) {
            invoicesData.push({
              id: invoice.id,
              amount_paid: invoice.amount_paid / 100,
              currency: invoice.currency,
              status: invoice.status,
              paid_at: invoice.paid_at,
              created: invoice.created,
              payment_intent: invoice.payment_intent,
              attempt_count: invoice.attempt_count,
            });
          }
        }

        res.status(200).json({ invoices: invoicesData });
      }
    );
  } else {
    res.status(401).json({ msg: `Invalid credentials.` });
  }
});

router.get(`/billing/paymentIntentReason`, function (req, res) {
  let email = req.headers.username;
  let token = req.headers.token;
  let account = readJSON(`accounts/${email}.json`);
  if (mode === "solo") email = "noemail";
  if (token === account.token || mode === "solo") {
    let paymentIntentId = req.query.paymentIntentId;
    if (!paymentIntentId) {
      return res.status(400).json({ msg: "paymentIntentId required" });
    }

    stripe.paymentIntents.retrieve(paymentIntentId, function (err, paymentIntent) {
      if (err) {
        console.log("Error fetching payment intent:", err);
        return res.status(500).json({ msg: "Failed to fetch payment intent" });
      }

      let reason = null;
      if (paymentIntent.last_payment_error) {
        reason = paymentIntent.last_payment_error.message;
      } else if (paymentIntent.cancellation_reason) {
        reason = paymentIntent.cancellation_reason;
      }

      res.status(200).json({ reason: reason });
    });
  } else {
    res.status(401).json({ msg: `Invalid credentials.` });
  }
});

// ---- Billing actions: plan changes, upcoming invoice, cancellation ----

// Hardcoded Stripe price IDs per plan/interval (matches the checkout links)
const planPrices = {
  basic: {
    monthly: "price_1R2FxgJYPXquzaSzQyzJBmsx",
    quarterly: "price_1RqfTEJYPXquzaSzw5syXRoh",
  },
  plus: {
    monthly: "price_1R2G3zJYPXquzaSzRRkaQC4J",
    quarterly: "price_1RqfVEJYPXquzaSzUvlz5wcL",
  },
  premium: {
    monthly: "price_1RrQfbJYPXquzaSzycdO5k05",
    quarterly: "price_1RqfUeJYPXquzaSzRvqDjfVQ",
  },
};

// Retrieves the subscription and confirms it belongs to this account's
// Stripe customer, so users can't act on other people's subscriptions.
async function findOwnedSubscription(account, subscriptionId) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customer = await stripe.customers.retrieve(subscription.customer);
  if (customer.deleted || customer.email !== account.email) return null;
  return subscription;
}

router.get(`/billing/upcomingInvoice`, async function (req, res) {
  let email = req.headers.username;
  let token = req.headers.token;
  if (mode === "solo") email = "noemail";
  let account = readJSON(`accounts/${email}.json`);
  if (token !== account.token && mode !== "solo") {
    return res.status(401).json({ msg: `Invalid credentials.` });
  }

  const subscriptionId = req.query.subscriptionId;
  if (!subscriptionId) {
    return res.status(400).json({ msg: "subscriptionId required" });
  }

  try {
    const subscription = await findOwnedSubscription(account, subscriptionId);
    if (!subscription) {
      return res.status(403).json({ msg: "Subscription does not belong to this account." });
    }

    const upcoming = await stripe.invoices.retrieveUpcoming({
      subscription: subscriptionId,
    });
    res.status(200).json({
      invoice: {
        amount_due: upcoming.amount_due / 100,
        currency: upcoming.currency,
        date: upcoming.next_payment_attempt || upcoming.period_end,
      },
    });
  } catch (err) {
    // Stripe returns this when the subscription won't renew (canceled/ending)
    if (err.code === "invoice_upcoming_none") {
      return res.status(200).json({ invoice: null });
    }
    console.log("Error fetching upcoming invoice:", err);
    res.status(500).json({ msg: "Failed to fetch upcoming invoice" });
  }
});

router.post(`/billing/changePlan`, async function (req, res) {
  let email = req.headers.username;
  let token = req.headers.token;
  if (mode === "solo") email = "noemail";
  let account = readJSON(`accounts/${email}.json`);
  if (token !== account.token && mode !== "solo") {
    return res.status(401).json({ msg: `Invalid credentials.` });
  }

  const { subscriptionId, newPlan } = req.body || {};
  if (!subscriptionId || !planPrices[newPlan]) {
    return res.status(400).json({ msg: "subscriptionId and a valid newPlan (basic/plus/premium) required" });
  }

  try {
    const subscription = await findOwnedSubscription(account, subscriptionId);
    if (!subscription) {
      return res.status(403).json({ msg: "Subscription does not belong to this account." });
    }
    if (subscription.status !== "active" && subscription.status !== "trialing" && subscription.status !== "past_due") {
      return res.status(400).json({ msg: "Only active subscriptions can change plans." });
    }

    const item = subscription.items.data[0];
    // Quarterly prices bill every 3 months; keep the same interval on the new plan
    const interval = item.plan.interval_count === 3 ? "quarterly" : "monthly";
    const newPriceId = planPrices[newPlan][interval];

    if (item.price.id === newPriceId) {
      return res.status(400).json({ msg: "Subscription is already on that plan." });
    }

    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: item.id, price: newPriceId }],
      proration_behavior: "create_prorations",
    });

    res.status(200).json({ success: true, status: updated.status, plan: newPlan });
  } catch (err) {
    console.log("Error changing plan:", err);
    res.status(500).json({ msg: "Failed to change plan" });
  }
});

router.post(`/billing/cancel`, async function (req, res) {
  let email = req.headers.username;
  let token = req.headers.token;
  if (mode === "solo") email = "noemail";
  let account = readJSON(`accounts/${email}.json`);
  if (token !== account.token && mode !== "solo") {
    return res.status(401).json({ msg: `Invalid credentials.` });
  }

  const { subscriptionId } = req.body || {};
  if (!subscriptionId) {
    return res.status(400).json({ msg: "subscriptionId required" });
  }

  try {
    const subscription = await findOwnedSubscription(account, subscriptionId);
    if (!subscription) {
      return res.status(403).json({ msg: "Subscription does not belong to this account." });
    }
    if (subscription.status === "canceled") {
      return res.status(400).json({ msg: "Subscription is already canceled." });
    }

    const canceled = await stripe.subscriptions.cancel(subscriptionId);
    res.status(200).json({ status: canceled.status });
  } catch (err) {
    console.log("Error canceling subscription:", err);
    res.status(500).json({ msg: "Failed to cancel subscription" });
  }
});

router.get(`/`, function (req, res) {
  //add cors header
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  let returnObject = {};
  //add every non-secret from config and everything from data.json to returnObject
  returnObject["address"] = config.address;
  returnObject["mode"] = config.mode;
  returnObject["maxServers"] = config.maxServers;
  returnObject["serverStorageLimit"] = config.serverStorageLimit;
  returnObject["enableVirusScan"] = config.enableVirusScan;
  returnObject["enableCloudflareVerify"] = config.enableCloudflareVerify;
  returnObject["cloudflareVerifySiteKey"] = config.cloudflareVerifySiteKey;
  returnObject["enableDeepL"] =
    config.deeplKey != "" && config.deeplKey != null;
  returnObject["enableFreeTrial"] = config.enableFreeTrial === "true";
  for (var key in readJSON("assets/data.json")) {
    returnObject[key] = readJSON("assets/data.json")[key];
  }

  // Add adminAccess if user is authenticated
  returnObject["adminAccess"] = false;
  if (mode === "solo") {
    returnObject["adminAccess"] = true;
  } else if (req.headers.username && req.headers.token) {
    try {
      const account = readJSON(`accounts/${req.headers.username}.json`);
      if (req.headers.token === account.token && account.adminAccess === true) {
        returnObject["adminAccess"] = true;
      }
    } catch (err) {
      // Account not found or error reading, adminAccess stays false
    }
  }

  res.json(returnObject);
});

router.get(`/worldgenMods`, function (req, res) {
  //for each file in worldgen, if it has req.query.version, add filename.split("-")[0] to the returj array
  let wmods = ["terralith", "incendium", "nullscape", "structory"];
  let returnArray = [];
  wmods.forEach((file) => {
    console.log(file);
    if (fs.existsSync(`assets/jars/${file}-${req.query.version}.zip`)) {
      returnArray.push(file.split("-")[0]);
    }
  });

  res.status(200).json(returnArray);
});

function normalizeJarName(filename) {
  // Match: software-version.ext or software-version-variant.ext or software-version*variant.ext
  // Convert to: software-version-variant.ext (always with variant, default to release)
  const match = filename.match(/^([a-zA-Z]+)-(\d+(?:\.\d+)*)(?:[-*](\w+))?(\.\w+)$/);
  if (match) {
    const software = match[1];
    const version = match[2];
    const variant = match[3] || 'release'; // Default to 'release' if no variant
    const ext = match[4];
    return `${software}-${version}-${variant}${ext}`;
  }
  return filename;
}

router.get(`/jars`, function (req, res) {
  let returnArray = [];
  fs.readdirSync("assets/jars").forEach((file) => {
    if (file.includes(".jar") || file.includes(".zip")) {
      returnArray.push(normalizeJarName(file));
    }
  });
  //sort
  returnArray = sortFiles(returnArray);
  //reverse
  returnArray.reverse();
  res.status(200).json(returnArray);
});

function sortFiles(files) {
  return files.sort((a, b) => {
      const regex = /([a-zA-Z]+)-(\d+)(?:\.(\d+))?(?:\.(\d+))?-(\w+)\.jar|\.zip/;
      const matchA = a.match(regex);
      const matchB = b.match(regex);

      const nameA = matchA ? matchA[1] : a;
      const versionA = matchA ? [parseInt(matchA[2]), matchA[3] ? parseInt(matchA[3]) : 0, matchA[4] ? parseInt(matchA[4]) : 0] : [0, 0, 0];
      const variantA = matchA ? matchA[5] || '' : '';

      const nameB = matchB ? matchB[1] : b;
      const versionB = matchB ? [parseInt(matchB[2]), matchB[3] ? parseInt(matchB[3]) : 0, matchB[4] ? parseInt(matchB[4]) : 0] : [0, 0, 0];
      const variantB = matchB ? matchB[5] || '' : '';

      if (nameA !== nameB && nameA != undefined && nameB != undefined) return nameA.localeCompare(nameB);
      for (let i = 0; i < 3; i++) {
          if (versionA[i] !== versionB[i]) return versionA[i] - versionB[i];
      }
      return variantA.localeCompare(variantB);
  });
}



router.get(`/jarsIndex`, function (req, res) {
  files.getIndex((index) => {
    index.otherSoftwares = [
      index.terralith,
      index.incendium,
      index.nullscape,
      index.structory,
      index.geyser,
      index.floodgate,
    ];

    index.terralith = null;
    index.incendium = null;
    index.nullscape = null;
    index.structory = null;
    index.geyser = null;
    index.floodgate = null;
    res.status(200).json(index);
  });
});

router.get(`/capacity`, function (req, res) {
  let maxServers = parseInt(config.maxServers);
  let numServers = 0;
  let folders = [];
  fs.readdirSync("servers").forEach((file) => {
    if (fs.existsSync(`servers/${file}/server.json`)) {
      try {
        if (!readJSON(`servers/${file}/server.json`).adminServer) {
          numServers++;
          folders.push(file + ":normal");
        } else {
          folders.push(file + ":admin");
        }
      } catch (e) {
        console.log(e);
        folders.push(file + ":error");
      }
    } else {
      let foundOwner = false;
      try {
        for (let i in fs.readdirSync(`accounts`)) {
          if (
            !fs.readdirSync(`accounts`)[i].includes("swp") &&
            readJSON(
              `accounts/${fs.readdirSync(`accounts`)[i]}`
            ).servers.includes(file)
          ) {
            folders.push(file + ":normal");
            foundOwner = true;
            break;
          }
        }
      } catch (e) {}
      if (!foundOwner) {
        folders.push(file + ":error");
      }
      numServers++;
    }
  });
  console.log("numServers:" + numServers);
  res.status(200).json({
    atCapacity: numServers >= maxServers,
    numServers: numServers,
    maxServers: maxServers,
    folders: folders,
  });
});

router.get(`/accounts`, function (req, res) {
  let forwardingPinReq = req.query.forwardingPin;
  let forwardingPinConfig = config.forwardingPin;
  if (forwardingPinReq == forwardingPinConfig) {
    let accounts =[];
    let accountsTsv = fs.readFileSync("accounts.tsv", "utf8");
    for (let line of accountsTsv.split("\n")) {
      let username = line.split("\t")[1];
      let servers = line.split("\t")[3];
      accounts.push(username + ":" + servers);
    }
    res.status(200).send(accounts);
  } else {
    res.status(401).send(undefined);
  }
});

const { exec } = require("child_process");
const { parse } = require("path");

function getThreadUsage() {
    return new Promise((resolve, reject) => {
        exec("grep 'cpu[0-9]' /proc/stat", (err, firstSample) => {
            if (err) return reject(err);

            setTimeout(() => {
                exec("grep 'cpu[0-9]' /proc/stat", (err, secondSample) => {
                    if (err) return reject(err);

                    const threads = [];
                    const firstLines = firstSample.trim().split("\n");
                    const secondLines = secondSample.trim().split("\n");

                    for (let i = 0; i < firstLines.length; i++) {
                        const firstParts = firstLines[i].split(/\s+/);
                        const secondParts = secondLines[i].split(/\s+/);

                        const id = firstParts[0]; // "cpu0", "cpu1", ...

                        const firstTotal = firstParts.slice(1, 8).reduce((sum, val) => sum + parseInt(val), 0);
                        const firstIdle = parseInt(firstParts[4]);

                        const secondTotal = secondParts.slice(1, 8).reduce((sum, val) => sum + parseInt(val), 0);
                        const secondIdle = parseInt(secondParts[4]);

                        const totalDiff = secondTotal - firstTotal;
                        const idleDiff = secondIdle - firstIdle;
                        const usage = totalDiff > 0 ? ((totalDiff - idleDiff) / totalDiff) * 100 : 0;

                        threads.push({ id, cpuUsage: usage.toFixed(2) });
                    }

                    resolve(threads);
                });
            }, 500); // 500ms delay between samples
        });
    });
}



// Function to get memory usage
function getMemoryUsage() {
  return new Promise((resolve, reject) => {
      exec("free -m", (err, stdout) => {
          if (err) return reject(err);
          const lines = stdout.trim().split("\n");
          const memValues = lines[1].split(/\s+/);
          const memory = {
              used: parseInt(memValues[2]),
              buffers: parseInt(memValues[5]),
              cached: parseInt(memValues[6]),
              total: parseInt(memValues[1])
          };
          resolve(memory);
      });
  });
}

// Function to get CPU usage
function getCpuUsage() {  
  return new Promise((resolve, reject) => {
      exec(`top -bn1 | grep "Cpu(s)" | awk '{print 100 - $8 "%"}'`, (err, stdout) => {
          if (err) return reject(err);
          const cpu = parseFloat(stdout);
          resolve(cpu); 
      });
  });
}

function getCpuName() {
  return new Promise((resolve, reject) => {
      exec(`cat /proc/cpuinfo | grep "model name" | uniq | sed 's/.*: //'`, (err, stdout) => {
          if (err) return reject(err);
          const cpu = stdout.trim();
          resolve(cpu); 
      }
      );
  });
}

let snapshotHistory = []; // Store past 60 minutes of snapshots
let lastSnapshotTime = 0;

// Function to capture a new snapshot
async function captureSnapshot() {
    try {
        const [threads, memory, cpuUsage, cpuName] = await Promise.all([
            getThreadUsage(),
            getMemoryUsage(),
            getCpuUsage(),
            getCpuName()
        ]);

        let serversOnThreads = f.getServersOnThreads();
        
        const newSnapshot = { timestamp: Date.now(), threads, memory, cpuUsage, cpuName, serversOnThreads };
        snapshotHistory.push(newSnapshot);
        
        // Keep only the past 60 minutes of data
        const hourAgo = Date.now() - 3600000;
        snapshotHistory = snapshotHistory.filter(snapshot => snapshot.timestamp > hourAgo);
        
        lastSnapshotTime = Date.now();
    } catch (error) {
        console.error("Error fetching snapshot info:", error);
    }
}

captureSnapshot();
// Automatically refresh every 60 seconds
setInterval(captureSnapshot, 60000);

// Route to get thread and memory snapshot
router.get("/snapshot", (req, res) => {
    res.json(snapshotHistory);
});

router.post(`/updatePlans`, function (req, res) {
  if (mode !== "provider") return res.status(400).json({ msg: "Not in provider mode." });
  let email = req.headers.username;
  let token = req.headers.token;
  let account = readJSON(`accounts/${email}.json`);
  if (!account || token !== account.token) return res.status(401).json({ msg: "Invalid credentials." });

  // req.body should contain { planAssignments: { serverId: planName, serverId: planName, ... } }
  let planAssignments = req.body.planAssignments || {};
  let updated = [];
  let errors = [];

  for (let serverId in planAssignments) {
    let serverPath = `servers/${serverId}/server.json`;
    if (!fs.existsSync(serverPath)) {
      errors.push(`Server ${serverId} not found`);
      continue;
    }

    let planName = planAssignments[serverId];
    // Convert plan name to product ID
    let productId = config.basic; // default
    if (planName === "plus") productId = config.plus;
    if (planName === "premium") productId = config.premium;

    let server = readJSON(serverPath);
    server.productID = productId;
    try {
      writeJSON(serverPath, server);
      updated.push(serverId);
    } catch (e) {
      errors.push(`Failed to update server ${serverId}: ${e}`);
    }
  }

  res.status(200).json({
    updated: updated,
    errors: errors,
    message: "Server restart required to apply changes"
  });
});

module.exports = router;
module.exports.snapshotHistory = () => snapshotHistory;
