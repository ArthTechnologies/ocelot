const fs = require("fs");
const { exec } = require("child_process");
const utils = require("./utils.js");
const readJSON = utils.readJSON;
const writeJSON = utils.writeJSON;
const config = utils.getConfig();

// Boots the most popular modpacks on a throwaway server and records whether
// each one actually reaches an online state, so support can tell "this pack is
// broken upstream" from "this user's server is broken" without doing it by hand.
//
// One pack is checked at a time in a single reserved server slot, which is
// wiped between packs. Nothing here touches customer servers.

const LOG_PATH = "logs/modpackChecks.json";
const GAME_VERSION = "1.18.2";
const TOP_N = 10;

// CurseForge magic numbers: game 432 is Minecraft, class 4471 is Modpacks,
// loader 1 is Forge, and sortField 2 is Popularity.
const CF_GAME_ID = 432;
const CF_MODPACK_CLASS = 4471;
const CF_LOADER_FORGE = 1;
const CF_SORT_POPULARITY = 2;

// A pack has to install a loader, generate a world and reach "Done" — slow
// packs on a cold cache genuinely take this long.
const START_TIMEOUT_MS = Number(config.modpackCheckTimeoutMs) || 8 * 60 * 1000;
// Big packs are hundreds of mods and several hundred MB.
const DOWNLOAD_TIMEOUT_MS = Number(config.modpackCheckDownloadTimeoutMs) || 10 * 60 * 1000;
// If it hasn't even left "false" by now, run() never got going.
const LAUNCH_GRACE_MS = 90 * 1000;
const POLL_MS = 2000;

let running = false;

// Live state for the `modpackCheckerProgress` console command. A single run can
// take an hour, so "is it stuck or just slow?" needs an answer.
let progress = {
  running: false,
  phase: "idle",
  startedAt: null,
  index: 0,
  total: 0,
  current: null,
  currentStartedAt: null,
  passed: 0,
  failed: 0,
  skipped: 0,
};

function resetProgress() {
  progress = {
    running: false,
    phase: "idle",
    startedAt: null,
    index: 0,
    total: 0,
    current: null,
    currentStartedAt: null,
    passed: 0,
    failed: 0,
    skipped: 0,
  };
}

function getProgress() {
  return { ...progress };
}

// mc.js is required lazily: it starts timers and reads state on load, and this
// module is pulled in by run.js before that is wanted.
function mc() {
  return require("./mc.js");
}

function log(message) {
  console.log("[ModpackCheck] " + message);
}

// The reserved slot. Kept clear of [idOffset, idOffset + maxServers), which is
// the range /server/reserve hands out to customers.
function checkServerId() {
  const configured = parseInt(config.modpackCheckServerId);
  return Number.isFinite(configured) ? configured : 50000;
}

function slotIsSafe(id) {
  const idOffset = parseInt(config.idOffset);
  const maxServers = parseInt(config.maxServers);
  if (Number.isFinite(idOffset) && Number.isFinite(maxServers)) {
    if (id >= idOffset && id < idOffset + maxServers) return false;
  }
  // port = 10000 + id, and the panel also binds port + 66.
  return id > 0 && 10000 + id + 66 < 65536;
}

// run() copies the loader jar out of assets/jars. Without it the server can't
// start for reasons that have nothing to do with the pack, so those are
// reported as skipped rather than failed.
function jarAvailable(software, version) {
  try {
    return fs
      .readdirSync("assets/jars/")
      .some((jar) => jar.startsWith(`${software}-${version}-`) && jar.endsWith(".jar"));
  } catch (e) {
    return false;
  }
}

function readLog() {
  if (!fs.existsSync(LOG_PATH)) return { lastRun: null, gameVersion: GAME_VERSION, results: [] };
  const data = readJSON(LOG_PATH);
  if (!data || !Array.isArray(data.results)) {
    return { lastRun: null, gameVersion: GAME_VERSION, results: [] };
  }
  return data;
}

