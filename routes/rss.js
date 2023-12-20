const express = require("express");
const Router = express.Router();
const fs = require("fs");

Router.get("/:lang", (req, res) => {
  let text = fs.readFileSync(req.params.lang + "_arthblog.rss");
  res.send(text);
});

Router.get("/", (req, res) => {
  let text = fs.readFileSync("arthblog.rss").toString();
  res.send(text);
});

module.exports = Router;
