const express = require("express");
const Router = express.Router();
const fs = require("fs");

Router.get("/post/:file", (req, res) => {
  let text = fs
    .readFileSync("./files/posts/" + req.params.file + ".md")
    .toString();

  //converts markdown to html using marked
  const marked = require("marked");
  text = marked.parse(text.split("\n").slice(6).join("\n"));

  //make sure images arent too big
  text = text.replace(/<img/g, "<img style='max-width:80% max-height:80%'");
  res.send(text);
});

module.exports = Router;
