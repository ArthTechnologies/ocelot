const express = require("express");
const Router = express.Router();
const fs = require("fs");

Router.get("/", (req, res) => {
 
  try {
  let nodeInfo = JSON.parse(fs.readFileSync("files/nodeInfo.json", "utf8"));


  res.send(nodeInfo);
  } catch (e) {
    console.log(e);
    res.send({error: "Error reading file"});
  }

    
});

Router.get("/list", (req, res) => {
  try {
    let availableNodes = fs.readFileSync("quartzNodes.txt", "utf8");
    availableNodes = availableNodes.split(",");
    res.send(availableNodes);
  } catch (e) { 
    console.log(e);
    res.send({error: "Error reading file"});
  }
}
); 

module.exports = Router;  