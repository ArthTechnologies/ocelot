const express = require("express");
const Router = express.Router();
const fs = require("fs");

Router.get("/", (req, res) => {
  let analytics = JSON.parse(fs.readFileSync("analytics.json"));
  res.send(analytics);
});

//disabled until new privacy policy goes into effect
Router.post("/", (req, res) => {
  //how many days since 1970
  let day = new Date().getTime() / 1000 / 60 / 60 / 24;
  day = parseInt(day.toString().split(".")[0]);

  let userAgent = req.body.userAgent;
  let analytics = JSON.parse(fs.readFileSync("analytics.json"));
  analytics.day = day;
  analytics.hits++;
  if (analytics.days[day] == undefined) {
    analytics.days[day] = 1;
  } else {
    analytics.days[day]++;
    if (analytics.days[day] > analytics.max) {
      analytics.max = analytics.days[day];
    }
  }
  //this makes sure google crawlers arent counted in analytics
  if (!userAgent.includes("google.com/")) {
  if (userAgent.includes("Android")) {
    analytics.devices.andriod++;
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
  }

  console.log("userAgent: " + req.body.userAgent);
  fs.writeFileSync("analytics.json", JSON.stringify(analytics));
  res.send({ msg: "ok" });
});

module.exports = Router;
