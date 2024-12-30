const express = require("express");
const Router = express.Router();
const fs = require("fs");

Router.get("/", (req, res) => {
  let node = "null";
  try {
  let availableNodesArray = fs.readFileSync("files/availableNodes.txt", "utf8").split(",");

  node = availableNodesArray[0];
  if (availableNodesArray.length == 0) {
    node = "null";
  }
  } catch (e) {
    console.log(e);
  }

    res.send(node);
});

module.exports = Router;  