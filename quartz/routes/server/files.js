const express = require("express");
const router = express.Router({ mergeParams: true }); 
const files = require("../../scripts/files.js");
const f = require("../../scripts/mc.js");
const path = require("path");
const utils = require("../../scripts/utils.js");
const multer = require("multer");
const upload = multer({ dest: "assets/uploads/" });
const readJSON = require("../../scripts/utils.js").readJSON;
const data = readJSON("assets/data.json");
const JsDiff = require("diff");
const config = require("../../scripts/utils.js").getConfig();
const ftp = require("../../scripts/ftp.js");
const exec = require("child_process").exec;
const fs = require("fs");
const writeJSON = require("../../scripts/utils.js").writeJSON;
const enableVirusScan = JSON.parse(config.enableVirusScan);
const backups = require("../../scripts/backups.js");
const security = require("../../scripts/security.js");

// A missing server directory is a different failure from a bad token, but every
// route used to collapse both into a single 401. Code 101 matches the vocabulary
// /api/info/servers already uses for a server that isn't provisioned here.
// Both fields are sent because most clients read `msg` while the extract
// route's NDJSON client reads `error`.
const invalidCredentials = (res) =>
  res
    .status(401)
    .json({ msg: "Invalid credentials.", error: "Invalid credentials." });
const serverMissing = (res) =>
  res.status(404).json({
    msg: "Server not found.",
    code: 101,
    error: "This server no longer exists.",
  });

// Shared auth + existence gate for every token-protected route. Returns true if
// the caller may proceed; otherwise it has already sent the response.
//
// Ordering matters: a server whose directory is gone has no server.json, so
// hasAccess() can't confirm ownership and used to report 401 for the legitimate
// owner. When the id is in the caller's own claimed slots (or we're in solo
// mode) that case is reported as 404/101 instead — the signal the frontend
// needs to say "this server hasn't been created yet."
function guard(req, res) {
  const id = req.params.id;
  const account = readJSON("accounts/" + req.headers.username + ".json");

  if (!fs.existsSync(`servers/${id}/`)) {
    const solo = config.mode === "solo";
    const owns =
      account &&
      Array.isArray(account.servers) &&
      account.servers.map(String).includes(String(id)) &&
      req.headers.token === account.token;
    if (solo || owns) {
      serverMissing(res);
    } else {
      invalidCredentials(res);
    }
    return false;
  }

  if (!utils.hasAccess(req.headers.token, account, id)) {
    invalidCredentials(res);
    return false;
  }
  return true;
}

// getFileAccessKey throws when the server wasn't present at the last key refresh.
const fileKeyMatches = (serverId, key) => {
  try {
    return key !== undefined && key === security.getFileAccessKey(serverId);
  } catch (e) {
    console.log("No file access key for server " + serverId + ": " + e);
    return false;
  }
};

// Resolve a client-supplied path against the server root, refusing anything that
// escapes it or targets the root itself.
//
// sanitizePath splits on path.sep, so it never inspects the segments of a
// "*"-joined path — "*..*..*etc*passwd" survives it intact. The resolve +
// containment check below is what actually enforces the boundary.
function resolveInServer(serverId, rawPath, { allowRoot = false } = {}) {
  if (typeof rawPath !== "string") return null;
  const sanitized = utils.sanitizePath(rawPath);
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

router.post("/delete/:path", function (req, res) {
  const email = req.headers.username;
  const folder = req.query.folder === "true"; // check if this is a folder deletion

  if (!guard(req, res)) return;

  const resolved = resolveInServer(req.params.id, req.params.path);
  if (resolved === null) {
    return res.status(400).json({ msg: "Invalid path." });
  }
  const { relPath, fullPath } = resolved;
  console.log("DELETING " + fullPath + " " + email);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ msg: "That file no longer exists." });
  }

  const isDirectory = fs.lstatSync(fullPath).isDirectory();

  if (folder) {
    // FOLDER DELETE
    if (!isDirectory) {
      return res.status(400).json({ msg: "That path isn't a folder." });
    }
    exec(`rm -rf "${fullPath}"`, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({
          msg: "Couldn't delete the folder. Stop the server and try again.",
        });
      }
      return res.status(200).json({ msg: "Done" });
    });
  } else {
    // FILE DELETE
    if (isDirectory) {
      return res.status(400).json({ msg: "That path is a folder, not a file." });
    }
    if (path.basename(relPath) === "server.json") {
      return res
        .status(400)
        .json({ msg: "This is a system file and can't be deleted." });
    }
    try {
      fs.unlinkSync(fullPath);
    } catch (err) {
      // EPERM/EBUSY when a running server holds the file open.
      console.error("Delete error:", err);
      return res.status(500).json({
        msg: "Couldn't delete the file. Stop the server and try again.",
      });
    }
    return res.status(200).json({ msg: "Done" });
  }
});

