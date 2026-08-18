const express = require("express");
const router = express.Router({ mergeParams: true });
const f = require("../../scripts/mc.js");
const fs = require("fs");
const utils = require("../../scripts/utils.js");
const readJSON = require("../../scripts/utils.js").readJSON;

// Player access control — the whitelist/blacklist half of the Players panel.
//
// Everything here is derived from the files Minecraft itself owns
// (server.properties, whitelist.json, banned-players.json, banned-ips.json,
// ops.json) rather than from any panel-side bookkeeping, so a change made
// through the console, over FTP or by a plugin is reflected the moment it
// lands on disk.
//
// The one rule that shapes every write below: **a running server owns these
// files.** It keeps the whitelist and ban list in memory and rewrites them
// whenever they change, so editing the JSON under a live server is either
// ignored or clobbered on the next save. So each mutation has two paths — a
// console command while the server is up, a direct file edit while it's down.
// `whitelist reload` is the seam that lets the whitelist take the file path in
// both cases (see addToWhitelist).

const FLOODGATE_UUID_PREFIX = "00000000-0000-0000-";
const DEFAULT_BEDROCK_PREFIX = ".";

function serverDir(id) {
  return "servers/" + id;
}

// Route params reach the filesystem, so anything that isn't a plain server id
// is refused before it can be concatenated into a path.
function validId(id) {
  return /^[0-9]+$/.test(String(id));
}

function auth(req) {
  const account = readJSON("accounts/" + req.headers.username + ".json");
  return (
    validId(req.params.id) &&
    utils.hasAccess(req.headers.token, account, req.params.id)
  );
}

function isRunning(id) {
  const state = f.getState(id);
  return state === "true" || state === true;
}

// ---------------------------------------------------------------------------
// Bedrock / Floodgate
// ---------------------------------------------------------------------------

