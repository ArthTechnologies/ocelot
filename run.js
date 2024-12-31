// importing packages
const express = require("express");
const app = express();
const path = require("path");
const cors = require("cors");
const rsa = require("node-rsa");
const fs = require("fs");
const crypto = require("crypto");
const { jar } = require("request");
const { readJSON, writeJSON } = require("./scripts/utils");
if (!fs.existsSync("quartzNodes.txt")) {
  fs.writeFileSync("quartzNodes.txt", "");
} else {
  let array = fs.readFileSync("quartzNodes.txt").toString().split("\n")[0].split(",");
  let newarray = [];
  for (i in array) {
    //make a request to the node's capacity route
    let atCapacity = true;

    try {

    //fetch the node's capacity via the /info/capacity route
    const {exec} = require("child_process");
    let url = array[i] + "/info/capacity";
    console.log(url);
    exec("curl -s " + url, (error, stdout, stderr) => {
      
      try {
        let json = JSON.parse(stdout);
        console.log(json);
      if (json.atCapacity == false) {
        atCapacity = false;
      }
      if (!atCapacity) {
        newarray.push(url);
             

      }

      
    } catch (e) {
      console.log("Error: " + e);
    
    }
    }
    );
  } catch (e) {
    console.log("Error: " + e);
  }



}
fs.writeFileSync("files/availableNodes.txt", newarray.join(","));
}

if (!fs.existsSync("analytics.json")) {
  writeJSON(
    "analytics.json",
    JSON.stringify({
      max: 0,
      day: 0,
      days: {},
      hits: 0,
      devices: {
        linux: 0,
        windows: 0,
        macintosh: 0,
        android: 0,
        iOS: 0,
        unknown: 0,
      },
      languages: { en: 0, es: 0 },
      referrers: { google: 0 },
      pages: { "/": 0 },
      getStartedButtonClicks: 0,
      returning: 0,
      initial: 0,
    })
  );
} else {
  json = readJSON("analytics.json");
  for (i in json.days) {

    if (typeof json.days[i] == "number") {
      let number = json.days[i];
      json.days[i] = {};
      json.days[i].hits = number;
      json.days[i].redirects = 0;
    }
  }
  writeJSON("analytics.json", JSON.stringify(json));
}

if (!fs.existsSync("files/backups")) {
  fs.mkdirSync("files/backups");
}
if (readJSON("analytics.json")) {
  //the if clause is to prevent corrupted backups from overwriting the good one
  if (
    readJSON("analytics.json").iOS > 16 &&
    readJSON("analytics.json").devices.windows > 64
  ) {
    writeJSON("files/backups/analytics.json", readJSON("analytics.json"));
  }
}
// middlewares
app.use(express.json(), cors());

app.get("/", (req, res) => {
  res.status(200).sendFile(path.join(__dirname, "clientMessage.html"));
});

// adding routes
app.use("/file", require("./routes/file"));
app.use("/index", require("./routes/index"));
app.use("/status", require("./routes/status"));
app.use("/analytics", require("./routes/analytics"));
app.use("/rss", require("./routes/rss"));
app.use("/view", require("./routes/view"));
app.use("/availableNode", require("./routes/availableNode")); 

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
        let author = text.split("\n")[3];
        let authoricon = text.split("\n")[4];
        let image = null;
        for (let i = 0; i < text.split("\n").length; i++) {
          if (text.split("\n")[i].includes("https://i.imgur.com")) {
            image = text.split("\n")[i].split("(")[1].split(")")[0];
          }
        }

        postsIndex[item].push({
          title: title,
          desc: desc,
          date: date,
          slug: item2.split(".md")[0],
          image: image,
          author: author,
          authoricon: authoricon,
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
let langs = JSON.parse(fs.readFileSync("./files/posts/index.json").toString());
let rss = fs.readFileSync("arthblog_template.rss").toString();

for (i in langs) {
  let items = [];
  let posts = langs[i];
  for (j in posts) {
    let date = fs
      .readFileSync("./files/posts/" + i + "/" + langs[i][j].slug + ".md")
      .toString()
      .split("\n")[2];

    items.push(
      `<item>
<title>` +
        langs[i][j].title +
        `</title>
<description>
` +
        langs[i][j].desc +
        `
</description>

<link>https://backend.arthmc.xyz/view/post/` +
        langs[i][j].slug +
        `</link>
<guid isPermaLink="true">https://backend.arthmc.xyz/view/post/` +
        langs[i][j].slug +
        `</guid>
<pubDate>` +
        date +
        `</pubDate>

</item>`
    );
  }
  let rssp1 = rss.split("<!-- Posts -->")[0];
  let content = rssp1 + "<!-- Posts -->\n" + items.join("");
  //replace <lang>en-us</lang> with <lang>${lang}</lang>
  content = content.replace(
    "<language>en-us</language>",
    "<language>" + i + "</language>"
  );
  //replace <description>Arth Blog</description> with <description>${descriptionOfFirstPost}</description>
  content = content.replace(
    "<description></description>",
    "<description>" + posts[posts.length - 1].desc + "</description>"
  );

  //replace instances of the year '1970' with the current year
  content = content.replace(/1970/g, new Date().getFullYear());

  fs.writeFileSync(i + "_arthblog.rss", content);
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