router.post("/extract/:path", function (req, res) {
  if (!guard(req, res)) return;
  {
    const resolved = resolveInServer(req.params.id, req.params.path);
    if (resolved === null) {
      return res
        .status(400)
        .json({ msg: "Invalid path.", error: "Invalid path." });
    }
    const { relPath, fullPath } = resolved;
    const filename = path.basename(relPath);
    if (fs.existsSync(fullPath) && filename.includes(".zip")) {
      //unzip the file and put it in /servers/id/{filename}
      const spawn = require("child_process").spawn;
      const srcPath = fullPath;
      const destPath = `servers/${req.params.id}/${relPath.split(".zip")[0]}`;
      console.log(`unzip -o "${srcPath}" -d "${destPath}"`);

      // Stream newline-delimited JSON progress events so the client can render
      // an accurate progress bar. Progress is derived from unzip's own output,
      // not estimated.
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-Accel-Buffering", "no"); // don't let a proxy buffer the stream

      // Emit an error event (and close the stream). Always uses an `error`
      // field so the client can surface it regardless of which step failed.
      const sendError = (message) => {
        if (res.writableEnded) return;
        res.write(JSON.stringify({ error: message }) + "\n");
        res.end();
      };

      // If the client navigates away or closes the modal, stop unzipping
      // instead of leaving an orphaned process writing to a dead socket.
      let activeChild = null;
      res.on("close", () => {
        if (activeChild && !activeChild.killed) activeChild.kill();
      });

      // Step 1: count the archive's members. `unzip -Z -1` prints one member
      // (file or directory) per line, which is the real total to extract.
      let listBuffer = "";
      let listErr = "";
      const lister = spawn("unzip", ["-Z", "-1", srcPath]);
      activeChild = lister;
      lister.stdout.on("data", (chunk) => (listBuffer += chunk.toString()));
      lister.stderr.on("data", (chunk) => (listErr += chunk.toString()));
      lister.on("error", (err) => {
        console.log(err);
        sendError(
          "Couldn't read the archive — is the `unzip` command installed on the host?"
        );
      });
      lister.on("close", (listCode) => {
        if (listCode !== 0) {
          console.log("unzip -Z exited with code " + listCode + ": " + listErr);
          sendError(
            "Couldn't read the archive (it may be corrupt or not a valid zip)."
          );
          return;
        }

        const total = listBuffer
          .split("\n")
          .filter((l) => l.trim().length > 0).length;

        // Step 2: extract (without -q) so unzip prints one line per member as
        // it processes it. We count those lines to track real progress.
        const unzip = spawn("unzip", ["-o", srcPath, "-d", destPath]);
        activeChild = unzip;
        // matches "  inflating: x", "  extracting: x" (stored), " creating: x/" (dir)
        const memberLine = /^\s*(inflating|extracting|creating):/;
        let extracted = 0;
        let lineBuffer = "";
        let errBuffer = "";

        unzip.stdout.on("data", (chunk) => {
          lineBuffer += chunk.toString();
          let nl;
          while ((nl = lineBuffer.indexOf("\n")) !== -1) {
            const line = lineBuffer.slice(0, nl);
            lineBuffer = lineBuffer.slice(nl + 1);
            if (memberLine.test(line)) {
              extracted++;
              const progress =
                total > 0
                  ? Math.min(100, Math.round((extracted / total) * 100))
                  : 0;
              res.write(JSON.stringify({ extracted, total, progress }) + "\n");
            }
          }
        });
        unzip.stderr.on("data", (chunk) => (errBuffer += chunk.toString()));

        unzip.on("error", (err) => {
          console.log(err);
          sendError("Failed to start the extraction process.");
        });
        unzip.on("close", (code) => {
          if (code === 0) {
            if (res.writableEnded) return;
            res.write(
              JSON.stringify({ msg: "Done", extracted, total, progress: 100 }) +
                "\n"
            );
            res.end();
          } else {
            console.log("unzip exited with code " + code + ": " + errBuffer);
            // unzip uses exit code 50 when it runs out of disk space.
            const reason =
              code === 50
                ? "Ran out of disk space while extracting."
                : (errBuffer.trim().split("\n").pop() ||
                    "Extraction failed (code " + code + ").");
            sendError(reason);
          }
        });
      });
    } else {
      res
        .status(400)
        .json({ msg: "Invalid request.", error: "File not found or not a .zip archive." });
    }
  }
});

