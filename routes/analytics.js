const express = require("express");
const Router = express.Router();
const fs = require("fs");

Router.get("/", (req, res) => {
  let analytics = JSON.parse(fs.readFileSync("analytics.json"));
  res.send(analytics);
});

//disabled until new privacy policy goes into effect
Router.post("/", (req, res) => {

  //this makes sure google crawlers arent counted in analytics
  if (!userAgent.includes("google.com/")) {
      //how many days since 1970
  let day = new Date().getTime() / 1000 / 60 / 60 / 24;
  day = parseInt(day.toString().split(".")[0]);

  let userAgent = req.body.userAgent;
  let analytics = JSON.parse(fs.readFileSync("analytics.json"));
  analytics.day = day;

  if (analytics.days[day] == undefined) {
    analytics.days[day] = 1;
  } else {
    analytics.days[day]++;
    if (analytics.days[day] > analytics.max) {
      analytics.max = analytics.days[day];
    }
  }
    analytics.hits++;
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

    if (req.body.locale.includes("en") || req.body.locale.includes("EN")) {
      analytics.languages.english++;
    } else if (
      req.body.locale.includes("es") ||
      req.body.locale.includes("ES")
    ) {
      analytics.languages.spanish++;
    } else {
      analytics.languages.unknown++;
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
      fs.writeFileSync("analytics.json", JSON.stringify(analytics));
  }


  res.send({ msg: "ok" });
});

Router.post("/getStartedButtonClicked", (req, res) => {
  let analytics = JSON.parse(fs.readFileSync("analytics.json"));
  analytics.getStartedButtonClicks++;
  fs.writeFileSync("analytics.json", JSON.stringify(analytics));
  res.send({ msg: "ok" });
});

module.exports = Router;
