// importing packages
const express = require("express");
const app = express();
const path = require("path");
const cors = require("cors");
const rsa = require("node-rsa");
const fs = require("fs");
const crypto = require("crypto");
if (!fs.existsSync("analytics.json")) {
  fs.writeFileSync("analytics.json", JSON.stringify({"max":0,"day":0,"days":{},"hits":0, "devices":{"linux":0, "windows":0, "macintosh":0, "android":0, "iOS":0}}));
}
// middlewares
app.use(express.json(), cors());

// adding routes
app.use("/file", require("./routes/file"));
app.use("/index", require("./routes/index"));
app.use("/status", require("./routes/status"));
app.use("/analytics", require("./routes/analytics"));
app.use("/rss", require("./routes/rss"));

// port
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Listening on Port: ${port}`));

// put blog posts in rss
let dir = fs.readdirSync("./files/posts")
let rss = fs.readFileSync("arthblog.rss").toString();
let rssp1 = rss.split("<item>")[0]
let rssp2 = rss.split("<item>")[1,dir.length-1]
for (i in dir) {
let item = `<item>
<title>Introducing Arth Panel</title>
<description>
Your gateway to running your own Minecraft servers.
</description>

<link>https://arthmc.xyz/blog/introducing-arth-panel</link>
<guid isPermaLink="true">https://arthmc.xyz/blog/introducing-arth-panel</guid>
<pubDate>Sun, 08 Jan 2023 12:00:00 +0000</pubDate>


</item>`
}

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
