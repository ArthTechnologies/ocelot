const express = require("express");
const Router = express.Router();
const fs = require("fs");

Router.get("/arthblog.rss", (req, res) => {
  let text = fs.readFileSync(req.query.lang + "_arthblog.rss");
  res.send(text);
});

Router.get("/", (req, res) => {
  let text = fs.readFileSync("arthblog.rss").toString();
  res.send(text);
});

module.exports = Router;