// Floodgate prepends a prefix to every Bedrock username so it can't collide
// with a Java one, and it's configurable — reading it back out of the plugin's
// own config is the only way to know what a Bedrock name looks like on *this*
// server. Falls back to Floodgate's default of "." when the plugin hasn't
// generated a config yet.
function bedrockPrefix(id) {
  const configPaths = [
    serverDir(id) + "/plugins/floodgate/config.yml",
    serverDir(id) + "/plugins/Floodgate/config.yml",
  ];
  for (const path of configPaths) {
    if (!fs.existsSync(path)) continue;
    try {
      const line = fs
        .readFileSync(path, "utf8")
        .split("\n")
        .find((l) => l.trim().startsWith("username-prefix:"));
      if (line) {
        const value = line.split(":").slice(1).join(":").trim();
        // The value is normally quoted ("." / '.'); an empty prefix is legal
        // config but would make every Java name look like a Bedrock one, so
        // it's treated as "no prefix in use" rather than matching everything.
        const unquoted = value.replace(/^["']|["']$/g, "");
        if (unquoted.length > 0) return unquoted;
        return "";
      }
    } catch (e) {
      // A malformed config shouldn't take the whole panel down — the default
      // prefix is right for the overwhelming majority of servers anyway.
      console.log("Could not read Floodgate prefix for server " + id + ": " + e.message);
    }
  }
  return DEFAULT_BEDROCK_PREFIX;
}

// Geyser is what lets Bedrock clients connect at all; Floodgate is what gives
// them a Java-side identity (the prefixed name and the synthetic UUID). Both
// are installed together by mc.js, but they're detected separately because the
// distinction decides what we can offer: no Floodgate means no reliable way to
// resolve a gamertag to a UUID, so whitelisting by hand isn't possible.
function bedrockSupport(id) {
  const dir = serverDir(id);
  const geyserJars = [
    "/plugins/cx_geyser-spigot_Geyser.jar",
    "/plugins/cx_geyser-velocity_Geyser.jar",
  ];
  const floodgateJars = [
    "/plugins/cx_floodgate-spigot_Floodgate.jar",
    "/plugins/cx_floodgate-velocity_Floodgate.jar",
  ];
  const geyser = geyserJars.some((j) => fs.existsSync(dir + j));
  const floodgate = floodgateJars.some((j) => fs.existsSync(dir + j));
  return {
    enabled: geyser,
    floodgate,
    prefix: bedrockPrefix(id),
  };
}

// Two independent signals, because either can be missing. A whitelist entry
// added by UUID may carry a name with no prefix, and a name typed by hand may
// not have a UUID resolved yet.
function looksBedrock(name, uuid, prefix) {
  if (typeof uuid === "string" && uuid.toLowerCase().startsWith(FLOODGATE_UUID_PREFIX)) {
    return true;
  }
  return Boolean(prefix) && typeof name === "string" && name.startsWith(prefix);
}

// ---------------------------------------------------------------------------
// server.properties
// ---------------------------------------------------------------------------

function readProperty(id, key) {
  const path = serverDir(id) + "/server.properties";
  if (!fs.existsSync(path)) return undefined;
  const line = fs
    .readFileSync(path, "utf8")
    .split("\n")
    .find((l) => l.trim().startsWith(key + "="));
  if (line === undefined) return undefined;
  return line.split("=").slice(1).join("=").trim();
}

function writeProperty(id, key, value) {
  const path = serverDir(id) + "/server.properties";
  if (!fs.existsSync(path)) return false;
  const lines = fs.readFileSync(path, "utf8").split("\n");
  const index = lines.findIndex((l) => l.trim().startsWith(key + "="));
  if (index === -1) {
    // A property Minecraft hasn't written yet (older templates omit
    // enforce-whitelist) still has to end up in the file, or the mode switch
    // silently does nothing.
    lines.push(key + "=" + value);
  } else {
    lines[index] = key + "=" + value;
  }
  fs.writeFileSync(path, lines.join("\n"));
  return true;
}

// ---------------------------------------------------------------------------
// The Minecraft-owned JSON lists
// ---------------------------------------------------------------------------

function readList(id, file) {
  const path = serverDir(id) + "/" + file;
  if (!fs.existsSync(path)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(path, "utf8") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // A half-written list (server killed mid-save) reads as empty rather than
    // throwing a 500 at a panel that only wanted to draw a player list.
    console.log("Could not parse " + file + " for server " + id + ": " + e.message);
    return [];
  }
}

function writeList(id, file, list) {
  fs.writeFileSync(serverDir(id) + "/" + file, JSON.stringify(list, null, 2));
}

// Minecraft writes its timestamps as "yyyy-MM-dd HH:mm:ss Z" in the server's
// own timezone. Entries the panel adds have to match, or the server rejects
// the whole file on the next read.
function mcTimestamp(date) {
  const pad = (n, width = 2) => String(n).padStart(width, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  return (
    date.getFullYear() +
    "-" + pad(date.getMonth() + 1) +
    "-" + pad(date.getDate()) +
    " " + pad(date.getHours()) +
    ":" + pad(date.getMinutes()) +
    ":" + pad(date.getSeconds()) +
    " " + sign + pad(Math.floor(absolute / 60)) + pad(absolute % 60)
  );
}

// ---------------------------------------------------------------------------
// Console commands
// ---------------------------------------------------------------------------

// Everything that reaches writeTerminal is a line on the server's stdin, so a
// newline anywhere in a name or reason would run whatever follows it as a
// second console command. The account calling this already has full console
// access through /server/:id/terminal, so this isn't a privilege boundary —
// but a player named on a ban screen shouldn't be able to smuggle a command in
// through a reason field either.
function sanitizeArg(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

// Java names are [A-Za-z0-9_]{1,16}. Bedrock gamertags reach the Java side
// through Floodgate with the prefix attached and spaces already replaced by
// underscores, so the prefix character is the only extra thing to allow.
function validPlayerName(name, prefix) {
  if (typeof name !== "string") return false;
  let bare = name;
  if (prefix && bare.startsWith(prefix)) bare = bare.slice(prefix.length);
  return /^[A-Za-z0-9_]{1,16}$/.test(bare);
}

function runCommand(id, command) {
  f.writeTerminal(id, command);
}

// ---------------------------------------------------------------------------
// Identity resolution
// ---------------------------------------------------------------------------

function dashUuid(raw) {
  const hex = String(raw || "").replace(/-/g, "");
  if (hex.length !== 32) return String(raw || "");
  return (
    hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) +
    "-" + hex.slice(16, 20) + "-" + hex.slice(20)
  );
}

async function lookupJava(name) {
  const response = await fetch(
    "https://api.mojang.com/users/profiles/minecraft/" + encodeURIComponent(name),
    { signal: AbortSignal.timeout(10000) }
  );
  // Mojang answers a name nobody owns with 404, and (historically) with an
  // empty 204 — neither is an error worth throwing over.
  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) throw new Error("Mojang returned " + response.status);
  const profile = await response.json();
  if (!profile || !profile.id) return null;
  return { uuid: dashUuid(profile.id), name: profile.name, bedrock: false };
}

// Geyser's global API is the only way to turn a gamertag into the Floodgate
// UUID the server will actually see, since that UUID is derived from the
// player's Xbox XUID rather than issued by Mojang. It applies the prefix and
// the space-to-underscore rewrite itself, which is why the prefix is passed in
// rather than stitched on afterwards.
async function lookupBedrock(gamertag, prefix) {
  const url =
    "https://api.geysermc.org/v2/utils/uuid/bedrock_or_java/" +
    encodeURIComponent(gamertag) +
    "?prefix=" + encodeURIComponent(prefix);
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error("Geyser API returned " + response.status);
  const profile = await response.json();
  if (!profile || !profile.id) return null;
  const uuid = dashUuid(profile.id);
  return {
    uuid,
    name: profile.name,
    bedrock: uuid.toLowerCase().startsWith(FLOODGATE_UUID_PREFIX),
  };
}

// `platform` is explicit rather than guessed whenever the UI can tell us,
// because a gamertag and a Java username can be the same string and there is
// no way to tell which one the user meant from the text alone.
async function resolvePlayer(name, platform, bedrock) {
  const prefix = bedrock.prefix;
  let bare = name.trim();
  if (prefix && bare.startsWith(prefix)) bare = bare.slice(prefix.length);

  if (platform === "bedrock") {
    if (!bedrock.floodgate) {
      return { error: "This server doesn't have Bedrock support installed." };
    }
    const found = await lookupBedrock(bare, prefix);
    if (!found) return { error: "No Bedrock account named \"" + bare + "\" was found." };
    return { player: found };
  }

  if (platform === "java") {
    const found = await lookupJava(bare);
    if (!found) return { error: "No Java account named \"" + bare + "\" was found." };
    return { player: found };
  }

  // "auto": a name typed with the Bedrock prefix is unambiguous, so trust it.
  // Otherwise Java comes first — it's the account type the name field is
  // primarily for — and Bedrock is the fallback.
  if (prefix && name.trim().startsWith(prefix) && bedrock.floodgate) {
    const found = await lookupBedrock(bare, prefix);
    if (found) return { player: found };
    return { error: "No Bedrock account named \"" + bare + "\" was found." };
  }
  const java = await lookupJava(bare).catch(() => null);
  if (java) return { player: java };
  if (bedrock.floodgate) {
    const found = await lookupBedrock(bare, prefix).catch(() => null);
    if (found) return { player: found };
  }
  return { error: "No Minecraft account named \"" + bare + "\" was found." };
}

// ---------------------------------------------------------------------------
// Attempted joins
// ---------------------------------------------------------------------------

// Whoever a whitelist turns away is recorded by the server itself, and nowhere
// else — usercache only holds people who actually got in, so it can't tell
// "tried to join and was refused" apart from "joined before the whitelist went
// up". The log line is the only honest source:
//
//   [15:59:41] [Server thread/INFO]: Disconnecting Steve (/1.2.3.4:23445): You are not whitelisted on this server!
//
// Vanilla writes "white-listed", Paper "whitelisted", and older versions print
// the whole GameProfile instead of a bare name — all three are matched.
const REJECTION = /Disconnecting (.+?) \(\/?([^)]*)\): You are not white-?listed on this server!/;
const TIMESTAMP = /^\[(\d{2}):(\d{2}):(\d{2})/;
const PROFILE_NAME = /name=([^,\]]+)/;
const PROFILE_ID = /id=([0-9a-fA-F-]{32,36})/;

// Logs grow without bound and this is polled while a server page is open, so
// only the tail is ever read.
const LOG_TAIL_BYTES = 256 * 1024;
const attemptCache = {};

function readLogTail(path) {
  const stat = fs.statSync(path);
  const length = Math.min(stat.size, LOG_TAIL_BYTES);
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(path, "r");
  try {
    fs.readSync(fd, buffer, 0, length, stat.size - length);
  } finally {
    fs.closeSync(fd);
  }
  return buffer.toString("utf8");
}

function parseAttemptedJoins(id) {
  const path = serverDir(id) + "/logs/latest.log";
  if (!fs.existsSync(path)) return [];

  let stat;
  try {
    stat = fs.statSync(path);
  } catch (e) {
    return [];
  }
  // Re-parsing a quarter-megabyte of log on every 15s poll would be pure
  // waste when the file hasn't moved.
  const key = stat.size + ":" + stat.mtimeMs;
  const cached = attemptCache[id];
  if (cached && cached.key === key) return cached.value;

  let text;
  try {
    text = readLogTail(path);
  } catch (e) {
    console.log("Could not read log for server " + id + ": " + e.message);
    return [];
  }

  // The log carries a time of day but no date, and — the part that's easy to
  // get wrong — that time is on the *Minecraft server's* clock, which under
  // Docker is usually UTC while the panel host is not. Rebuilding an absolute
  // timestamp from it would quietly shift every entry by the offset between
  // the two, so the printed time is passed through verbatim and only the
  // *date* is reconstructed, by counting days back from the file's mtime each
  // time the clock appears to jump forward (which can only mean an earlier
  // day). The frontend labels it as server time.
  const lines = text.split("\n");
  const attempts = {};
  let dayOffset = 0;
  let previousSeconds = Infinity;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const match = REJECTION.exec(line);
    if (!match) continue;

    let name = match[1].trim();
    let uuid = "";
    // Older servers log the whole GameProfile rather than a bare name.
    if (name.includes("GameProfile")) {
      const profileName = PROFILE_NAME.exec(name);
      const profileId = PROFILE_ID.exec(name);
      if (!profileName) continue;
      name = profileName[1].trim();
      if (profileId && profileId[1] !== "<null>") uuid = dashUuid(profileId[1]);
    }
    if (!name) continue;

    let at = "";
    let daysAgo = 0;
    const stamp = TIMESTAMP.exec(line);
    if (stamp) {
      const seconds =
        Number(stamp[1]) * 3600 + Number(stamp[2]) * 60 + Number(stamp[3]);
      if (seconds > previousSeconds) dayOffset++;
      previousSeconds = seconds;
      at = stamp[1] + ":" + stamp[2];
      daysAgo = dayOffset;
    }

    if (!attempts[name]) {
      // Walking newest-first means the first sighting of a name is its most
      // recent attempt.
      attempts[name] = {
        name,
        uuid,
        ip: match[2] || "",
        attempts: 0,
        lastAttemptTime: at,
        lastAttemptDaysAgo: daysAgo,
      };
    }
    attempts[name].attempts++;
    if (!attempts[name].uuid && uuid) attempts[name].uuid = uuid;
  }

  // The mtime is the anchor the day offsets above count back from, so the
  // frontend needs it to turn one into a date.
  const value = Object.values(attempts).map((entry) => ({
    ...entry,
    logUpdated: stat.mtime.toISOString(),
  }));
  attemptCache[id] = { key, value };
  return value;
}

