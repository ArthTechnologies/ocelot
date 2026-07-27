const express = require("express");
const router = express.Router();
const fs = require("fs");
const utils = require("../scripts/utils.js");
const readJSON = utils.readJSON;
const config = utils.getConfig();
const stripe = require("stripe")(config.stripeKey);

// Routes under here are for local automation/agent use only (e.g. Claude Code
// running on the same host). They are never exposed to the internet — the
// panel's own frontend and mobile clients must NOT call these.
function localOnly(req, res, next) {
  const ip = req.socket.remoteAddress || req.ip || "";
  const isLoopback =
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1";

  if (!isLoopback) {
    return res.status(403).json({ error: "This route is only accessible from localhost" });
  }

  next();
}

router.use(localOnly);

// Find the account JSON (and its filename/accountId) matching an email or accountId.
function findAccount({ email, accountId }) {
  if (!fs.existsSync("accounts")) return null;

  const bareEmail = email ? email.toLowerCase() : null;
  const files = fs.readdirSync("accounts").filter((f) => f.endsWith(".json"));

  for (const file of files) {
    let data;
    try {
      data = readJSON(`accounts/${file}`);
    } catch (err) {
      continue;
    }

    if (accountId && data.accountId === accountId) {
      return { file, data };
    }

    if (bareEmail && data.email && data.email.toLowerCase() === bareEmail) {
      return { file, data };
    }
  }

  return null;
}

// GET /agent/stripe/subscriptions?email=... or ?accountId=... or ?customerId=...
// Read-only lookup of a customer's Stripe subscriptions.
router.get("/stripe/subscriptions", async (req, res) => {
  try {
    const { email, accountId, customerId } = req.query;

    if (!email && !accountId && !customerId) {
      return res.status(400).json({ error: "Provide one of: email, accountId, customerId" });
    }

    let stripeCustomerId = customerId || null;
    let account = null;

    if (!stripeCustomerId) {
      const found = findAccount({ email, accountId });
      if (!found) {
        return res.status(404).json({ error: "No matching account found" });
      }
      account = found;
      stripeCustomerId = found.data.stripeCustomerId || null;
    }

    if (!stripeCustomerId && email) {
      const customers = await stripe.customers.list({ email, limit: 1 });
      if (customers.data.length > 0) stripeCustomerId = customers.data[0].id;
    }

    if (!stripeCustomerId) {
      return res.status(404).json({ error: "No Stripe customer found for this account" });
    }

    const customer = await stripe.customers.retrieve(stripeCustomerId);
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: "all",
      limit: 100,
    });

    const subs = subscriptions.data.map((sub) => ({
      id: sub.id,
      status: sub.status,
      created: sub.created,
      currentPeriodStart: sub.current_period_start,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      cancelAt: sub.cancel_at,
      canceledAt: sub.canceled_at,
      endedAt: sub.ended_at,
      cancellationReason:
        sub.cancellation_details?.comment || sub.cancellation_details?.feedback || null,
      items: sub.items.data.map((item) => ({
        priceId: item.price?.id || null,
        productId: item.price?.product || null,
        quantity: item.quantity,
        interval: item.price?.recurring?.interval || null,
        intervalCount: item.price?.recurring?.interval_count || null,
        unitAmount: item.price?.unit_amount ?? null,
        currency: item.price?.currency || null,
      })),
    }));

    res.json({
      customerId: stripeCustomerId,
      customerEmail: customer.deleted ? null : customer.email,
      accountId: account ? account.data.accountId || null : null,
      account: account ? account.file.replace(/\.json$/, "") : null,
      subscriptions: subs,
    });
  } catch (err) {
    console.error("Error in /agent/stripe/subscriptions:", err);
    res.status(500).json({ error: "Failed to fetch subscriptions" });
  }
});

module.exports = router;
