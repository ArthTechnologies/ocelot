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
// The version Fabric is checked on, and the one anything version-less falls
// back to (the log's `gameVersion`, the reserved slot's server.json, …).
const GAME_VERSION = "1.18.2";
// Forge is checked across every version people still run packs on. Top TOP_N
// per version, so this is 5x the Forge work of a single-version run — see the
// note on the weekly schedule in run.js.
const FORGE_GAME_VERSIONS = ["1.18.2", "1.12.2", "1.20.1"];
const TOP_N = 10;

// CurseForge magic numbers: game 432 is Minecraft, class 4471 is Modpacks,
// loader 1 is Forge, and sortField 6 is TotalDownloads (2 would be Popularity,
// which blends recency and relevance rather than ranking on downloads).
const CF_GAME_ID = 432;
const CF_MODPACK_CLASS = 4471;
const CF_LOADER_FORGE = 1;
const CF_SORT_DOWNLOADS = 6;

// Curated list of packs independently confirmed to be Forge-only (see
// scripts/cf_forge_only generation notes) — CurseForge doesn't always tag a
// pack's newest file with a loader (RLCraft's latest release has shipped
// without one), which both this discovery step and the frontend's version
// picker rely on. Used as a trusted override wherever that tag is missing.
const FORGE_ONLY_PATH = "assets/forgeonlymodpacks.json";

