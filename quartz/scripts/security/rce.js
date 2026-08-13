const { exec } = require("child_process");
const { promisify } = require("util");
const execPromise = promisify(exec);
const fs = require("fs");
const { ref } = require("process");
const crypto = require("crypto");

let fileAccessKeys = [];
let serversFolder = fs.readdirSync("./servers");

refreshKeys();
function cycle() {
  refreshKeys();

}

function refreshKeys() {
  fileAccessKeys = [];
  serversFolder = fs.readdirSync("./servers");
  for (let i = 0; i < serversFolder.length; i++) {
    if (!isNaN(serversFolder[i])) {
      fileAccessKeys.push({
        serverId: serversFolder[i],
        key: crypto.randomBytes(16).toString("hex"),
      });
    }
  }
}

//get the time and make it so it backs up every day at 12am, 6am, 12pm and 6pm uTC
function scheduleCycleAtUTC(hoursArray) {
  const now = new Date();
  const nowUTC = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds()
    )
  );

  const nextTimes = hoursArray.map((h) => {
    const target = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        h,
        0,
        0,
        0
      )
    );
    if (target <= nowUTC) {
      target.setUTCDate(target.getUTCDate() + 1); // next day
    }
    return target - nowUTC;
  });

  const millisTillNext = Math.min(...nextTimes);


  setTimeout(() => {
    cycle();
    setInterval(cycle, 6 * 60 * 60 * 1000); // every 6 hours
  }, millisTillNext);
}

scheduleCycleAtUTC([0, 6, 12, 18]);


function getFileAccessKey(serverId) {
  return fileAccessKeys.find((key) => key.serverId == serverId).key;
}

// Adds a key for a server created (or restored) after the last refreshKeys(),
// without rotating everyone else's keys. getFileAccessKey throws otherwise.
function ensureKey(serverId) {
  if (!fileAccessKeys.find((key) => key.serverId == serverId)) {
    fileAccessKeys.push({
      serverId: String(serverId),
      key: crypto.randomBytes(16).toString("hex"),
    });
  }
}

module.exports = { getFileAccessKey, refreshKeys, ensureKey };
