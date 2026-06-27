const express = require("express");
const Router = express.Router();
const fs = require("fs");
const { execSync } = require("child_process");
const readJSON = require("../scripts/utils.js").readJSON;
const data = readJSON("assets/data.json");
const files = require("../scripts/files.js");
const writeJSON = require("../scripts/utils.js").writeJSON;
const config = require("../scripts/utils.js").getConfig();

Router.get("/", (req, res) => {
  data.numServers = fs.readdirSync("servers").length;
  writeJSON("assets/data.json", data);
  res.status(200).json({
    maxServers: config.maxServers,
    numServers: data.numServers,
  });
});

Router.get("/secrets", (req, res) => {
  if (config.forwardingSecret != undefined) {
    if (req.query.forwardingSecret == config.forwardingSecret) {
      let serverstoObject = {};
      let accountstoObject = {};
      fs.readdirSync("servers").forEach((server) => {
        if (fs.existsSync(`servers/${server}/server.json`)) {
          const text = fs.readFileSync(`servers/${server}/server.json`);
          try {
            serverstoObject[server] = JSON.parse(text);
          } catch {
            console.log("error parsing " + server);
          }
        } else {
          serverstoObject[server] = "not created yet";
        }
      });
      fs.readdirSync("accounts").forEach((account) => {
        const text = fs.readFileSync(`accounts/${account}`);
        try {
          accountstoObject[account] = JSON.parse(text);
        } catch {
          console.log("error parsing " + account);
        }
      });
      res
        .status(200)
        .json({ servers: serverstoObject, accounts: accountstoObject });
    } else {
      res.status(401).json({ msg: "Invalid forwarding secret." });
    }
  } else {
    res.status(401).json({ msg: "This node does not support forwarding." });
  }
});

Router.post("/secrets/forwardingSecret", (req, res) => {
  if (config.forwardingSecret == undefined) {
    let configTxt = fs.readFileSync("config.txt", "utf8");
    //find line including forwardingSecret
    let line = configTxt.split("\n").find((line) => {
      return line.includes("forwardingSecret");
    });
    configTxt = configTxt.replace(
      line,
      `forwardingSecret=${req.query.forwardingSecret}`
    );
    res.status(200).json({ msg: "Forwarding enabled." });
  } else {
    res.status(401).json({ msg: "Forwarding already enabled." });
  }
});

Router.post("/account", (req, res) => {
  if (config.forwardingSecret != undefined) {
    if (
      files.hashNoSalt(req.query.forwardingSecret) == config.forwardingSecret
    ) {
      if (req.body.account != undefined) {
        if (fs.existsSync(`accounts/${req.body.account}`)) {
          res.status(200).json({ msg: "Account already exists." });
        } else {
          writeJSON(`accounts/${req.body.account}`, {});
          res.status(200).json({ msg: "Account created." });
        }
      } else {
        res.status(400).json({ msg: "No account specified." });
      }
    }
  } else {
    res.status(401).json({ msg: "This node does not support forwarding." });
  }
});

Router.get("/qa", (req, res) => {
  let zipInstalled = false;
  try { execSync("which zip", { stdio: "ignore" }); zipInstalled = true; } catch {}

  let unzipInstalled = false;
  try { execSync("which unzip", { stdio: "ignore" }); unzipInstalled = true; } catch {}

  let latestPaper = null;
  try {
    const jars = fs.readdirSync("assets/jars").filter(f => f.startsWith("paper-") && f.endsWith(".jar"));
    const versions = jars.map(f => {
      const match = f.match(/^paper-(\d+\.\d+(?:\.\d+)?)/);
      return match ? { file: f, parts: match[1].split(".").map(Number) } : null;
    }).filter(Boolean);
    versions.sort((a, b) => {
      for (let i = 0; i < Math.max(a.parts.length, b.parts.length); i++) {
        const diff = (a.parts[i] || 0) - (b.parts[i] || 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });
    if (versions.length > 0) latestPaper = versions[versions.length - 1].file;
  } catch {}

  res.status(200).json({ zip: zipInstalled, unzip: unzipInstalled, latestPaper });
});

module.exports = Router;
