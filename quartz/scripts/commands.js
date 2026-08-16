// ---------------------------------------------------------------------------
// commands.js
//
// Every command Quartz needs to shell out for, in one place, so the rest of
// the codebase never has to know whether it's running on Linux or macOS.
//
// Most of the functions below don't actually branch on `platform` - Node's
// `os` module reports CPU/memory identically on both, and the POSIX-standard
// flags of `du`/`df`/`chown`/`chmod` work the same on GNU coreutils (Linux)
// and BSD userland (macOS). The commands that broke on macOS before this file
// existed (`lscpu`, `/proc/*`, `free -m`, `top -bn1`, GNU-only `du
// --max-depth`/`df --output`, GNU-only `sort -V`) are the ones a single
// portable implementation replaces outright. Where the two platforms
// genuinely need different behavior (install hints, background-session
// tooling) that's where an explicit `isMac`/`isLinux` branch shows up.
// ---------------------------------------------------------------------------

const os = require("os");
const fs = require("fs");
const { exec, execFile, execSync } = require("child_process");

const platform = process.platform;
const isMac = platform === "darwin";
const isLinux = platform === "linux";

function execFileAsync(file, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        return reject(error);
      }
      resolve({ stdout, stderr });
    });
  });
}

// ---------------------------------------------------------------------------
// CPU / memory
// ---------------------------------------------------------------------------

// Total logical processors (what `lscpu`'s cores-per-socket * threads-per-core
// used to compute on Linux only). `os.cpus()` reports one entry per logical
// processor on both Linux and macOS.
function getCpuThreadCount() {
  return os.cpus().length || 1;
}

// Node fills this in from /proc/cpuinfo on Linux and sysctl on macOS - no
// shell-out needed on either platform.
function getCpuName() {
  const cpus = os.cpus();
  return cpus.length ? cpus[0].model.trim() : "Unknown CPU";
}

function sampleCpuTimes() {
  return os.cpus().map((cpu, i) => ({ id: "cpu" + i, times: cpu.times }));
}

// Per-core usage, computed the same way `/proc/stat` was diffed before: two
// samples a short interval apart, usage = 1 - (idle delta / total delta).
async function getPerCoreUsage(sampleIntervalMs = 500) {
  const first = sampleCpuTimes();
  await new Promise((resolve) => setTimeout(resolve, sampleIntervalMs));
  const second = sampleCpuTimes();

  return first.map((core, i) => {
    const a = core.times;
    const b = second[i].times;
    const totalA = a.user + a.nice + a.sys + a.idle + a.irq;
    const totalB = b.user + b.nice + b.sys + b.idle + b.irq;
    const totalDiff = totalB - totalA;
    const idleDiff = b.idle - a.idle;
    const usage = totalDiff > 0 ? ((totalDiff - idleDiff) / totalDiff) * 100 : 0;
    return { id: core.id, cpuUsage: usage.toFixed(2) };
  });
}

// Overall CPU usage as a percentage, averaged across cores.
async function getCpuUsage(sampleIntervalMs = 500) {
  const cores = await getPerCoreUsage(sampleIntervalMs);
  if (!cores.length) return 0;
  const avg = cores.reduce((sum, core) => sum + parseFloat(core.cpuUsage), 0) / cores.length;
  return parseFloat(avg.toFixed(2));
}

// { used, total } in MB. `os.freemem()` isn't exactly Linux's "available"
// column (it doesn't account for reclaimable buffers/cache), but it's the
// same portable measure on both platforms and close enough for a dashboard
// stat - which is all this ever fed.
function getMemoryUsage() {
  const totalMB = os.totalmem() / (1024 * 1024);
  const freeMB = os.freemem() / (1024 * 1024);
  return { used: Math.round(totalMB - freeMB), total: Math.round(totalMB) };
}

// ---------------------------------------------------------------------------
// Disk usage. `-P` (POSIX output format) and `-s`/`-c` (summarize/grand
// total) are supported by both GNU coreutils and BSD `du`/`df` - it's the
// GNU-only long flags (`--max-depth`, `--output`) that have no BSD
// equivalent and silently error out on macOS.
// ---------------------------------------------------------------------------

async function getDiskSpaceAvailable(targetPath = ".") {
  try {
    const { stdout } = await execFileAsync("df", ["-Pk", targetPath]);
    const lines = stdout.trim().split("\n");
    const fields = lines[lines.length - 1].trim().split(/\s+/);
    // Filesystem 1024-blocks Used Available Capacity Mounted-on
    return parseInt(fields[3]) * 1024;
  } catch (err) {
    console.error("Error getting available space:", err.message);
    return 0;
  }
}

// Takes one or more literal paths (no shell globs - callers resolve those
// themselves via fs, so this never needs a shell at all).
async function getFolderDiskUsage(targetPaths) {
  const paths = Array.isArray(targetPaths) ? targetPaths : [targetPaths];
  if (paths.length === 0) return 0;
  try {
    const { stdout } = await execFileAsync("du", ["-skc", ...paths]);
    const lines = stdout.trim().split("\n");
    const totalLine = lines[lines.length - 1];
    return parseInt(totalLine.split("\t")[0]) * 1024;
  } catch (err) {
    console.error("Error getting folder disk usage:", err.message);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Filesystem sorting. GNU `sort -V` (natural/version sort) has no BSD
// equivalent - reimplementing it in pure JS sidesteps the platform split
// entirely instead of trying to match it.
// ---------------------------------------------------------------------------

function sortFilenamesByVersionDesc(names) {
  return [...names].sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }));
}

