// importing packages
const express = require("express");
const app = express();
const path = require("path");
const cors = require("cors");
const rsa = require("node-rsa");
const fs = require("fs");
const crypto = require("crypto");
const { jar } = require("request");
if (!fs.existsSync("analytics.json")) {
  fs.writeFileSync(
    "analytics.json",
    JSON.stringify({
      max: 0,
      day: 0,
      days: {},
      hits: 0,
      devices: { linux: 0, windows: 0, macintosh: 0, android: 0, iOS: 0 },
    })
  );
}
// middlewares
app.use(express.json(), cors());

// adding routes
app.use("/file", require("./routes/file"));
app.use("/index", require("./routes/index"));
app.use("/status", require("./routes/status"));
app.use("/analytics", require("./routes/analytics"));
app.use("/rss", require("./routes/rss"));
app.use("/view", require("./routes/view"));

// port
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Listening on Port: ${port}`));

let postsIndex = {};
fs.readdirSync("./files/posts").forEach((item) => {
  if (item != "index.json") {
    if (postsIndex[item] == undefined) {
      postsIndex[item] = [];
    }
    fs.readdirSync("./files/posts/" + item).forEach((item2) => {
      if (item2 != "index.json") {
        let text = fs.readFileSync(
          "./files/posts/" + item + "/" + item2,
          "utf-8"
        );

        let title = text.split("\n")[0];
        let desc = text.split("\n")[1];
        let date = text.split("\n")[2];

        postsIndex[item].push({
          title: title,
          desc: desc,
          date: date,
          slug: item2.split(".md")[0],
        });
      }
    });
    //sort posts by date
    postsIndex[item].sort((a, b) => {
      return new Date(b.date) - new Date(a.date);
    });
  }
});

fs.writeFileSync("./files/posts/index.json", JSON.stringify(postsIndex));

// put blog posts in rss
let posts = JSON.parse(fs.readFileSync("./files/posts/index.json").toString());
let rss = fs.readFileSync("arthblog_template.rss").toString();
let rssp1 = rss.split("<!-- Posts -->")[0];
let rssp2 = rss.split("<!-- Posts -->")[(1, posts.length - 1)];
let items = [];

for (i in posts) {
  let langs = fs.readdirSync("./files/posts/");
  for (j in langs) {
    if (langs[j] == "en-US") {
      let date = fs
        .readFileSync("./files/posts/en-US/" + posts["en-US"][j].slug + ".md")
        .toString()
        .split("\n")[2];

      items.push(
        `<item>
<title>` +
          posts["en-US"][j].title +
          `</title>
<description>
` +
          posts["en-US"][j].desc +
          `
</description>

<link>https://backend.arthmc.xyz/view/post/` +
          posts["en-US"][j].slug +
          `</link>
<guid isPermaLink="true">https://backend.arthmc.xyz/view/post/` +
          posts["en-US"][j].slug +
          `</guid>
<pubDate>` +
          date +
          `</pubDate>

</item>`
      );
    }
  }
}
fs.writeFileSync(
  "arthblog.rss",
  rssp1 + "<!-- Posts -->\n" + items.join("") + rssp2
);

app.use((err, req, res, next) => {
  switch (err.message) {
    case "NoCodeProvided":
      return res.status(400).send({
        status: "ERROR",
        error: err.message,
      });
    default:
      return res.status(500).send({
        status: "ERROR",
        error: err.message,
      });
  }
});
