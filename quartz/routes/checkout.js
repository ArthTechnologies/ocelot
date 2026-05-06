const express = require("express");
const Router = express.Router();
let stripeKey = require("../scripts/utils.js").getConfig().stripeKey;
const stripe = require("stripe")(stripeKey);
const config = require("../scripts/utils.js").getConfig();

Router.post("/:priceId", async (req, res) => {
  try {
    let uiMode = req.query.ui_mode || "embedded";
    let priceId = req.params.priceId;
    let quantity = req.query.quantity || 1;
    let customer_email = req.query.customer_email || null;
    if (customer_email == "") customer_email = null;
    let currency = req.query.currency || "usd";
    if (currency == "") currency = "usd";
    let locale = req.query.locale || "en";
    if (locale == "") locale = "en";
    let promoCode = req.query.promo_code || null;
    if (promoCode == "") promoCode = null;
    if (quantity == undefined) {
      quantity = 1;
    }

    console.log("Customer Email: " + customer_email);

    // If a promo code was provided, look up its Stripe promotion_code ID.
    // Falls back to the manual-entry box if no code given or no active match.
    let promoId = null;
    if (promoCode) {
      try {
        const lookup = await stripe.promotionCodes.list({
          code: promoCode,
          active: true,
          limit: 1,
        });
        if (lookup.data.length > 0) promoId = lookup.data[0].id;
        else console.log("No active promotion code found for: " + promoCode);
      } catch (e) {
        console.log("Promotion code lookup failed: " + e.message);
      }
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: uiMode,
      ...(customer_email && { customer_email: customer_email }), // This line will only add the customer_email field if it's not null
      currency: currency,
      locale: locale,
      ...(promoId
        ? { discounts: [{ promotion_code: promoId }] }
        : { allow_promotion_codes: true }),
      line_items: [
        {
          // Provide the exact Price ID (for example, pr_1234) of the product you want to sell
          price: priceId,
          quantity: quantity,
        },
      ],
      mode: "subscription",
...(uiMode === "embedded" && { return_url: config.stripeReturnUrl }),
...(uiMode === "hosted" && { success_url: config.stripeReturnUrl, cancel_url: "https://servers.arthmc.xyz/signup/plans" }),
      automatic_tax: { enabled: true },
    });

    res.send({ clientSecret: session.client_secret, url: session.url });
  } catch (err) {
    console.log(err);
    res.status(500).send({ error: err });
  }
});

module.exports = Router;
