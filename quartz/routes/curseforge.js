const express = require("express");
const Router = express.Router();
const config = require("../scripts/utils.js").getConfig();
const apiKey = config.curseforgeKey;

// CurseForge's own modLoaderType filter is loose - it returns a pack if ANY
// file the project has ever published matches, not just the file(s) for the
// requested loader. That lets a pack like "Better MC [FABRIC]" show up in a
// Forge search just because one old build happened to also carry a Forge tag.
// Only Forge (1) and Fabric (4) are handled - CurseForge doesn't reliably tag
// NeoForge (6) or unspecified files, so a strict same/opposite check there
// would throw away results that are actually fine.
const OPPOSITE_LOADER = { 1: 4, 4: 1 };

// Drops a result if it has at least one file tagged with the opposite loader
// and none tagged with the one actually requested - i.e. the "match" was
// incidental, not the pack's real loader.
function filterByLoader(data, modLoaderType) {
  // modLoaderType arrives as whatever req.query.loader was ("1", 1, ...) -
  // normalize to a number so the strict === below against CurseForge's
  // numeric modLoader field actually matches.
  const requested = Number(modLoaderType);
  const opposite = OPPOSITE_LOADER[requested];
  if (opposite === undefined || !Array.isArray(data.data)) return data;

  data.data = data.data.filter((mod) => {
    const indexes = mod.latestFilesIndexes;
    if (!Array.isArray(indexes)) return true;
    const hasOpposite = indexes.some((f) => f.modLoader === opposite);
    const hasRequested = indexes.some((f) => f.modLoader === requested);
    return !(hasOpposite && !hasRequested);
  });

  // Deliberately not re-paging to top the count back up to what was asked
  // for: doing that would mean fetching CurseForge's next index internally,
  // which the frontend's own index/offset (unchanged here) wouldn't know
  // about — the next "load more" would re-request that same now-consumed
  // index and show duplicates. Passing index/pageSize straight through to
  // CurseForge like this instead keeps every page mapped 1:1 to a fixed,
  // disjoint slice of CurseForge's ranking, so a short page (< pageSize)
  // just means fewer results were genuinely this loader, not something
  // that will collide with the next page's results.
  //
  // resultCount still needs correcting to match, though — it's CurseForge's
  // count of what THEY returned, not what survived this filter, and left
  // alone would overstate data.data.length to anything reading it. totalCount
  // is left as-is: it counts matches across the whole result set, most of
  // which was never fetched here to filter.
  if (data.pagination) {
    data.pagination.resultCount = data.data.length;
  }
  return data;
}

Router.get("/search", (req, res) => {
  if (apiKey != "") {
    let gameVersion = req.query.version;
    if (gameVersion.includes(".0")) {
      gameVersion = gameVersion.replace(".0", "");
    }
    let modLoaderType = req.query.loader;

    if (typeof modLoaderType != "number") {
      if (modLoaderType == "forge") {
        modLoaderType = 1;
      } else if (modLoaderType == "fabric") {
        modLoaderType = 4;
      } else if (modLoaderType == "neoforge") {
        modLoaderType = 6;
      } 
    }
    let filterText = encodeURIComponent(req.query.query || "");
    let classId = req.query.classId;
    let index = req.query.index || 0;
    let sortField = req.query.sortField || 1;
    let results = [];
    let categories = req.query.categories || "";

    const exec = require("child_process").exec;

    console.log(`curseforge request ?gameId=432&gameVersion=${gameVersion}&modLoaderType=${modLoaderType}&searchFilter=${filterText}&classId=${classId}&index=${index}&pageSize=15&sortField=${sortField}&sortOrder=desc&categoryIds=${categories}`);

    exec(
      `curl -X GET "https://api.curseforge.com/v1/mods/search` +
        `?gameId=432` +
        `&gameVersion=${gameVersion}` +
        `&modLoaderType=${modLoaderType}` +
        `&searchFilter=${filterText}` +
        `&classId=${classId}` +
        `&index=${index}` +
        `&pageSize=15` +
        `&sortField=${sortField}` +
        `&sortOrder=desc` +
        `&categoryIds=${categories}"` +
        ` -H 'x-api-key: ${apiKey}'`,
      (error, stdout, stderr) => {
        if (!error && stdout != undefined) {
          try {
            const data = filterByLoader(JSON.parse(stdout), modLoaderType);
            res.status(200).json(data);
          } catch {
            res.status(400).json({ msg: "Error parsing JSON." });
          }
        } else {
          res.status(500).json({ msg: "Internal server error." });
        }
      }
    );
  }
});

