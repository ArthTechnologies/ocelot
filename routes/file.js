const express = require("express");
const Router = express.Router();
const fs = require("fs");

Router.get("/:posttype/:filename", (req, res) => {
  let path =
    "files/" +
    req.params.posttype +
    "/" +
    req.params.filename.split("*").join("/");
  let text = "";
  //log the path

  if (fs.existsSync(path)) {
    fs.readFile(path, "utf8", (err, data) => {
      if (err) {
        console.log(err);
      }
      res.send(data);
    });
  } else {
    res.send({ msg: "File not found" });
  }
});

module.exports = Router;