// ---------------------------------------------------------------------------
// GET / — the whole access picture
// ---------------------------------------------------------------------------

router.get("/", function (req, res) {
  if (!auth(req)) return res.status(401).json({ msg: "Invalid credentials." });
  const id = req.params.id;
  if (!fs.existsSync(serverDir(id))) {
    return res.status(404).json({ msg: "Server not found." });
  }

  const bedrock = bedrockSupport(id);
  const decorate = (entry) => ({
    ...entry,
    bedrock: looksBedrock(entry.name, entry.uuid, bedrock.prefix),
    // What to actually print. The Floodgate prefix is a plumbing detail the
    // player never sees on their own screen, so it's stripped for display
    // while `name` stays exactly what the server files hold.
    displayName:
      bedrock.prefix && typeof entry.name === "string" && entry.name.startsWith(bedrock.prefix)
        ? entry.name.slice(bedrock.prefix.length)
        : entry.name,
  });

  const whitelistOn = readProperty(id, "white-list") === "true";

  res.status(200).json({
    // The panel's two "modes" are just the two states of white-list: with it
    // on, only listed players get in and the ban list is nearly irrelevant;
    // with it off, everyone gets in except the banned.
    mode: whitelistOn ? "whitelist" : "blacklist",
    enforceWhitelist: readProperty(id, "enforce-whitelist") === "true",
    onlineMode: readProperty(id, "online-mode") === "true",
    running: isRunning(id),
    bedrock,
    whitelist: readList(id, "whitelist.json").map(decorate),
    banned: readList(id, "banned-players.json").map(decorate),
    bannedIps: readList(id, "banned-ips.json"),
    // Only meaningful while the whitelist is on, but always sent — the panel
    // switches modes without a reload and shouldn't have to wait a poll for
    // the section to fill in.
    attemptedJoins: parseAttemptedJoins(id).map(decorate),
    ops: readList(id, "ops.json").map((op) => op.uuid),
  });
});

