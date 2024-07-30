const fs = require("fs");
function readJSON(file) {
  let json = {};
  try {
    json = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.log("error parsing json for " + file, error);
  }
  return json;
}

function writeJSON(file, json) {
  try {
    fs.writeFileSync(file, JSON.stringify(json, null, 2));
  } catch (error) {
    console.log("error writing json for " + file, error);
  }
}

module.exports = { readJSON, writeJSON };