// ---------------------------------------------------------------------------
// Docker. The Docker CLI's own behavior is uniform across platforms; these
// just centralize the parsing so nothing else in the codebase shells out to
// docker directly.
// ---------------------------------------------------------------------------

// Stops any running container publishing a port that looks like one of
// Quartz's server ports (10000-19999), left over from a previous run.
async function cleanupStalePortContainers() {
  try {
    const { stdout } = await execFileAsync("docker", ["ps", "--format", "{{.ID}} {{.Ports}}"]);
    const ids = [];
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const id = line.slice(0, line.indexOf(" "));
      const ports = line.slice(line.indexOf(" ") + 1);
      if (/1[0-9]{4}->/.test(ports)) ids.push(id);
    }
    if (ids.length === 0) return;
    await execFileAsync("docker", ["stop", ...ids]);
  } catch (err) {
    console.log("Startup port cleanup error (non-fatal):", err.message);
  }
}

// Stops, then (after a grace period) force-kills, whatever container is
// publishing `port`. Used when a server's port is already claimed by a
// leftover container from a previous crash.
function stopContainerOnPort(port) {
  execFileAsync("docker", ["ps", "--filter", `publish=${port}`, "--format", "{{.ID}}"])
    .then(({ stdout }) => {
      const id = stdout.trim();
      if (!id) return;
      execFile("docker", ["stop", id], () => {});
      setTimeout(() => {
        execFile("docker", ["kill", id], () => {});
      }, 2500);
    })
    .catch((e) => console.log(e));
}

// ---------------------------------------------------------------------------
// Server folder permissions. chown/chmod syntax is identical on Linux and
// macOS - what actually broke portability was a hardcoded Linux
// service-account name ("sysadmin:100") that only exists on one specific
// deployment. Using the identity Quartz itself is running as works
// everywhere, including a bare macOS dev machine with no such account.
// ---------------------------------------------------------------------------

function getServerIdentity() {
  const info = os.userInfo();
  // uid/gid are -1 on Windows; not a target platform here, but guard anyway.
  return { uid: info.uid, gid: info.gid, username: info.username };
}

function refreshServerPermissions(targetDir = "servers/") {
  return new Promise((resolve) => {
    const identity = getServerIdentity();
    if (identity.uid == null || identity.uid < 0) {
      console.log("Could not determine current user - skipping permission refresh.");
      return resolve(false);
    }
    const owner = `${identity.uid}:${identity.gid}`;
    execFile("sudo", ["chown", "-R", owner, targetDir], (chownErr) => {
      if (chownErr) {
        console.error(`Error setting permissions: ${chownErr}`);
        return resolve(false);
      }
      execFile("sudo", ["chmod", "-R", "2776", targetDir], (chmodErr) => {
        if (chmodErr) {
          console.error(`Error setting permissions: ${chmodErr}`);
          return resolve(false);
        }
        console.log("Permissions set successfully.");
        resolve(true);
      });
    });
  });
}

// Non-fatal startup check: warns if `targetDir` isn't owned by the group
// Quartz itself runs as, which is what refreshServerPermissions() would set
// it to. Returns a warning string, or null if everything looks fine.
function checkServerPermissionsWarning(targetDir = "servers") {
  try {
    const identity = getServerIdentity();
    if (identity.gid == null || identity.gid < 0) return null;
    const stat = fs.statSync(targetDir);
    if (stat.gid === identity.gid) return null;
    return (
      "Warning: FTP may not work. Please run " +
      `sudo chown -R ${identity.uid}:${identity.gid} ${targetDir}/ && sudo chmod -R 2776 ${targetDir}/ ` +
      "to fix this."
    );
  } catch (err) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Optional host tools (ImageMagick, zip/unzip). `command -v` behaves the
// same on both platforms - what differs is which package manager to point
// the admin at when a tool is missing.
// ---------------------------------------------------------------------------

function isToolInstalled(bin) {
  try {
    execSync(`command -v ${bin}`, { stdio: "ignore" });
    return true;
  } catch (e) {
    return false;
  }
}

// Returns the first installed binary from `candidates`, or null if none are.
function findBinary(candidates) {
  for (const bin of candidates) {
    if (isToolInstalled(bin)) return bin;
  }
  return null;
}

function installHint(packageName) {
  return isMac ? `brew install ${packageName}` : `apt install ${packageName}`;
}

module.exports = {
  platform,
  isMac,
  isLinux,
  execFileAsync,
  getCpuThreadCount,
  getCpuName,
  getPerCoreUsage,
  getCpuUsage,
  getMemoryUsage,
  getDiskSpaceAvailable,
  getFolderDiskUsage,
  sortFilenamesByVersionDesc,
  cleanupStalePortContainers,
  stopContainerOnPort,
  getServerIdentity,
  refreshServerPermissions,
  checkServerPermissionsWarning,
  isToolInstalled,
  findBinary,
  installHint,
};