// ---------------------------------------------------------------------------
// POST /mode — whitelist on/off
// ---------------------------------------------------------------------------

router.post("/mode", function (req, res) {
  if (!auth(req)) return res.status(401).json({ msg: "Invalid credentials." });
  const id = req.params.id;
  const mode = req.body.mode;
  if (mode !== "whitelist" && mode !== "blacklist") {
    return res.status(400).json({ msg: "Mode must be \"whitelist\" or \"blacklist\"." });
  }
  const on = mode === "whitelist";

  if (!writeProperty(id, "white-list", String(on))) {
    return res.status(404).json({ msg: "This server has no server.properties yet." });
  }
  // enforce-whitelist is what kicks players who are already online when the
  // whitelist is turned on. Without it, switching to whitelist mode leaves
  // everyone currently connected in place until they log out, which reads as
  // the switch not having worked.
  writeProperty(id, "enforce-whitelist", String(on));

  if (isRunning(id)) {
    // The running server holds white-list in memory; the file edit above is
    // for the next boot, this is for right now.
    runCommand(id, on ? "whitelist on" : "whitelist off");
    if (on) {
      runCommand(id, "whitelist reload");
      // `whitelist on` only turns non-whitelisted players away at the door —
      // whether it also removes the ones already standing in the world is
      // decided by enforce-whitelist, and *that* is read out of
      // server.properties once at boot. The write above therefore can't reach
      // a running server, so a switch made mid-session would silently leave
      // everyone connected until they happened to log out. Kicking the
      // non-whitelisted players explicitly makes the switch mean the same
      // thing either way, no matter what the server booted with.
      const whitelisted = new Set(
        readList(id, "whitelist.json").map((entry) => entry.uuid)
      );
      for (const player of f.getPlayerList(id) || []) {
        if (!whitelisted.has(player.uuid)) {
          runCommand(id, "kick " + player.name + " You are not whitelisted on this server.");
        }
      }
    }
  }

  res.status(200).json({ msg: "Success", mode, applied: isRunning(id) });
});

