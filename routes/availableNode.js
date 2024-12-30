const express = require("express");
const Router = express.Router();
const fs = require("fs");

Router.get("/", (req, res) => {
  let availableNodesArray = fs.readFileSync("files/availableNodes.txt", "utf8").split(",");
    res.send(availableNodesArray[0]);
});