// Curated list of Forge-only modpacks (see modpackChecker.js) — the frontend's
// version picker uses this to treat an untagged file as Forge-compatible when
// the pack itself is known Forge-only, instead of shunting it into the
// "no software specified" section. Not behind verifyAdmin: every user picking
// a modpack version needs this, not just admins.
Router.get("/forgeonly", (req, res) => {
  const modpackChecker = require("../scripts/modpackChecker.js");
  res.json(modpackChecker.getForgeOnlyModpacks());
});

Router.get("/:id", (req, res) => {
  if (apiKey != "") {
    let id = req.params.id;
    const exec = require("child_process").exec;
    exec(
      `curl -X GET "https://api.curseforge.com/v1/mods/${id}"` +
        ` -H 'x-api-key: ${apiKey}'`,
      (error, stdout, stderr) => {
        if (!error && stdout != undefined) {
          try {
            res.status(200).json(JSON.parse(stdout).data);
          } catch {
            res.status(400).json({ msg: "Error parsing JSON." });
          }
        } else {
          res.status(500).json({ msg: "Internal server error." });
        }
      }
    );
  }
});

Router.get("/:id/description", (req, res) => {
  if (apiKey != "") {
    let id = req.params.id;
    const exec = require("child_process").exec;
    exec(
      `curl -X GET "https://api.curseforge.com/v1/mods/${id}/description"` +
        ` -H 'x-api-key: ${apiKey}'`,
      (error, stdout, stderr) => {
        if (!error && stdout != undefined) {
          try {
            res.status(200).json(JSON.parse(stdout).data);
          } catch {
            res.status(400).json({ msg: "Error parsing JSON." });
          }
        } else {
          res.status(500).json({ msg: "Internal server error." });
        }
      }
    );
  }
});

Router.get("/:id/versions", (req, res) => {
  if (apiKey != "") {
    let id = req.params.id;
    let indexString = "";
    if (req.query.index != undefined) {
      indexString = "?index=" + req.query.index;
    }
    const exec = require("child_process").exec;
    exec(
      `curl -X GET "https://api.curseforge.com/v1/mods/${id}/files${indexString}"` +
        ` -H 'x-api-key: ${apiKey}'`,
      (error, stdout, stderr) => {
        if (!error && stdout != undefined) {
          try {
            res.status(200).json(JSON.parse(stdout).data);
          } catch {
            res.status(400).json({ msg: "Error parsing JSON." });
          }
        } else {
          res.status(500).json({ msg: "Internal server error." });
        }
      }
    );
  }
});

Router.get("/:id/version/:versionId/changelog", (req, res) => {
  if (apiKey != "") {
    let id = req.params.id;
    let versionId = req.params.versionId;
    const exec = require("child_process").exec;
    exec(
      `curl -X GET "https://api.curseforge.com/v1/mods/${id}/files/${versionId}/changelog"` +
        ` -H 'x-api-key: ${apiKey}'`,
      (error, stdout, stderr) => {
        if (!error && stdout != undefined) {
          try {
            res.status(200).json(JSON.parse(stdout).data);
          } catch {
            res.status(400).json({ msg: "Error parsing JSON." });
          }
        } else {
          res.status(500).json({ msg: "Internal server error." });
        }
      }
    );
  }
});

Router.get("/:id/version/:versionId/", (req, res) => {
  if (apiKey != "") {
    let id = req.params.id;
    let versionId = req.params.versionId;
    const exec = require("child_process").exec;
    exec(
      `curl -X GET "https://api.curseforge.com/v1/mods/${id}/files/${versionId}/"` +
        ` -H 'x-api-key: ${apiKey}'`,
      (error, stdout, stderr) => {
        if (!error && stdout != undefined) {
          try {
            res.status(200).json(JSON.parse(stdout).data);
          } catch {
            res.status(400).json({ msg: "Error parsing JSON." });
          }
        } else {
          res.status(500).json({ msg: "Internal server error." });
        }
      }
    );
  }
});
module.exports = Router;