// ---------------------------------------------------------------------------
// POST /whitelist — add
// ---------------------------------------------------------------------------

router.post("/whitelist", async function (req, res) {
  if (!auth(req)) return res.status(401).json({ msg: "Invalid credentials." });
  const id = req.params.id;
  const bedrock = bedrockSupport(id);
  const name = sanitizeArg(req.body.name);
  const platform = ["java", "bedrock"].includes(req.body.platform)
    ? req.body.platform
    : "auto";

  if (!name) return res.status(400).json({ msg: "A player name is required." });
  if (!validPlayerName(name, bedrock.prefix)) {
    return res.status(400).json({ msg: "\"" + name + "\" isn't a valid Minecraft name." });
  }

  // A player the panel already has an identity for — someone in usercache, or
  // a rejection the log recorded the profile for — needs no lookup at all.
  // That also means adding them still works when Mojang is unreachable.
  const knownUuid = sanitizeArg(req.body.uuid);
  if (knownUuid && /^[0-9a-fA-F-]{32,36}$/.test(knownUuid)) {
    const player = {
      uuid: dashUuid(knownUuid),
      name,
      bedrock: looksBedrock(name, dashUuid(knownUuid), bedrock.prefix),
    };
    const existing = readList(id, "whitelist.json");
    if (existing.some((entry) => entry.uuid === player.uuid)) {
      return res.status(200).json({ msg: "Already whitelisted", player });
    }
    existing.push({ uuid: player.uuid, name: player.name });
    writeList(id, "whitelist.json", existing);
    if (isRunning(id)) runCommand(id, "whitelist reload");
    return res.status(200).json({ msg: "Success", player });
  }

  let resolved;
  try {
    resolved = await resolvePlayer(name, platform, bedrock);
  } catch (e) {
    // Mojang and the Geyser API both rate-limit, and neither being reachable
    // is the user's fault — say so instead of reporting the name as unknown.
    console.log("Name lookup failed for server " + id + ": " + e.message);
    return res.status(502).json({
      msg: "Couldn't reach Minecraft's account servers. Try again in a moment.",
    });
  }
  if (resolved.error) return res.status(404).json({ msg: resolved.error });

  const player = resolved.player;
  const list = readList(id, "whitelist.json");
  if (list.some((entry) => entry.uuid === player.uuid)) {
    return res.status(200).json({ msg: "Already whitelisted", player });
  }

  // Written to the file rather than sent as `whitelist add <name>` even when
  // the server is up, because the console command makes the *server* do the
  // name lookup — and the server only knows how to ask Mojang, so it fails
  // outright on every Bedrock player. Writing the resolved entry and asking
  // the server to re-read the file works identically for both platforms.
  list.push({ uuid: player.uuid, name: player.name });
  writeList(id, "whitelist.json", list);
  if (isRunning(id)) runCommand(id, "whitelist reload");

  res.status(200).json({ msg: "Success", player });
});

