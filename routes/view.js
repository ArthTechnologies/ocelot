const express = require("express");
const Router = express.Router();
const fs = require("fs");

Router.get("/post/:file", (req, res) => {

    let text = fs.readFileSync("./files/posts/"+req.params.file+".md").toString();
    
    //converts markdown to html using marked
    const marked = require("marked");
    text = marked.parse(text.split("\n").slice(6).join("\n"));

    res.send(text)
});

module.exports = Router;
