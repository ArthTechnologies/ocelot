const path = require("path");

// Works out which file a console call came from, so the panel console can tag
// every line — "[mc]", "[info]", "[server/files]" — and be readable when a
// dozen subsystems are talking at once.
//
// The tag is derived from the call site rather than passed in by each module,
// so every existing script and route is covered and new ones are too, with
// nothing to remember to add. run.js owns the actual console wrapping (it
// already had one for timestamps); this just supplies the tag.

const ROOT = path.resolve(__dirname, "..");
const SELF = __filename;

// Turn an absolute path into a short, stable tag.
//   scripts/mc.js             -> mc
//   routes/info.js            -> info
//   routes/server/files.js    -> server/files
//   routes/server/index.js    -> server
//   run.js                    -> quartz
//   node_modules/foo/lib/a.js -> foo
function tagFor(filename) {
  if (!filename) return "quartz";

  const marker = "node_modules" + path.sep;
  const nodeModules = filename.lastIndexOf(marker);
  if (nodeModules !== -1) {
    return filename.slice(nodeModules + marker.length).split(path.sep)[0];
  }

  const relative = path.relative(ROOT, filename);
  // Outside the project entirely (node internals, REPL, eval).
  if (relative.startsWith("..") || path.isAbsolute(relative)) return "quartz";

  const parts = relative.split(path.sep);
  const base = parts.pop().replace(/\.[cm]?js$/, "");

  if (parts.length === 0) return base === "run" ? "quartz" : base;

  const group = parts[0]; // "scripts" or "routes"
  const nested = parts.slice(1); // e.g. ["server"]

  // index.js says nothing on its own — name it after its folder.
  if (base === "index") return nested.length > 0 ? nested.join("/") : group;

  return nested.concat(base).join("/");
}

// Tag for whoever called the console wrapper. `boundaryFn` must be the wrapper
// itself so its own frame is left out of the stack.
function callerTag(boundaryFn) {
  const previousPrepare = Error.prepareStackTrace;
  const previousLimit = Error.stackTraceLimit;

  try {
    // Structured frames — avoids formatting a stack string just to re-parse it.
    Error.prepareStackTrace = (_, frames) => frames;
    Error.stackTraceLimit = 6;

    const holder = {};
    Error.captureStackTrace(holder, boundaryFn || callerTag);

    for (const frame of holder.stack || []) {
      const filename = frame.getFileName && frame.getFileName();
      if (!filename || filename === SELF) continue;
      if (filename.startsWith("node:")) continue;
      return tagFor(filename);
    }
    return "quartz";
  } catch (err) {
    // Never let logging throw.
    return "quartz";
  } finally {
    Error.prepareStackTrace = previousPrepare;
    Error.stackTraceLimit = previousLimit;
  }
}

module.exports = { callerTag, tagFor };