function writeLog(data) {
  if (!fs.existsSync("logs")) fs.mkdirSync("logs");
  writeJSON(LOG_PATH, data);
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

// ---------------------------------------------------------------- discovery

// Top Forge packs for this version, newest usable file each.
async function topForgeModpacks() {
  const apiKey = config.curseforgeKey;
  if (!apiKey) {
    log("No curseforgeKey configured — skipping the Forge half.");
    return [];
  }

  const search = await fetchJson(
    `https://api.curseforge.com/v1/mods/search?gameId=${CF_GAME_ID}` +
      `&classId=${CF_MODPACK_CLASS}` +
      `&gameVersion=${GAME_VERSION}` +
      `&modLoaderType=${CF_LOADER_FORGE}` +
      `&sortField=${CF_SORT_POPULARITY}&sortOrder=desc&index=0&pageSize=${TOP_N}`,
    { "x-api-key": apiKey }
  );

  const packs = [];
  for (const mod of search.data || []) {
    try {
      const filesResponse = await fetchJson(
        `https://api.curseforge.com/v1/mods/${mod.id}/files` +
          `?gameVersion=${GAME_VERSION}&modLoaderType=${CF_LOADER_FORGE}&pageSize=10`,
        { "x-api-key": apiKey }
      );

      const file = (filesResponse.data || [])[0];
      if (!file) {
        packs.push(unavailable("cf", mod.id, mod.name, mod.slug, "forge", "No 1.18.2 Forge file published."));
        continue;
      }

      // Authors can forbid third-party downloads, which blanks downloadUrl.
      let downloadUrl = file.downloadUrl;
      if (!downloadUrl) {
        const direct = await fetchJson(
          `https://api.curseforge.com/v1/mods/${mod.id}/files/${file.id}/download-url`,
          { "x-api-key": apiKey }
        );
        downloadUrl = direct.data;
      }
      if (!downloadUrl) {
        packs.push(unavailable("cf", mod.id, mod.name, mod.slug, "forge", "Author disabled third-party downloads."));
        continue;
      }

      packs.push({
        platform: "cf",
        projectId: mod.id,
        name: mod.name,
        slug: mod.slug,
        loader: "forge",
        software: "forge",
        versionId: file.id,
        versionName: file.displayName,
        downloadUrl,
      });
    } catch (err) {
      packs.push(unavailable("cf", mod.id, mod.name, mod.slug, "forge", `Lookup failed: ${err.message}`));
    }
  }
  return packs;
}

// Top Fabric packs for this version on Modrinth.
async function topFabricModpacks() {
  const base = (config.labrinthUrl || "https://api.modrinth.com/v2/").replace(/\/?$/, "/");
  const facets = encodeURIComponent(
    JSON.stringify([["project_type:modpack"], ["categories:fabric"], [`versions:${GAME_VERSION}`]])
  );

  const search = await fetchJson(
    `${base}search?facets=${facets}&index=downloads&limit=${TOP_N}&offset=0`
  );

  const packs = [];
  for (const hit of search.hits || []) {
    try {
      const versions = await fetchJson(
        `${base}project/${hit.project_id}/version` +
          `?game_versions=${encodeURIComponent(`["${GAME_VERSION}"]`)}` +
          `&loaders=${encodeURIComponent('["fabric"]')}`
      );

      const version = (versions || [])[0];
      const file = version && (version.files.find((f) => f.primary) || version.files[0]);
      if (!file) {
        packs.push(
          unavailable("mr", hit.project_id, hit.title, hit.slug, "fabric", "No 1.18.2 Fabric file published.")
        );
        continue;
      }

      packs.push({
        platform: "mr",
        projectId: hit.project_id,
        name: hit.title,
        slug: hit.slug,
        loader: "fabric",
        software: "fabric",
        versionId: version.id,
        versionName: version.version_number,
        downloadUrl: file.url,
      });
    } catch (err) {
      packs.push(
        unavailable("mr", hit.project_id, hit.title, hit.slug, "fabric", `Lookup failed: ${err.message}`)
      );
    }
  }
  return packs;
}

function unavailable(platform, projectId, name, slug, loader, reason) {
  return { platform, projectId, name, slug, loader, software: loader, unavailable: reason };
}

// ------------------------------------------------------------ test harness

function removeFolder(folder) {
  return new Promise((resolve) => {
    if (!fs.existsSync(folder)) return resolve();
    // Files written inside the container are owned by another uid, so rm -rf
    // is more reliable here than fs.rmSync.
    exec(`rm -rf "${folder}"`, () => resolve());
  });
}

// A clean slot with just enough server.json for run() to read.
async function prepareSlot(id, pack) {
  const folder = `servers/${id}`;
  await removeFolder(folder);
  fs.mkdirSync(folder, { recursive: true });

  writeJSON(`${folder}/server.json`, {
    id: String(id),
    name: `Modpack check — ${pack.name}`,
    software: pack.software,
    version: GAME_VERSION,
    specialDatapacks: [],
    specialPlugins: [],
    allowedAccounts: "",
    // Keeps the subscription sweeper from treating this as an unpaid server
    // and binning it mid-check.
    adminServer: true,
    modpackCheck: true,
  });
}

function modpackIndexPath(id, platform) {
  return platform === "mr"
    ? `servers/${id}/modrinth.index.json`
    : `servers/${id}/curseforge.index.json`;
}

// downloadModpack() is fire-and-forget, and run() would otherwise spawn the
// server while mods were still downloading — for Fabric there's no installer
// step to hide that, so a half-installed pack could reach "Done" and be
// recorded as a pass. Both download paths rewrite their index file with
// projectID/currentVersionDateAdded only after every mod download has settled,
// so that rewrite is the completion signal to wait on.
function waitForModpackInstall(id, pack) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const indexPath = modpackIndexPath(id, pack.platform);

    const timer = setInterval(() => {
      if (fs.existsSync(indexPath)) {
        const index = readJSON(indexPath); // {} while mid-write
        // downloadModpack has no cancellation, so a download abandoned when an
        // earlier pack timed out keeps writing into this shared slot. Requiring
        // the index to name *this* pack stops a stale write being mistaken for
        // this pack finishing.
        if (
          index &&
          index.currentVersionDateAdded &&
          String(index.projectID) === String(pack.projectId)
        ) {
          clearInterval(timer);
          return resolve({ ok: true, index });
        }
      }

      if (Date.now() - startedAt > DOWNLOAD_TIMEOUT_MS) {
        clearInterval(timer);
        resolve({
          ok: false,
          reason: `Modpack didn't finish downloading within ${Math.round(
            DOWNLOAD_TIMEOUT_MS / 60000
          )} minutes.`,
        });
      }
    }, POLL_MS);
  });
}

