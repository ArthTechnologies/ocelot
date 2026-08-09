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
// SLOT_COUNT packs are checked at a time, one reserved server slot each, wiped
// between packs. Nothing here touches customer servers.

const LOG_PATH = "logs/modpackChecks.json";
// The version anything version-less falls back to (the log's `gameVersion`,
// the reserved slot's server.json, …). Also what old Fabric rows in the log
// were checked on, back when the batch run covered Fabric.
const GAME_VERSION = "1.18.2";
// Forge is checked across every version people still run packs on. Top TOP_N
// per version, so this is 4x the Forge work of a single-version run — see the
// note on the weekly schedule in run.js.
const FORGE_GAME_VERSIONS = ["1.18.2", "1.12.2", "1.20.1", "1.16.5"];
const TOP_N = 10;

// How many packs are checked at once, one reserved server slot each — ids
// `modpackCheckServerId` .. `+ SLOT_COUNT - 1`. Raising this is a trade against
// per-slot resources: each slot is pinned to CHECK_CPU_CORES core and
// CHECK_RAM_GB of RAM (below), so three slots is roughly the footprint two
// customer-sized servers used to have.
const SLOT_COUNT = 3;
// A checker slot is a throwaway world with nobody on it — it needs enough to
// generate spawn chunks and reach "Done", not to hold players. Kept low so the
// slots running in parallel don't starve the customer servers on the same box.
const CHECK_RAM_GB = 5;
const CHECK_CPU_CORES = 1;

// CurseForge magic numbers: game 432 is Minecraft, class 4471 is Modpacks,
// loader 1 is Forge, and sortField 6 is TotalDownloads (2 would be Popularity,
// which blends recency and relevance rather than ranking on downloads).
const CF_GAME_ID = 432;
const CF_MODPACK_CLASS = 4471;
const CF_LOADER_FORGE = 1;
// Only used to recognize an incidental Fabric tag during Forge discovery
// (see topForgeModpacks) — Fabric is no longer searched or checked on its own.
const CF_LOADER_FABRIC = 4;
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