// ---------------------------------------------------------------------------
// DELETE /whitelist — remove
// ---------------------------------------------------------------------------

router.delete("/whitelist", function (req, res) {
  if (!auth(req)) return res.status(401).json({ msg: "Invalid credentials." });
  const id = req.params.id;
  const uuid = sanitizeArg(req.body.uuid);
  const name = sanitizeArg(req.body.name);
  if (!uuid && !name) {
    return res.status(400).json({ msg: "A player is required." });
  }

  const list = readList(id, "whitelist.json");
  const remaining = list.filter(
    (entry) => !(uuid ? entry.uuid === uuid : entry.name === name)
  );
  if (remaining.length === list.length) {
    return res.status(404).json({ msg: "That player isn't on the whitelist." });
  }
  writeList(id, "whitelist.json", remaining);

  if (isRunning(id)) {
    runCommand(id, "whitelist reload");
    // A reload doesn't disconnect anyone — enforce-whitelist only acts when
    // the whitelist is switched on. Removing someone who is standing in the
    // world is meant to remove them, so they're kicked explicitly.
    const target = name || (list.find((e) => e.uuid === uuid) || {}).name;
    if (target) runCommand(id, "kick " + target + " You are no longer whitelisted.");
  }

  res.status(200).json({ msg: "Success" });
});

// ---------------------------------------------------------------------------
// POST /kick
// ---------------------------------------------------------------------------

