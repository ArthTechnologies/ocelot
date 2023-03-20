

const express = require("express");
const Router = express.Router();
const fs = require("fs");

Router.get("/", (req, res) => {
    let analytics = JSON.parse(fs.readFileSync("analytics.json"));
    res.send(analytics);
});
//note: disable until new pricay policy goes into effect
Router.post("/", (req, res) => {
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
    res.send({"msg":"ok"});
});

module.exports = Router;
