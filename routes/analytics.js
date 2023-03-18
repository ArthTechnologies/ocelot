

const express = require("express");
const Router = express.Router();
const fs = require("fs");

Router.get("/", (req, res) => {
    let analytics = JSON.parse(fs.readFileSync("analytics.json"));
    res.send(analytics);
});

Router.post("/", (req, res) => {

    let platform = req.body.platform;
    let analytics = JSON.parse(fs.readFileSync("analytics.json"));
    analytics.hits++;
    let device;
console.log(platform)
    if(platform.includes("Linux")){

        analytics.devices.linux++;
    } else if (platform.includes("Windows")){

        analytics.devices.windows++;
    } else if (platform.includes("Macintosh")){

        analytics.devices.macintosh++;
    } else if (platform.includes("Android")){

        analytics.devices.android++;
    } else if (platform.includes("iP")){

        analytics.devices.iOS++;
    } 

 
    fs.writeFileSync("analytics.json", JSON.stringify(analytics));
    res.send({"msg":"ok"});
});

module.exports = Router;
