const express = require("express");
const Router = express.Router();
const fs = require("fs");
const { readJSON, writeJSON } = require("../scripts/utils");

Router.get("/", (req, res) => {
  let analytics = readJSON("analytics.json");
  res.send(analytics);
});

//disabled until new privacy policy goes into effect
Router.post("/", (req, res) => {
  let userAgent = req.body.userAgent;
  //this makes sure google crawlers arent counted in analytics
  if (!userAgent.includes("google.com/") && !userAgent.includes("bot")) {
    //how many days since 1970
    let day = new Date().getTime() / 1000 / 60 / 60 / 24;
    day = parseInt(day.toString().split(".")[0]);

    let analytics = readJSON("analytics.json");
    analytics.day = day;

    if (analytics.days[day] == undefined) {
      analytics.days[day].hits = 1;
      analytics.days[day].redirects = 0;
    } else {
      analytics.days[day].hits = parseInt(analytics.days[day].hits) + 1;
      if (analytics.days[day].hits > analytics.max) {
        analytics.max = analytics.days[day].hits;
      }
    }
    analytics.hits++;
    console.log("test");
    if (req.body.returning) {
      analytics.returning++;
    } else {
      analytics.initial++;
    }
    if (userAgent.includes("Android")) {
      analytics.devices.android++;
    } else if (userAgent.includes("Win")) {
      analytics.devices.windows++;
    } else if (userAgent.includes("Linux")) {
      analytics.devices.linux++;
    } else if (userAgent.includes("iPad") || userAgent.includes("iPhone")) {
      analytics.devices.iOS++;
    } else if (userAgent.includes("Mac")) {
      analytics.devices.macintosh++;
    } else {
      analytics.devices.unknown++;
    }

    if (!req.body.returning) {
      //Locale (Language + Dialect)
      let locale = req.body.locale.split("-")[0];
      if (analytics.languages[locale] == undefined) {
        console.log("[!] Adding locale: " + locale);
        analytics.languages[locale] = 1;
      } else {
        analytics.languages[locale]++;
      }

      //Referrer
      if (req.body.referrer != "" && req.body.referrer.split(".").length > 1) {
        let referrer =
          req.body.referrer.split(".")[req.body.referrer.split(".").length - 2];
        if (referrer.includes("https://")) {
          referrer = referrer.split("https://")[1];
        } else if (referrer.includes("http://")) {
          referrer = referrer.split("http://")[1];
        }

        if (analytics.referrers[referrer] == undefined) {
          console.log("[!] Adding referrer: " + referrer);
          analytics.referrers[referrer] = 1;
        } else {
          analytics.referrers[referrer]++;
        }
      }

      //Page
      let page = req.body.url;
      if (analytics.pages[page] == undefined) {
        console.log("[!] Adding page: " + page);
        analytics.pages[page] = 1;
      } else {
        analytics.pages[page]++;
      }
    }

    console.log("userAgent: " + req.body.userAgent);
    console.log(
      "language: " +
        req.body.locale +
        " & time: " +
        new Date().toString() +
        " returning " +
        req.body.returning
    );

    writeJSON("analytics.json", JSON.stringify(analytics));
  }

  res.send({ msg: "ok" });
});

Router.post("/getStartedButtonClicked", (req, res) => {
  let analytics = readJSON("analytics.json");
  let day = new Date().getTime() / 1000 / 60 / 60 / 24;
  day = parseInt(day.toString().split(".")[0]);
  analytics.days[day].redirects++;
  writeJSON("analytics.json", JSON.stringify(analytics));
  res.send({ msg: "ok" });
});

module.exports = Router;