function getClientSideModpackIds() {
  try {
    const content = fs.readFileSync("assets/clientsidemodpacks.txt", "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((id) => parseInt(id))
      .filter((id) => !isNaN(id));
  } catch (e) {
    return [];
  }
}

function isClientSideModpack(cfId) {
  return getClientSideModpackIds().includes(cfId);
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
// one shared key — the checker runs SLOT_COUNT packs at once on top of that, so
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
    currentPacks: [], // Slot-indexed, up to SLOT_COUNT concurrent packs
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

// Phase of the check running on `slotId`. With the slots draining a shared
// queue they genuinely diverge (one downloading while another boots), so the
// phase lives on the slot's currentPacks entry; the legacy global
// progress.phase is still mirrored (last writer wins) for the console command
// and any old readers.
function setSlotPhase(slotId, phase) {
  progress.phase = phase;
  const idx = checkServerIds().indexOf(slotId);
  const current = idx !== -1 ? progress.currentPacks[idx] : null;
  if (current) current.phase = phase;
}

// mc.js is required lazily: it starts timers and reads state on load, and this
// module is pulled in by run.js before that is wanted.
function mc() {
  return require("./mc.js");
}

function log(message) {
  console.log("[ModpackCheck] " + message);
}

// The reserved slots. Kept clear of [idOffset, idOffset + maxServers), which is
// the range /server/reserve hands out to customers.
function checkServerId() {
  const configured = parseInt(config.modpackCheckServerId);
  return Number.isFinite(configured) ? configured : 50000;
}

function checkServerIds() {
  const primary = checkServerId();
  return Array.from({ length: SLOT_COUNT }, (_, i) => primary + i);
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

    let files = filesResponse.data || [];
    // The loader filter above depends on the file being tagged with a
    // loader, which isn't guaranteed (see FORGE_ONLY_PATH comment above) —
    // for packs we've confirmed are Forge-only, fall back to the newest
    // files for the version instead of reporting the pack unavailable.
    if (!files.length && isForgeOnlyModpack(mod.id)) {
      filesResponse = await fetchJson(
        `https://api.curseforge.com/v1/mods/${mod.id}/files?gameVersion=${gameVersion}&pageSize=10`,
        { "x-api-key": apiKey }
      );
      files = filesResponse.data || [];
    }
    const file = files[0];
    if (!file) {
      return unavailable("cf", mod.id, mod.name, mod.slug, "forge", gameVersion,
        `No ${gameVersion} Forge file published.`);
    }

    // Customers never install a client file when a server pack exists: the
    // version picker (ModpackVersion.svelte) silently swaps the install over
    // to the paired server pack via the file's alternateFileId, and sorts
    // versions with a server pack above newer ones without. Server packs
    // bundle every jar directly — including mods whose authors disabled
    // third-party API downloads — so checking the client pack would test an
    // artifact with failure modes customers never see (DawnCraft's client
    // manifest has 17 such mods; its server pack ships them all). Files are
    // newest-first, so this walks back to the newest file whose server pack
    // resolves — even when the very latest file has none — and any failure
    // resolving one falls through to the next candidate, then to the newest
    // client pack, rather than skipping the check.
    for (const candidate of files.filter((f) => f.alternateFileId)) {
      try {
        const alt = await fetchJson(
          `https://api.curseforge.com/v1/mods/${mod.id}/files/${candidate.alternateFileId}`,
          { "x-api-key": apiKey }
        );
        const serverFile = alt.data;
        let serverUrl = serverFile && serverFile.downloadUrl;
        if (serverFile && !serverUrl) {
          const direct = await fetchJson(
            `https://api.curseforge.com/v1/mods/${mod.id}/files/${serverFile.id}/download-url`,
            { "x-api-key": apiKey }
          );
          serverUrl = direct.data;
        }
        if (serverUrl) {
          return {
            platform: "cf",
            projectId: mod.id,
            name: mod.name,
            slug: mod.slug,
            loader: "forge",
            software: "forge",
            gameVersion,
            versionId: serverFile.id,
            versionName: serverFile.displayName,
            downloadUrl: serverUrl,
            serverPack: true,
          };
        }
      } catch (err) {
        log(`${mod.name}: server pack lookup failed for file ${candidate.id} (${err.message}).`);
      }
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

  // CurseForge's modLoaderType filter is loose — see the identical note on
  // filterByLoader in routes/curseforge.js — so a "Forge" search can still
  // surface a pack that's actually Fabric because one old file happened to
  // carry a Forge tag. Left in, that pack burns one of the TOP_N slots for
  // this version and reports "unavailable" once resolveForgePack finds no
  // real Forge file, rather than the genuinely next-ranked Forge pack never
  // getting checked at all. Note this can leave fewer than TOP_N packs for a
  // version — deliberately not backfilled with an extra page, since ranking
  // is by downloads and there's no sane page to pull a replacement from
  // without re-fetching and re-filtering the whole ranked list.
  const genuineForgeHits = (search.data || []).filter((mod) => {
    // Skip client-side only modpacks
    if (isClientSideModpack(mod.id)) return false;

    const indexes = mod.latestFilesIndexes;
    if (!Array.isArray(indexes)) return true;
    const hasFabric = indexes.some((f) => f.modLoader === CF_LOADER_FABRIC);
    const hasForge = indexes.some((f) => f.modLoader === CF_LOADER_FORGE);
    return !(hasFabric && !hasForge);
  });

  const packs = [];
  for (const mod of genuineForgeHits) {
    packs.push(await resolveForgePack(mod, gameVersion));
  }
  return packs;
}

// Resolves one Modrinth project hit {project_id, title, slug} to a checkable
// pack for a given game version, or an `unavailable` placeholder. Fabric is no
// longer part of the batch run, but checkOneModpack still needs this to
// recheck the "mr" rows already sitting in the log.
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
    ramOverrideGB: CHECK_RAM_GB,
    // A slot gets a single core rather than the default four — with several
    // checks in flight at once, handing each one four would oversubscribe the
    // box against the customer servers sharing it. Slower boots, so this
    // trades against START_TIMEOUT_MS.
    cpuCoresOverride: CHECK_CPU_CORES,
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
//
// Server packs are the exception: they carry no manifest, so downloadModpack
// never writes an index file for them — the settled flag on the download
// record (guarded in mc.js against a stale install finishing late into this
// shared slot) is the equivalent "everything is on disk" signal.
function waitForModpackInstall(id, pack) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const indexPath = modpackIndexPath(id, pack.platform);

    const timer = setInterval(() => {
      if (pack.serverPack) {
        if (mc().isModpackDownloadSettled(id)) {
          clearInterval(timer);
          return resolve({ ok: true, index: null });
        }
      } else if (fs.existsSync(indexPath)) {
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

  // Why installed < expected: per-mod reasons (rate limited, author blocked
  // the download, a bad file, ...) captured live during the download phase —
  // see fetchCurseForgeDownloadUrl in mc.js. Snapshotting them here means a
  // refresh after the run still shows why, not just the bare counts.
  const failedMods = mc().getDownloadProgress(id).failedMods;

  return { expected, installed, manifest, removedClientSide, disabledByConflict, failedMods };
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
    setSlotPhase(id, "downloading");
    mc().downloadModpack(id, pack.downloadUrl, pack.projectId, pack.versionId, MOD_DOWNLOAD_CONCURRENCY);
    const installed = await waitForModpackInstall(id, pack);

    if (!installed.ok) {
      outcome = { status: "failed", reason: installed.reason };
    } else {
      mods = modInstallStats(id, pack, installed.index);
      // A server pack has no manifest to count against, so expected/manifest
      // stay 0 — the flag tells readers of the log that 0 expected is "not
      // applicable", not "nothing was asked for".
      if (pack.serverPack) mods.serverPack = true;

      // Booting a pack with none of its mods proves nothing, and burns the
      // full start timeout doing it. For a server pack an empty mods folder
      // means the unzip fell over — its jars come bundled, not downloaded.
      if (mods.expected > 0 && mods.installed === 0) {
        outcome = {
          status: "failed",
          reason: `None of the ${mods.expected} mods downloaded — the pack couldn't be installed.`,
        };
      } else if (pack.serverPack && mods.installed === 0) {
        outcome = {
          status: "failed",
          reason: "Server pack extracted no mods — the download or unzip fell over.",
        };
      } else {
        setSlotPhase(id, "booting");
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

  setSlotPhase(id, "cleaning up");
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
      (mods.serverPack
        ? ` (${mods.installed} mods from the server pack` +
          (filteredOut ? `, ${filteredOut} filtered out by the panel)` : ")")
        : mods.expected
        ? ` (${mods.installed}/${mods.expected} mods` +
          (filteredOut ? `, ${filteredOut} filtered out by the panel)` : ")")
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

  const slotIds = checkServerIds();
  const unsafeSlots = slotIds.filter((id) => !slotIsSafe(id));
  if (unsafeSlots.length > 0) {
    log(
      `Refusing to run: slot(s) ${unsafeSlots.join(", ")} overlap the customer id range or map to ` +
        `invalid ports. Set modpackCheckServerId in config.txt to a free id with ` +
        `${SLOT_COUNT} consecutive ids free above it.`
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
      `${FORGE_GAME_VERSIONS.join(", ")}…`
  );

  try {
    const discovered = await Promise.all(
      FORGE_GAME_VERSIONS.map((gameVersion) =>
        topForgeModpacks(gameVersion).catch((err) => {
          log(`CurseForge discovery failed for ${gameVersion}: ${err.message}`);
          return [];
        })
      )
    );

    const packs = discovered.flat();
    progress.total = packs.length;
    progress.phase = "checking";
    // Slot-indexed: currentPacks[i] is what slot i is checking right now,
    // null while that slot is idle. The stream endpoint pairs entries with
    // checkServerIds() positionally, so the positions must stay stable.
    progress.currentPacks = slotIds.map(() => null);

    // One worker per reserved slot, each pulling the next pack off the shared
    // list the moment their current one settles — a slow pack no longer stalls
    // the other slots the way fixed pairs did.
    const results = new Array(packs.length);
    let nextIndex = 0;
    const worker = async (slotIndex) => {
      while (nextIndex < packs.length) {
        const packIndex = nextIndex++;
        const pack = packs[packIndex];
        progress.index = packIndex + 1;
        progress.currentPacks[slotIndex] = {
          name: pack.name,
          gameVersion: pack.gameVersion || GAME_VERSION,
          loader: pack.loader,
          startedAt: Date.now(),
          phase: "checking",
        };
        // Results land at the pack's discovery position so the log keeps
        // ranking order no matter which slot finishes first.
        results[packIndex] = await checkOne(pack, slotIds[slotIndex]);
        const status = results[packIndex].status;
        if (status === "passed") progress.passed++;
        else if (status === "failed") progress.failed++;
        else progress.skipped++;
      }
      progress.currentPacks[slotIndex] = null;
    };
    await Promise.all(slotIds.map((_, i) => worker(i)));

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