router.post("/compress/:path", (req, res) => {
  let email = req.headers.username;
  let token = req.headers.token;
  let account = readJSON("accounts/" + email + ".json");
  let serverId = req.params.id;
  if (
    utils.hasAccess(token, account, req.params.id) &&
    fs.existsSync(`servers/${req.params.id}/`)
  ) {
    // Sanitize and normalize the requested path
    let folderPath = utils.sanitizePath(rawPath);
    if (folderPath.includes("*")) {
      folderPath = folderPath.split("*").join("/");
    }

    const fullFolder = `servers/${serverId}/${folderPath}`;
    const folderName = folderPath.split("/").pop();
    const zipName = `${folderName}.zip`;
    const fullZip = `servers/${serverId}/${zipName}`;

    // Ensure the target is a directory
    if (fs.existsSync(fullFolder) && fs.lstatSync(fullFolder).isDirectory()) {
      // Build and run the zip command
      // -r : recurse into directories, -j: junk the paths inside zip if you prefer flat structure
      const cmd = `zip -r "${fullZip}" "${folderName}"`;
      console.log(`cd servers/${serverId} && ${cmd}`);

      exec(cmd, { cwd: `servers/${serverId}` }, (err, stdout, stderr) => {
        if (err) {
          console.error("zip error:", stderr || err);
          return res.status(500).json({ msg: "Compression failed." });
        }
        return res.status(200).json({ msg: "Done", zip: zipName });
      });
    } else {
      return res.status(400).json({ msg: "Invalid folder path." });
    }
  } else {
    return res.status(401).json({ msg: "Invalid credentials." });
  }
});

router.post("/rename", function (req, res) {
  // 1) check access & server directory exists
  if (!guard(req, res)) return;

  if (typeof req.body.from !== "string" || typeof req.body.to !== "string") {
    return res.status(400).json({ msg: "Invalid new name." });
  }

  let from = utils.sanitizePath(req.body.from);
  let to   = utils.sanitizePath(req.body.to);
  if (from === "invalid" || to === "invalid") {
    return res.status(400).json({ msg: "Invalid path." });
  }

  // normalize any “*” placeholder back to slashes before deriving the basename,
  // otherwise basename("config*server.json") never matches the forbidden list
  from = from.includes("*") ? from.split("*").join("/") : from;

  // disallow attempts to rename core files
  const forbidden = ["server.json", "server.jar", "modrinth.index.json", "curseforge.index.json"];
  if (forbidden.includes(path.basename(from)) ||
      forbidden.includes(path.basename(to))) {
    return res.status(400).json({ msg: "System files can't be renamed." });
  }

  // only allow a single name in “to” (no sub-dirs). sanitizePath rewrites "/"
  // to the platform separator, so guard against a backslash too.
  if (to.includes("/") || to.includes("\\") || to.includes("*") || to.trim() === "") {
    return res.status(400).json({ msg: "Names can't contain / or *." });
  }

  const serverRoot = path.resolve(`servers/${req.params.id}`);
  const srcPath    = path.resolve(serverRoot, from);
  const destPath   = path.resolve(serverRoot, path.dirname(from), to);

  // 2) ensure both paths are still under the server folder
  if (!srcPath.startsWith(serverRoot + path.sep) ||
      !destPath.startsWith(serverRoot + path.sep)) {
    return res.status(400).json({ msg: "Invalid path." });
  }

  // 3) ensure src exists and dest doesn’t
  if (!fs.existsSync(srcPath)) {
    return res.status(404).json({ msg: "This item no longer exists." });
  }
  if (fs.existsSync(destPath)) {
    return res.status(409).json({ msg: "A file or folder with that name already exists." });
  }

  // 4) perform the rename
  try {
    fs.renameSync(srcPath, destPath);
    return res.status(200).json({ msg: "Rename successful." });
  } catch (err) {
    // EBUSY/EACCES when a running server holds the file open.
    console.error("Rename error:", err);
    return res.status(500).json({ msg: "Rename failed on the server. Try again." });
  }
});

