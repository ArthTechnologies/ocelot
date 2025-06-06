const express = require("express");
const Router = express.Router();
const fs = require("fs");

Router.get("/", (req, res) => {
  let resp = {};

  let request = require("request");
  request("https://us-dallas-1.arthmc.xyz", function (error, response, body) {
    if (error) {
      resp["quartz"] = "Offline";
    } else {
      if (response.statusCode != 502) {
        resp["quartz"] = "Online";
      } else {
        resp["quartz"] = "Offline";
      }
    }
  });

  request("https://servers.arthmc.xyz", function (error, response, body) {
    if (error) {
      resp["observer"] = "Offline";
    } else {
      if (response.statusCode != 502) {
        resp["observer"] = "Online";
      } else {
        resp["observer"] = "Offline";
      }
    }
  });
  request("https://arthmc.xyz", function (error, response, body) {
    if (error) {
      resp["frontend"] = "Offline";
    } else {
      if (response.statusCode != 502) {
        resp["frontend"] = "Online";
      } else {
        resp["frontend"] = "Offline";
      }
    }
  });

  request("https://api.jarsmc.xyz", function (error, response, body) {
    if (error) {
      resp["jarsmcb"] = "Offline";
    } else {
      if (response.statusCode != 502) {
        resp["jarsmcb"] = "Online";
      } else {
        resp["jarsmcb"] = "Offline";
      }
    }
  });

  request("https://jarsmc.xyz", function (error, response, body) {
    if (error) {
      resp["jarsmcf"] = "Offline";
    } else {
      if (response.statusCode != 502) {
        resp["jarsmcf"] = "Online";
      } else {
        resp["jarsmcf"] = "Offline";
      }
    }
  });

  let inter = 10;
  //check every 50 ms
  let interval = setInterval(function () {
    if (
      resp["observer"] != undefined &&
      resp["quartz"] != undefined &&
      resp["frontend"] != undefined &&
      resp["jarsmcb"] != undefined &&
      resp["jarsmcf"] != undefined
    ) {
      clearInterval(interval);
      res.send(resp);
    }
    inter++;

    if (inter > 50) {
      inter = 50;
    }
  }, inter);
});

module.exports = Router;
