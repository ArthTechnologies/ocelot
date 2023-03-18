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

// port
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Listening on Port: ${port}`));

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