// Lets the client mint a fresh download URL. Access keys rotate every 6 hours
// (and on restart), so the copy in localStorage goes stale and every download
// link built from it 401s.
router.get("/key", function (req, res) {
  if (!guard(req, res)) return;
  try {
    return res.status(200).json({ key: security.getFileAccessKey(req.params.id) });
  } catch (e) {
    // The server exists but wasn't present at the last key refresh.
    security.refreshKeys();
    try {
      return res.status(200).json({ key: security.getFileAccessKey(req.params.id) });
    } catch (e2) {
      console.log("Could not mint file access key for " + req.params.id + ": " + e2);
      return res.status(500).json({ msg: "Couldn't create a download link." });
    }
  }
});

router.get("/download/:path", function (req, res) {
  if (!fileKeyMatches(req.params.id, req.query.key)) {
    return res
      .status(401)
      .json({ msg: "Your download link expired. Refresh the page and try again." });
  }
  if (!fs.existsSync(`servers/${req.params.id}/`)) {
    return serverMissing(res);
  }

  const resolved = resolveInServer(req.params.id, req.params.path);
  if (resolved === null) {
    return res.status(400).json({ msg: "Invalid path." });
  }
  const { relPath, fullPath } = resolved;

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ msg: "This file no longer exists." });
  }

  if (fs.statSync(fullPath).isDirectory()) {
    //zip the folder and send it to the client
    const zipName = `${relPath.split("/").join("*")}.zip`;
    const zipPath = `servers/${req.params.id}/${zipName}`;
    console.log(`zip -r -q -X ./${zipName} "${relPath}" -x "${relPath}"`);
    exec(
      `zip -r -q -X ./${zipName} "${relPath}" -x "${relPath}"`,
      { cwd: `servers/${req.params.id}/` },
      (err) => {
        // `zip` missing from the host, or the disk filled up mid-archive. Both
        // used to fall through to res.download of a file that isn't there.
        if (err || !fs.existsSync(zipPath)) {
          console.error("zip error:", err);
          return res
            .status(500)
            .json({ msg: "Couldn't package the folder for download." });
        }

        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename=${zipName}`);
        res.status(200).download(zipPath, zipName, () => {
          try {
            fs.unlinkSync(zipPath);
          } catch (e) {
            console.log(e);
          }
        });
      }
    );
  } else {
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${path.basename(relPath)}`
    );
    res.status(200).download(fullPath);
  }
});

router.post(
  "/upload/:path",
  upload.single("file"),
  function (req, res) {
    // Discard the temp file on any rejection so a failed upload doesn't leak
    // into assets/uploads/.
    const discardTemp = () => {
      try {
        if (req.file && fs.existsSync(req.file.path)) fs.rmSync(req.file.path);
      } catch (e) {
        console.log(e);
      }
    };

    if (!guard(req, res)) {
      discardTemp();
      return;
    }
    if (!req.file) {
      return res.status(400).json({ msg: "No file was uploaded." });
    }

    const filename = req.query.filename;
    // "*" is the server root, which is a legitimate upload target.
    const resolved = resolveInServer(req.params.id, req.params.path, {
      allowRoot: true,
    });
    if (
      resolved === null ||
      typeof filename !== "string" ||
      filename === "" ||
      filename.includes("/") ||
      filename.includes("\\") ||
      filename.includes("..")
    ) {
      discardTemp();
      return res.status(400).json({ msg: "Invalid upload path." });
    }

    const destDir = resolved.fullPath;
    if (!fs.existsSync(destDir) || !fs.lstatSync(destDir).isDirectory()) {
      discardTemp();
      return res
        .status(404)
        .json({ msg: "The destination folder no longer exists." });
    }

    if (enableVirusScan) {
      exec(
        `clamdscan --multiscan --fdpass ${req.file.path}`,
        {},
        (err, stdout, stderr) => {
          if (stdout && stdout.indexOf("Infected files: 0") != -1) {
            loadFile();
            return;
          }
          discardTemp();
          // clamdscan exits 1 for an infected file and 2 when it can't run at
          // all (daemon down, socket missing). Treating both as "virus" told
          // users their file was infected when the scanner simply wasn't up.
          if (err && err.code !== 1) {
            console.error("clamdscan unavailable:", stderr || err);
            return res
              .status(503)
              .json({ msg: "Upload blocked: virus scan couldn't run." });
          }
          return res.status(422).json({ msg: "Virus Detected." });
        }
      );
    } else {
      loadFile();
    }

    function loadFile() {
      try {
        fs.copyFileSync(req.file.path, destDir + "/" + filename);
      } catch (e) {
        console.error("Upload copy error:", e);
        discardTemp();
        return res.status(500).json({ msg: "Couldn't save the uploaded file." });
      }
      discardTemp();
      res.status(200).json({ msg: "Upload Complete." });
    }
  }
);

