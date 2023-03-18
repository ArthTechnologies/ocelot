

const express = require("express");
const Router = express.Router();
const fs = require("fs");


Router.post("/", (req, res) => {

    let platform = req.body.platform;
    let analytics = JSON.parse(fs.readFileSync("analytics.json"));
    analytics.hits++;
    let device;
console.log(platform)
    if(platform.includes("Linux")){
        device = "Linux";
        analytics.devices.linux++;
    } else if (platform.includes("Windows")){
        device = "Windows";
        analytics.devices.windows++;
    } else if (platform.includes("Macintosh")){
        device = "Macintosh";
        analytics.devices.macintosh++;
    } else if (platform.includes("Android")){
        device = "Android";
        analytics.devices.android++;
    } else if (platform.includes("iP")){
        device = "iOS";
        analytics.devices.ios++;
    } 

 
    fs.writeFileSync("analytics.json", JSON.stringify(analytics));
    res.send({"msg":"ok"});
});

module.exports = Router;