router.post("/kick", function (req, res) {
  if (!auth(req)) return res.status(401).json({ msg: "Invalid credentials." });
  const id = req.params.id;
  const bedrock = bedrockSupport(id);
  const name = sanitizeArg(req.body.name);
  const reason = sanitizeArg(req.body.reason);

  if (!name) return res.status(400).json({ msg: "A player name is required." });
  if (!validPlayerName(name, bedrock.prefix)) {
    return res.status(400).json({ msg: "\"" + name + "\" isn't a valid Minecraft name." });
  }
  // Unlike a ban, a kick has nowhere to be recorded — it only exists as an
  // instruction to a live server process.
  if (!isRunning(id)) {
    return res.status(409).json({ msg: "The server has to be running to kick someone." });
  }

  runCommand(id, reason ? "kick " + name + " " + reason : "kick " + name);
  res.status(200).json({ msg: "Success" });
});

// ---------------------------------------------------------------------------
// POST /ban
// ---------------------------------------------------------------------------

router.post("/ban", function (req, res) {
  if (!auth(req)) return res.status(401).json({ msg: "Invalid credentials." });
  const id = req.params.id;
  const bedrock = bedrockSupport(id);
  const name = sanitizeArg(req.body.name);
  const uuid = sanitizeArg(req.body.uuid);
  const reason = sanitizeArg(req.body.reason) || "Banned by an operator.";

  if (!name) return res.status(400).json({ msg: "A player name is required." });
  if (!validPlayerName(name, bedrock.prefix)) {
    return res.status(400).json({ msg: "\"" + name + "\" isn't a valid Minecraft name." });
  }

  if (isRunning(id)) {
    // `ban` writes banned-players.json *and* disconnects the player with the
    // reason shown on their screen. Doing this by file edit would leave them
    // playing until they next logged out.
    runCommand(id, "ban " + name + " " + reason);
    return res.status(200).json({ msg: "Success" });
  }

  // Offline: the entry has to be built by hand, in the exact shape the server
  // expects, or it discards the file on the next boot.
  if (!uuid) {
    return res.status(400).json({
      msg: "That player hasn't joined this server, so they can only be banned while it's running.",
    });
  }
  const list = readList(id, "banned-players.json");
  if (list.some((entry) => entry.uuid === uuid)) {
    return res.status(200).json({ msg: "Already banned" });
  }
  list.push({
    uuid,
    name,
    created: mcTimestamp(new Date()),
    source: "Arth Panel",
    expires: "forever",
    reason,
  });
  writeList(id, "banned-players.json", list);
  res.status(200).json({ msg: "Success" });
});

// ---------------------------------------------------------------------------
// POST /unban
// ---------------------------------------------------------------------------

router.post("/unban", function (req, res) {
  if (!auth(req)) return res.status(401).json({ msg: "Invalid credentials." });
  const id = req.params.id;
  const bedrock = bedrockSupport(id);
  const name = sanitizeArg(req.body.name);
  const uuid = sanitizeArg(req.body.uuid);
  const ip = sanitizeArg(req.body.ip);

  // An IP ban is a separate list with its own pardon command. The panel never
  // creates these, but a server that has them needs a way to clear them or
  // they're invisible and permanent from the panel's point of view.
  if (ip) {
    if (isRunning(id)) {
      runCommand(id, "pardon-ip " + ip);
    } else {
      writeList(
        id,
        "banned-ips.json",
        readList(id, "banned-ips.json").filter((entry) => entry.ip !== ip)
      );
    }
    return res.status(200).json({ msg: "Success" });
  }

  if (!name && !uuid) return res.status(400).json({ msg: "A player is required." });

  if (isRunning(id)) {
    if (!validPlayerName(name, bedrock.prefix)) {
      return res.status(400).json({ msg: "\"" + name + "\" isn't a valid Minecraft name." });
    }
    // `pardon` resolves the name against the ban list itself rather than
    // Mojang, so it works for Bedrock entries too.
    runCommand(id, "pardon " + name);
    return res.status(200).json({ msg: "Success" });
  }

  const list = readList(id, "banned-players.json");
  const remaining = list.filter(
    (entry) => !(uuid ? entry.uuid === uuid : entry.name === name)
  );
  if (remaining.length === list.length) {
    return res.status(404).json({ msg: "That player isn't banned." });
  }
  writeList(id, "banned-players.json", remaining);
  res.status(200).json({ msg: "Success" });
});

module.exports = router;