// How many mods actually landed versus how many the manifest asked for.
// CurseForge serves nothing for mods whose authors disabled third-party
// downloads (downloadModpack logs "error parsing json for <projectID>" and
// moves on), so a pack can install "successfully" with half its mods missing
// and then boot fine — which would be a meaningless pass.
function modInstallStats(id, pack, index) {
  let expected = 0;
  if (index && Array.isArray(index.files)) {
    expected =
      pack.platform === "mr"
        ? index.files.filter((f) => f.path && f.path.includes("mods/")).length
        : index.files.length;
  }

  let installed = 0;
  try {
    installed = fs
      .readdirSync(`servers/${id}/mods`)
      .filter((f) => f.endsWith(".jar")).length;
  } catch (e) {
    installed = 0; // no mods folder at all
  }

  return { expected, installed };
}

// Poll until the server is online, gives up, or dies.
function waitForOnline(id) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let sawLive = false;

    const timer = setInterval(() => {
      const state = mc().getState(id);
      const elapsed = Date.now() - startedAt;

      if (state === "true") {
        clearInterval(timer);
        return resolve({ status: "passed", reason: "Reached an online state." });
      }

      if (state === "installing" || state === "starting") sawLive = true;

      // "false" only means failure once it has actually been running — the very
      // first poll can land before run() has set a state.
      if (state === "false" && sawLive) {
        clearInterval(timer);
        return resolve({ status: "failed", reason: "Server stopped before coming online." });
      }

      if (!sawLive && elapsed > LAUNCH_GRACE_MS) {
        clearInterval(timer);
        return resolve({ status: "failed", reason: "Server never started." });
      }

      if (elapsed > START_TIMEOUT_MS) {
        clearInterval(timer);
        return resolve({
          status: "failed",
          reason: `Didn't come online within ${Math.round(START_TIMEOUT_MS / 60000)} minutes.`,
        });
      }
    }, POLL_MS);
  });
}

