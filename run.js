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
app.use("/view", require("./routes/view"));

// port
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Listening on Port: ${port}`));

// put blog posts in rss
let posts = JSON.parse(fs.readFileSync("./files/posts/index.json").toString());
let rss = fs.readFileSync("arthblog_template.rss").toString();
let rssp1 = rss.split("<!-- Posts -->")[0]
let rssp2 = rss.split("<!-- Posts -->")[1,posts.length-1]
let items = [];
for (i in posts) {
items.push(`<item>
<title>`+posts[i].title+`</title>
<description>
`+posts[i].desc+`
</description>

<link>https://backend.arthmc.xyz/view/post/`+posts[i].slug+`</link>
<guid isPermaLink="true">https://backend.arthmc.xyz/view/post/`+posts[i].slug+`</guid>

</item>`);
}
fs.writeFileSync("arthblog.rss", rssp1+"<!-- Posts -->\n"+items.join("")+rssp2);


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
