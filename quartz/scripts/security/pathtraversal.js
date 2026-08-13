const path = require("path");

// ---------------------------------------------------------------------------
// Path-traversal-safe filesystem path building.
//
// Every path traversal found in the panel's security review came from the
// same root cause as the RCE ones in rce.js: a filesystem path built by
// concatenating a template string with unsanitized input, then handed
// straight to fs.*. Unlike a shell, fs calls don't need special characters
// to be dangerous - "../" is enough, and "prefix:" + userInput + ".json"
// does NOT stop userInput from escaping "prefix:", because a leading ".."
// in userInput just pops "prefix:.." off the path during normalization
// regardless of what's in that segment. There is no string prefix that
// makes concatenation safe; the value has to be validated or the resulting
// path has to be checked for containment after resolution.
// ---------------------------------------------------------------------------

// Collapses a "/"-delimited relative path to a safe form: no null bytes, no
// ".." segments, never absolute. This alone isn't a containment guarantee -
// it only inspects "/"-separated segments, so input using a different join
// convention (see resolveInServer's "*" handling below) can smuggle ".."
// straight through it. Pair with resolveWithin()/resolveInServer() for an
// actual boundary check.
function sanitizePath(userInput) {
  if (typeof userInput !== "string") return "invalid";

  // Step 1: Block null bytes (common in attacks)
  if (userInput.includes("\0")) {
    console.log("null byte blocked: " + userInput);
    return "invalid";
  }

  // Step 2: Normalize the path to resolve `..` and `.`
  const normalized = path.normalize(userInput);

  // Step 3: Split into parts and filter out traversal attempts
  const parts = normalized.split(path.sep); // Handles OS-specific separators
  const filteredParts = parts.filter((part) => {
    // Reject empty parts (e.g., from leading/trailing slashes)
    if (part === "") return false;
    // Block parent directory traversal
    if (part === "..") return false;
    return true;
  });

  // Step 4: Rebuild the sanitized path
  const sanitized = filteredParts.join(path.sep);

  // Step 5: Block absolute paths (e.g., /etc/passwd or C:\Windows)
  if (path.isAbsolute(sanitized)) {
    console.log("absolute path blocked: " + sanitized);
    return "invalid";
  }

  return sanitized;
}

// Resolves rawPath against rootDir and refuses anything that would land
// outside rootDir once resolved. This is the actual boundary enforcement -
// the resolve + startsWith check catches what sanitizePath's segment
// filtering alone can miss. Returns the absolute path, or null if the input
// is unsafe. Pass allowRoot: true if rawPath resolving to rootDir itself
// (an empty relative path) is a legitimate case for the caller.
function resolveWithin(rootDir, rawPath, { allowRoot = false } = {}) {
  if (typeof rawPath !== "string") return null;
  const sanitized = sanitizePath(rawPath);
  if (sanitized === "invalid") return null;

  const root = path.resolve(rootDir);
  if (sanitized === "") {
    return allowRoot ? root : null;
  }

  const fullPath = path.resolve(root, sanitized);
  if (fullPath !== root && !fullPath.startsWith(root + path.sep)) return null;
  return fullPath;
}

// Same idea, specialized for the server file manager (routes/server/files.js):
// the client joins path segments with "*" instead of "/", so sanitizePath -
// which only inspects "/"-delimited segments - doesn't see a ".." hidden
// behind an asterisk on its own ("*..*..*etc*passwd" survives it intact).
// The resolve + containment check below is what actually enforces the
// boundary regardless of separator convention. Returns
// { relPath, serverRoot, fullPath }, or null if unsafe.
function resolveInServer(serverId, rawPath, { allowRoot = false } = {}) {
  if (typeof rawPath !== "string") return null;
  const sanitized = sanitizePath(rawPath);
  if (sanitized === "invalid") return null;

  // The client joins paths with "*", and a path rooted at the server directory
  // arrives with a leading one ("*config"). Strip it, or path.resolve treats
  // the result as absolute and every folder delete fails.
  const relPath = (sanitized.includes("*")
    ? sanitized.split("*").join("/")
    : sanitized
  )
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/");

  const serverRoot = path.resolve(`servers/${serverId}`);
  if (relPath === "") {
    // "*" means the server directory itself — only uploads target it.
    return allowRoot ? { relPath, serverRoot, fullPath: serverRoot } : null;
  }

  const fullPath = path.resolve(serverRoot, relPath);
  if (!fullPath.startsWith(serverRoot + path.sep)) return null;
  return { relPath, serverRoot, fullPath };
}

// A "path segment" here is any single untrusted value that must never itself
// carry a path separator or a traversal sequence - an account identifier, a
// mod platform tag, a filename component before it's joined into a larger
// path. Rejecting "/", "\\", ".." and null bytes outright (rather than
// stripping them) means a caller can never end up silently operating on a
// different path than the one it logged/displayed.
function isSafePathSegment(value, { maxLength = 300 } = {}) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !value.includes("..")
  );
}

// Builds the on-disk path for an account file, or null if the identifier
// isn't safe to use in one. `type` is always a fixed literal the caller
// controls ("email", "discord", "google", ...); `identifier` is the
// untrusted part (an email address, a Discord username, ...). Centralizes
// the "accounts/" + type + ":" + identifier + ".json" pattern used
// throughout routes/accounts.js - a caller getting null back should treat it
// exactly like "account not found," never fall back to building the path
// itself.
function accountFilePath(type, identifier) {
  if (!isSafePathSegment(type) || !isSafePathSegment(identifier)) return null;
  return `accounts/${type}:${identifier}.json`;
}

// Same, but for a caller-supplied full key ("email:me@x.com") rather than a
// separate type/identifier pair - used where the request itself names the
// whole account file (e.g. an `accountname` header).
function accountFilePathFromKey(key) {
  if (!isSafePathSegment(key)) return null;
  return `accounts/${key}.json`;
}

module.exports = {
  sanitizePath,
  resolveWithin,
  resolveInServer,
  isSafePathSegment,
  accountFilePath,
  accountFilePathFromKey,
};