async function checkOne(pack, id) {
  const startedAt = Date.now();

  const base = {
    platform: pack.platform,
    projectId: pack.projectId,
    name: pack.name,
    slug: pack.slug,
    loader: pack.loader,
    versionId: pack.versionId || null,
    versionName: pack.versionName || null,
    checkedAt: startedAt,
  };

  if (pack.unavailable) {
    return { ...base, status: "skipped", reason: pack.unavailable, durationMs: 0 };
  }

  if (!jarAvailable(pack.software, GAME_VERSION)) {
    return {
      ...base,
      status: "skipped",
      reason: `No ${pack.software} ${GAME_VERSION} jar in assets/jars — can't test this loader.`,
      durationMs: 0,
    };
  }

  log(`Checking ${pack.name} (${pack.platform}:${pack.projectId})…`);

  let outcome;
  // Recorded even on success: "passed with 142/187 mods" is the difference
  // between a healthy pack and one that only booted because half of it is
  // missing.
  let mods = { expected: 0, installed: 0 };
  try {
    await prepareSlot(id, pack);

    // Install first, boot second — see waitForModpackInstall for why these
    // can't be left to overlap the way run() would do it.
    progress.phase = "downloading";
    mc().downloadModpack(id, pack.downloadUrl, pack.projectId, pack.versionId);
    const installed = await waitForModpackInstall(id, pack);

    if (!installed.ok) {
      outcome = { status: "failed", reason: installed.reason };
    } else {
      mods = modInstallStats(id, pack, installed.index);

      // Booting a pack with none of its mods proves nothing, and burns the
      // full start timeout doing it.
      if (mods.expected > 0 && mods.installed === 0) {
        outcome = {
          status: "failed",
          reason: `None of the ${mods.expected} mods downloaded — the pack couldn't be installed.`,
        };
      } else {
        progress.phase = "booting";
        // modpackURL is deliberately undefined: the pack is already on disk and
        // passing it would make run() download it a second time.
        mc().run(id, pack.software, GAME_VERSION, [], [], undefined, true, undefined);
        outcome = await waitForOnline(id);
      }
    }
  } catch (err) {
    outcome = { status: "failed", reason: `Check errored: ${err.message}` };
  }

  // Console tail is only interesting when something went wrong.
  let consoleTail = "";
  if (outcome.status === "failed") {
    try {
      consoleTail = mc().getTerminalTail(id, 4000);
    } catch (e) {
      consoleTail = "";
    }
  }

  progress.phase = "cleaning up";
  try {
    mc().kill(id);
  } catch (e) {
    log(`Couldn't kill slot ${id}: ${e.message}`);
  }
  await removeFolder(`servers/${id}`);

  log(
    `${pack.name}: ${outcome.status} — ${outcome.reason}` +
      (mods.expected ? ` (${mods.installed}/${mods.expected} mods)` : "")
  );
  return { ...base, ...outcome, mods, consoleTail, durationMs: Date.now() - startedAt };
}

// ------------------------------------------------------------------ public

async function checkModpacks() {
  if (running) {
    log("A check is already running — ignoring this request.");
    return readLog();
  }

  const id = checkServerId();
  if (!slotIsSafe(id)) {
    log(
      `Refusing to run: slot ${id} overlaps the customer id range or maps to an ` +
        `invalid port. Set modpackCheckServerId in config.txt to a free id.`
    );
    return readLog();
  }

  running = true;
  const startedAt = Date.now();
  resetProgress();
  progress.running = true;
  progress.phase = "discovering";
  progress.startedAt = startedAt;
  log(`Starting check of the top ${TOP_N} Forge and Fabric ${GAME_VERSION} modpacks…`);

  try {
    const [forge, fabric] = await Promise.all([
      topForgeModpacks().catch((err) => {
        log("CurseForge discovery failed: " + err.message);
        return [];
      }),
      topFabricModpacks().catch((err) => {
        log("Modrinth discovery failed: " + err.message);
        return [];
      }),
    ]);

    const packs = [...forge, ...fabric];
    progress.total = packs.length;

    const results = [];
    // Strictly one at a time: they share the slot, and a real pack needs the
    // whole box to install.
    for (const pack of packs) {
      progress.index = results.length + 1;
      progress.current = pack.name;
      progress.currentStartedAt = Date.now();
      // Reset here so a pack that gets skipped doesn't leave the previous
      // pack's phase showing.
      progress.phase = "checking";

      const result = await checkOne(pack, id);
      results.push(result);

      if (result.status === "passed") progress.passed++;
      else if (result.status === "failed") progress.failed++;
      else progress.skipped++;
    }

    const data = {
      lastRun: startedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      gameVersion: GAME_VERSION,
      passed: results.filter((r) => r.status === "passed").length,
      failed: results.filter((r) => r.status === "failed").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      results,
    };

    writeLog(data);
    log(`Done: ${data.passed} passed, ${data.failed} failed, ${data.skipped} skipped.`);
    return data;
  } catch (err) {
    log("Check aborted: " + err.message);
    console.error(err);
    return readLog();
  } finally {
    running = false;
    resetProgress();
  }
}

function isRunning() {
  return running;
}

module.exports = { checkModpacks, readLog, isRunning, getProgress, LOG_PATH, GAME_VERSION };