router.get("/", async function (req, res) {
  // Both branches used to fall through without sending anything, leaving the
  // client's file tree spinner up until the socket timed out.
  if (!guard(req, res)) return;

  try {
    const fileTree = await files.readFilesRecursiveAsync(`servers/${req.params.id}/`);
    res.status(200).json(fileTree);
  } catch (err) {
    console.error("Error reading file tree:", err);
    res.status(500).json({ msg: "Failed to read file tree." });
  }
});

router.get("/read/:path", function (req, res) {
  if (!guard(req, res)) return;

  const resolved = resolveInServer(req.params.id, req.params.path);
  if (resolved === null) {
    return res.status(400).json({ msg: "Invalid path." });
  }
  const { relPath, fullPath } = resolved;

  // Used to answer `200 []`, so the client read `data.content` off undefined.
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ msg: "This file no longer exists." });
  }

  if (fs.lstatSync(fullPath).isDirectory()) {
    return res.status(400).json({ msg: "This is a folder, not a file." });
  }

  // These used to come back as 200 with the message *as the file content*, which
  // meant the editor opened on it and Save would overwrite the real file.
  const extension = relPath.split(".")[relPath.split(".").length - 1];
  if (["png", "jpg", "jpeg", "gif", "webp", "ico", "svg"].includes(extension)) {
    return res.status(415).json({ msg: "Image files can't be edited or viewed." });
  }
  if (["jar", "exe", "sh", "zip", "gz", "class", "dat"].includes(extension)) {
    return res.status(415).json({ msg: "Binary files can't be edited or viewed." });
  }
  if (fs.statSync(fullPath).size > 500000) {
    return res
      .status(413)
      .json({ msg: "This file is too large to edit (500KB limit)." });
  }

  try {
    return res.status(200).json({ content: fs.readFileSync(fullPath, "utf8") });
  } catch (err) {
    console.error("Read error:", err);
    return res.status(500).json({ msg: "Couldn't read the file." });
  }
});

router.post("/write/:path", function (req, res) {
  if (!guard(req, res)) return;

  // Every one of these used to be a bare "Invalid request." that the editor
  // silently swallowed, so a failed save looked identical to a successful one.
  if (req.body.content === undefined) {
    return res.status(400).json({ msg: "No content was sent." });
  }

  const resolved = resolveInServer(req.params.id, req.params.path);
  if (resolved === null) {
    return res.status(400).json({ msg: "Invalid path." });
  }
  const { relPath, fullPath } = resolved;
  const filename = path.basename(relPath);

  if (!fs.existsSync(fullPath)) {
    return res
      .status(404)
      .json({ msg: "Couldn't save — the file no longer exists on the server." });
  }
  if (["server.json", "modrinth.index.json", "curseforge.index.json"].includes(filename)) {
    return res.status(400).json({ msg: "This is a system file and can't be edited." });
  }
  if (Buffer.byteLength(req.body.content, "utf8") > 500000) {
    return res
      .status(413)
      .json({ msg: "Couldn't save — the file exceeds the 500KB edit limit." });
  }

  try {
    fs.writeFileSync(fullPath, req.body.content);
  } catch (err) {
    console.error("Write error:", err);
    return res.status(500).json({ msg: "Couldn't save the file. Try again." });
  }
  return res.status(200).json({ msg: "Done" });
});

//route to download main folder
router.get("/mainfolder", function (req, res) {
  // A bad key used to fall out of the handler without a response, hanging the
  // browser's download until it timed out.
  if (!fileKeyMatches(req.params.id, req.query.key)) {
    return res
      .status(401)
      .json({ msg: "Your download link expired. Refresh the page and try again." });
  }
  if (!fs.existsSync(`servers/${req.params.id}/`)) {
    return serverMissing(res);
  }

  const zipName = `${req.params.id}.zip`;
  const zipPath = `servers/${req.params.id}/${zipName}`;

  exec(`zip -r -q -X ${zipName} .`, { cwd: `servers/${req.params.id}` }, (err) => {
    if (err || !fs.existsSync(zipPath)) {
      console.error("zip error:", err);
      return res
        .status(500)
        .json({ msg: "Couldn't package the server for download." });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=${zipName}`);
    res.status(200).download(zipPath, zipName, () => {
      try {
        fs.unlinkSync(zipPath);
      } catch (e) {
        console.log(e);
      }
    });
  });
});

module.exports = router;