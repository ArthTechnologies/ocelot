

const express = require("express");
const Router = express.Router();
const fs = require("fs");

Router.get("/", (req, res) => {
    let analytics = JSON.parse(fs.readFileSync("analytics.json"));
    res.send(analytics);
});

//disabled until new privacy policy goes into effect
Router.post("/", (req, res) => {
    //if it's april 17th 2023 or later...
    if (new Date().getTime() > 1671424000000) {
        //how many days since 1970
    let day = new Date().getTime() / 1000 / 60 / 60 / 24;
    day = parseInt(day.toString().split('.')[0]);
    
    console.log(day)
    let platform = req.body.platform;
    let analytics = JSON.parse(fs.readFileSync("analytics.json"));
    analytics.day = day;
    analytics.hits++;
    console.log(analytics.days[day]);
    if (analytics.days[day] == undefined){
        analytics.days[day] = 1;
    } else {
        analytics.days[day]++;
        if (analytics.days[day] > analytics.max){
            analytics.max = analytics.days[day];
        }
    }

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
    res.send({"msg":"ok"})
    } else {
        res.send({"msg":"Analytics are disabled until the new privacy policy goes into effect"});
    }
});

module.exports = Router;
