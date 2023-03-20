const express = require("express");
const Router = express.Router();
const fs = require("fs");


Router.get("/", (req, res) => {
	 let text = fs.readFileSync("arthblog.rss");
     res.send(text)
});

Router.get("/text", (req, res) => {
    let text = fs.readFileSync("arthblog.rss").toString();
    res.send(text)
});

module.exports = Router;
