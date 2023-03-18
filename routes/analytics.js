

const express = require("express");
const Router = express.Router();
const fs = require("fs");


Router.post("/", (req, res) => {

    let userAgent = req.body.userAgent;
    let analytics = JSON.parse(fs.readFileSync("analytics.json"));
    analytics.hits++;
    let device;
console.log(userAgent)
    if(userAgent.includes("Linux")){
        device = "Linux";
        analytics.devices.linux++;
    } else if (userAgent.includes("Windows")){
        device = "Windows";
        analytics.devices.windows++;
    } else if (userAgent.includes("Macintosh")){
        device = "Macintosh";
        analytics.devices.macintosh++;
    } else if (userAgent.includes("Android")){
        device = "Android";
        analytics.devices.android++;
    } else if (userAgent.includes("iP")){
        device = "iOS";
        analytics.devices.ios++;
    } 

 
    fs.writeFileSync("analytics.json", JSON.stringify(analytics));
    res.send({"msg":"ok"});
});

module.exports = Router;