function getForgeOnlyModpacks() {
  try {
    const data = JSON.parse(fs.readFileSync(FORGE_ONLY_PATH, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function isForgeOnlyModpack(cfId) {
  return getForgeOnlyModpacks().some((pack) => pack.id === cfId);
}

// A pack has to install a loader, generate a world and reach "Done" — slow
// packs on a cold cache genuinely take this long.
const START_TIMEOUT_MS = Number(config.modpackCheckTimeoutMs) || 8 * 60 * 1000;
// Big packs are hundreds of mods and several hundred MB.
const DOWNLOAD_TIMEOUT_MS = Number(config.modpackCheckDownloadTimeoutMs) || 10 * 60 * 1000;
// If it hasn't even left "false" by now, run() never got going.
const LAUNCH_GRACE_MS = 90 * 1000;
const POLL_MS = 2000;
// mc.killObstructingProcess fires its `docker kill` 2.5s after `docker stop`,
// so wait slightly longer than that before deleting the slot out from under a
// container that's still shutting down.
const KILL_SETTLE_MS = 3000;
// downloadModpack() fires every mod's download unbounded by default, which for
// a few-hundred-mod pack means that many simultaneous CurseForge API calls on
// one shared key — the checker runs two packs at once on top of that, so
// without a cap the burst is large enough to get rate-limited/dropped mid-pack,
// leaving a pack looking broken when it isn't. Customer-triggered installs
// don't pass this and stay unbounded.
const MOD_DOWNLOAD_CONCURRENCY = Number(config.modpackCheckDownloadConcurrency) || 8;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let running = false;

// Live state for the `modpackCheckerProgress` console command. A single run can
// take an hour, so "is it stuck or just slow?" needs an answer.
function emptyProgress() {
  return {
    running: false,
    phase: "idle",
    startedAt: null,
    index: 0,
    total: 0,
    currentPacks: [], // Array of up to 2 concurrent packs
    passed: 0,
    failed: 0,
    skipped: 0,
  };
}

let progress = emptyProgress();

function resetProgress() {
  progress = emptyProgress();
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

// The reserved slots (two for parallel checking). Kept clear of [idOffset, idOffset + maxServers), which is
// the range /server/reserve hands out to customers.
function checkServerId() {
  const configured = parseInt(config.modpackCheckServerId);
  return Number.isFinite(configured) ? configured : 50000;
}

function checkServerIds() {
  const primary = checkServerId();
  return [primary, primary + 1];
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

// Resolves one CurseForge mod entry {id, name, slug} to a checkable pack for a
// given game version, or an `unavailable` placeholder. Split out of
// topForgeModpacks so a single-pack recheck (checkOneModpack) can reuse the
// exact same file/download-url resolution instead of re-searching CurseForge.
async function resolveForgePack(mod, gameVersion) {
  const apiKey = config.curseforgeKey;
  try {
    let filesResponse = await fetchJson(
      `https://api.curseforge.com/v1/mods/${mod.id}/files` +
        `?gameVersion=${gameVersion}&modLoaderType=${CF_LOADER_FORGE}&pageSize=10`,
      { "x-api-key": apiKey }
    );

    let file = (filesResponse.data || [])[0];
    // The loader filter above depends on the file being tagged with a
    // loader, which isn't guaranteed (see FORGE_ONLY_PATH comment above) —
    // for packs we've confirmed are Forge-only, fall back to the newest
    // file for the version instead of reporting the pack unavailable.
    if (!file && isForgeOnlyModpack(mod.id)) {
      filesResponse = await fetchJson(
        `https://api.curseforge.com/v1/mods/${mod.id}/files?gameVersion=${gameVersion}&pageSize=1`,
        { "x-api-key": apiKey }
      );
      file = (filesResponse.data || [])[0];
    }
    if (!file) {
      return unavailable("cf", mod.id, mod.name, mod.slug, "forge", gameVersion,
        `No ${gameVersion} Forge file published.`);
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
      return unavailable("cf", mod.id, mod.name, mod.slug, "forge", gameVersion,
        "Author disabled third-party downloads.");
    }

    return {
      platform: "cf",
      projectId: mod.id,
      name: mod.name,
      slug: mod.slug,
      loader: "forge",
      software: "forge",
      gameVersion,
      versionId: file.id,
      versionName: file.displayName,
      downloadUrl,
    };
  } catch (err) {
    return unavailable("cf", mod.id, mod.name, mod.slug, "forge", gameVersion,
      `Lookup failed: ${err.message}`);
  }
}

// Top Forge packs by total downloads for one game version, newest usable file
// each. Called once per entry in FORGE_GAME_VERSIONS — the ranking is per
// version, so each list is the top packs people actually run on that version.
async function topForgeModpacks(gameVersion) {
  const apiKey = config.curseforgeKey;
  if (!apiKey) {
    log("No curseforgeKey configured — skipping the Forge half.");
    return [];
  }

  const search = await fetchJson(
    `https://api.curseforge.com/v1/mods/search?gameId=${CF_GAME_ID}` +
      `&classId=${CF_MODPACK_CLASS}` +
      `&gameVersion=${gameVersion}` +
      `&modLoaderType=${CF_LOADER_FORGE}` +
      `&sortField=${CF_SORT_DOWNLOADS}&sortOrder=desc&index=0&pageSize=${TOP_N}`,
    { "x-api-key": apiKey }
  );

  const packs = [];
  for (const mod of search.data || []) {
    packs.push(await resolveForgePack(mod, gameVersion));
  }
  return packs;
}

// Resolves one Modrinth project hit {project_id, title, slug} to a checkable
// pack for a given game version, or an `unavailable` placeholder. Split out
// of topFabricModpacks for the same reason as resolveForgePack above.
async function resolveFabricPack(hit, gameVersion) {
  const base = (config.labrinthUrl || "https://api.modrinth.com/v2/").replace(/\/?$/, "/");
  try {
    const versions = await fetchJson(
      `${base}project/${hit.project_id}/version` +
        `?game_versions=${encodeURIComponent(`["${gameVersion}"]`)}` +
        `&loaders=${encodeURIComponent('["fabric"]')}`
    );

    const version = (versions || [])[0];
    const file = version && (version.files.find((f) => f.primary) || version.files[0]);
    if (!file) {
      return unavailable("mr", hit.project_id, hit.title, hit.slug, "fabric", gameVersion,
        `No ${gameVersion} Fabric file published.`);
    }

    return {
      platform: "mr",
      projectId: hit.project_id,
      name: hit.title,
      slug: hit.slug,
      loader: "fabric",
      software: "fabric",
      gameVersion,
      versionId: version.id,
      versionName: version.version_number,
      downloadUrl: file.url,
    };
  } catch (err) {
    return unavailable("mr", hit.project_id, hit.title, hit.slug, "fabric", gameVersion,
      `Lookup failed: ${err.message}`);
  }
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
    packs.push(await resolveFabricPack(hit, GAME_VERSION));
  }
  return packs;
}

function unavailable(platform, projectId, name, slug, loader, gameVersion, reason) {
  return {
    platform,
    projectId,
    name,
    slug,
    loader,
    software: loader,
    gameVersion,
    unavailable: reason,
  };
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
    version: pack.gameVersion || GAME_VERSION,
    specialDatapacks: [],
    specialPlugins: [],
    allowedAccounts: "",
    // Keeps the subscription sweeper from treating this as an unpaid server
    // and binning it mid-check.
    adminServer: true,
    modpackCheck: true,
    // Big modded packs OOM at the 4GB a plain server.json falls back to.
    ramOverrideGB: 6,
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
  let manifest = 0;
  if (index && Array.isArray(index.files)) {
    manifest =
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

  // downloadModpack strips client-side mods and renames conflicting ones to
  // .jar.disabled before we get here, so both are gone from the .jar count.
  // They downloaded fine — the panel removed them on purpose — so they come out
  // of the denominator too. Leaving them in made every modded pack look like a
  // partial install, which is exactly the signal `expected` exists to give.
  const filtered = mc().getModFilterStats(id);
  const removedClientSide = filtered.removedClientSide.length;
  const disabledByConflict = filtered.disabledByConflict.length;
  const expected = Math.max(0, manifest - removedClientSide - disabledByConflict);

  return { expected, installed, manifest, removedClientSide, disabledByConflict };
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

// One install-and-boot attempt. Always leaves the slot killed and empty, so
// the next attempt (or pack) starts from nothing.
async function runAttempt(pack, id) {
  let outcome;
  // Recorded even on success: "passed with 142/187 mods" is the difference
  // between a healthy pack and one that only booted because half of it is
  // missing.
  let mods = {
    expected: 0,
    installed: 0,
    manifest: 0,
    removedClientSide: 0,
    disabledByConflict: 0,
  };

  try {
    await prepareSlot(id, pack);
    // The filters/download tracker set these on every install, but a retry
    // reusing the slot must never be able to read the previous attempt's
    // numbers.
    mc().resetModFilterStats(id);
    mc().resetDownloadProgress(id);

    // Install first, boot second — see waitForModpackInstall for why these
    // can't be left to overlap the way run() would do it.
    progress.phase = "downloading";
    mc().downloadModpack(id, pack.downloadUrl, pack.projectId, pack.versionId, MOD_DOWNLOAD_CONCURRENCY);
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
        mc().run(id, pack.software, pack.gameVersion || GAME_VERSION, [], [], undefined, true, undefined);
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
    // No-op if it already died; otherwise this is what stops a container that
    // is still up after a failed boot.
    mc().kill(id);
  } catch (e) {
    log(`Couldn't kill slot ${id}: ${e.message}`);
  }
  // killObstructingProcess schedules its `docker kill` 2.5s out, so give the
  // container a moment to actually go before the folder is pulled from under
  // it. Not a timeout — a fixed settle so the retry starts clean.
  await wait(KILL_SETTLE_MS);
  await removeFolder(`servers/${id}`);

  return { outcome, mods, consoleTail };
}

async function checkOne(pack, id) {
  const startedAt = Date.now();
  const gameVersion = pack.gameVersion || GAME_VERSION;

  const base = {
    platform: pack.platform,
    projectId: pack.projectId,
    name: pack.name,
    slug: pack.slug,
    loader: pack.loader,
    gameVersion,
    versionId: pack.versionId || null,
    versionName: pack.versionName || null,
    checkedAt: startedAt,
  };

  if (pack.unavailable) {
    return { ...base, status: "skipped", reason: pack.unavailable, durationMs: 0 };
  }

  // Per version: a panel can perfectly well have a forge-1.18.2 jar and no
  // forge-1.12.2 one, and that's the panel's gap rather than the pack's.
  if (!jarAvailable(pack.software, gameVersion)) {
    return {
      ...base,
      status: "skipped",
      reason: `No ${pack.software} ${gameVersion} jar in assets/jars — can't test this loader.`,
      durationMs: 0,
    };
  }

  log(`Checking ${pack.name} (${pack.platform}:${pack.projectId}, ${gameVersion})…`);

  let attempt = await runAttempt(pack, id);
  let attempts = 1;
  let firstFailure = null;

  // Downloads time out and containers fail to come up for reasons that have
  // nothing to do with the pack. One retry separates a genuinely broken pack
  // from a bad night. Per-attempt timeouts are unchanged.
  if (attempt.outcome.status === "failed") {
    firstFailure = attempt.outcome.reason;
    log(`${pack.name}: attempt 1 failed (${firstFailure}) — retrying once.`);
    attempts = 2;
    attempt = await runAttempt(pack, id);
  }

  const { outcome, mods, consoleTail } = attempt;

  const filteredOut = (mods.removedClientSide || 0) + (mods.disabledByConflict || 0);
  log(
    `${pack.name}: ${outcome.status} — ${outcome.reason}` +
      (mods.expected ? ` (${mods.installed}/${mods.expected} mods` : "") +
      (mods.expected && filteredOut
        ? `, ${filteredOut} filtered out by the panel)`
        : mods.expected
        ? ")"
        : "") +
      (attempts > 1 ? ` [attempt ${attempts}]` : "")
  );

  return {
    ...base,
    ...outcome,
    mods,
    attempts,
    firstFailure,
    consoleTail,
    durationMs: Date.now() - startedAt,
  };
}

// ------------------------------------------------------------------ public

async function checkModpacks() {
  if (running) {
    log("A check is already running — ignoring this request.");
    return readLog();
  }

  const [id1, id2] = checkServerIds();
  if (!slotIsSafe(id1) || !slotIsSafe(id2)) {
    log(
      `Refusing to run: slots ${id1} and ${id2} overlap the customer id range or map to ` +
        `invalid ports. Set modpackCheckServerId in config.txt to a free id.`
    );
    return readLog();
  }

  running = true;
  const startedAt = Date.now();
  resetProgress();
  progress.running = true;
  progress.phase = "discovering";
  progress.startedAt = startedAt;
  log(
    `Starting check of the top ${TOP_N} Forge modpacks by downloads on each of ` +
      `${FORGE_GAME_VERSIONS.join(", ")}, plus the top ${TOP_N} Fabric ${GAME_VERSION} packs…`
  );

  try {
    const discovered = await Promise.all([
      ...FORGE_GAME_VERSIONS.map((gameVersion) =>
        topForgeModpacks(gameVersion).catch((err) => {
          log(`CurseForge discovery failed for ${gameVersion}: ${err.message}`);
          return [];
        })
      ),
      topFabricModpacks().catch((err) => {
        log("Modrinth discovery failed: " + err.message);
        return [];
      }),
    ]);

    const packs = discovered.flat();
    progress.total = packs.length;

    const results = [];
    // Process packs in parallel pairs: 2 at a time using separate slots.
    // Split packs into pairs and check each pair concurrently.
    for (let i = 0; i < packs.length; i += 2) {
      const pair = [packs[i], packs[i + 1]].filter(Boolean);
      progress.phase = "checking";
      progress.currentPacks = pair.map(p => ({
        name: p.name,
        gameVersion: p.gameVersion || GAME_VERSION,
        loader: p.loader,
        startedAt: Date.now()
      }));
      progress.index = i + 1;

      // Run both packs in parallel using different slots
      const checkPromises = pair.map((pack, idx) => {
        const slotId = idx === 0 ? id1 : id2;
        return checkOne(pack, slotId);
      });

      const pairResults = await Promise.all(checkPromises);
      results.push(...pairResults);

      pairResults.forEach(result => {
        if (result.status === "passed") progress.passed++;
        else if (result.status === "failed") progress.failed++;
        else progress.skipped++;
      });
    }

    const data = {
      lastRun: startedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      // gameVersion is kept for older readers; gameVersions is what a run
      // spanning several Forge versions is actually described by.
      gameVersion: GAME_VERSION,
      gameVersions: [...new Set(results.map((r) => r.gameVersion).filter(Boolean))],
      forgeGameVersions: FORGE_GAME_VERSIONS,
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

// Re-runs a single pack the admin already sees in the report — identified by
// platform+projectId+gameVersion — without kicking off a full batch. The
// caller (the admin "recheck" button) already has the row from the last
// checkModpacks run, so name/slug are passed through rather than re-fetched;
// only the file/download-url lookup is redone, since that's the part that
// actually goes stale between runs.
//
// Shares the `running` flag with checkModpacks so the two can't stomp on the
// same reserved slot, and uses only the primary slot (id1) rather than the
// pair checkModpacks uses for its parallel packs.
async function checkOneModpack({ platform, projectId, gameVersion, loader, name, slug }) {
  if (running) {
    throw new Error("A modpack check is already running.");
  }

  const id = checkServerId();
  if (!slotIsSafe(id)) {
    throw new Error(
      `Refusing to run: slot ${id} overlaps the customer id range or maps to an invalid port.`
    );
  }

  running = true;
  resetProgress();
  progress.running = true;
  progress.phase = "checking";
  progress.startedAt = Date.now();
  progress.total = 1;
  progress.currentPacks = [{ name, gameVersion, loader, startedAt: Date.now() }];

  try {
    let pack;
    if (platform === "cf") {
      pack = await resolveForgePack({ id: projectId, name, slug }, gameVersion);
    } else if (platform === "mr") {
      pack = await resolveFabricPack({ project_id: projectId, title: name, slug }, gameVersion);
    } else {
      throw new Error(`Unknown platform "${platform}".`);
    }

    const result = await checkOne(pack, id);

    const data = readLog();
    const existingIndex = data.results.findIndex(
      (r) =>
        r.platform === platform &&
        String(r.projectId) === String(projectId) &&
        r.gameVersion === gameVersion
    );
    if (existingIndex === -1) data.results.push(result);
    else data.results[existingIndex] = result;

    data.passed = data.results.filter((r) => r.status === "passed").length;
    data.failed = data.results.filter((r) => r.status === "failed").length;
    data.skipped = data.results.filter((r) => r.status === "skipped").length;
    data.gameVersions = [...new Set(data.results.map((r) => r.gameVersion).filter(Boolean))];
    writeLog(data);

    progress.index = 1;
    if (result.status === "passed") progress.passed++;
    else if (result.status === "failed") progress.failed++;
    else progress.skipped++;

    return result;
  } finally {
    running = false;
    resetProgress();
  }
}

module.exports = {
  checkModpacks,
  checkOneModpack,
  readLog,
  isRunning,
  getProgress,
  checkServerId,
  checkServerIds,
  LOG_PATH,
  GAME_VERSION,
  FORGE_GAME_VERSIONS,
  getForgeOnlyModpacks,
  isForgeOnlyModpack,
};
