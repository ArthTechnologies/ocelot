// Automatic Paper version updates.
//
// When a Paper server has `autoUpdate: true` in its server.json, this scans for
// the newest stable (release) Paper build available in assets/jars and, if it's
// newer than what the server runs, bumps server.version and applies it. A
// running server is restarted so the new jar takes effect; a stopped one picks
// it up on its next start.

const fs = require("fs");
const utils = require("./utils.js");
const readJSON = utils.readJSON;
const writeJSON = utils.writeJSON;

const JARS_DIR = "assets/jars";

// Kept in sync by hand with detectJavaVersion() in routes/server/index.js.
// Auto-update only ever feeds it Paper versions.
function detectJavaVersion(version, software) {
  let javaVer = "8";
  if (parseInt(version.split(".")[0]) >= 2 && !version.startsWith("1.")) javaVer = "25";
  else if (parseInt(version.split(".")[1]) >= 20) javaVer = "21";
  else if (version.includes("1.19")) javaVer = "21";
  else if (version.includes("1.18")) javaVer = "17";
  else if (version.includes("1.17")) javaVer = "17";
  if (software === "velocity") javaVer = "17";
  if (software === "snapshot") javaVer = "25";
  return javaVer;
}

// Compare two dotted numeric versions ("1.20.4", "26.2"). Missing trailing
// components count as 0, so "1.21" == "1.21.0". Returns >0 when a is newer.
function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Newest stable version of `software` present in assets/jars, or null if none.
// Only "release" variants are considered — auto-update must never jump a server
// onto a snapshot/experimental build.
function latestReleaseVersion(software) {
  let files;
  try {
    files = fs.readdirSync(JARS_DIR);
  } catch (e) {
    return null;
  }

  const target = software.toLowerCase();
  let latest = null;
  for (const file of files) {
    const match = file.match(/^([a-zA-Z]+)-(\d+(?:\.\d+)*)-(\w+)\.jar$/);
    if (!match) continue;
    const [, name, version, variant] = match;
    if (name.toLowerCase() !== target) continue;
    if (variant !== "release") continue;
    if (latest === null || compareVersions(version, latest) > 0) latest = version;
  }
  return latest;
}

// Scan every server and update the eligible Paper ones. `mc` is the mc.js module
// (passed in to avoid a require cycle); when omitted, versions are still bumped
// but running servers aren't restarted.
function autoUpdatePaperServers(mc) {
  let ids;
  try {
    ids = fs.readdirSync("servers");
  } catch (e) {
    console.log("[AutoUpdate] Could not read servers directory: " + e);
    return;
  }

  for (const id of ids) {
    if (isNaN(id)) continue; // skip non-numeric folders (uploads, etc.)
    const serverPath = `servers/${id}/server.json`;
    if (!fs.existsSync(serverPath)) continue;

    const server = readJSON(serverPath);
    if (server.autoUpdate !== true) continue;
    if (!server.software || server.software.toLowerCase() !== "paper") continue;

    const latest = latestReleaseVersion("paper");
    if (!latest) continue;
    if (compareVersions(latest, server.version) <= 0) continue; // already current

    console.log(`[AutoUpdate] Server ${id}: ${server.version} -> ${latest} (Paper)`);

    server.version = latest;
    server.javaVersion = detectJavaVersion(latest, server.software);
    writeJSON(serverPath, server);

    // Restart if it's up so the new jar is loaded now; otherwise the next start
    // will use it. run(..., false) re-reads software/version from server.json.
    if (mc && mc.getState(id) !== "false") {
      mc.stopAsync(id, () => {
        mc.run(id, undefined, undefined, undefined, undefined, undefined, false);
      });
    }
  }
}

module.exports = {
  autoUpdatePaperServers,
  latestReleaseVersion,
  compareVersions,
};
