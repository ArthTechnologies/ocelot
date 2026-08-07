const express = require("express");
const router = express.Router();

// Public, unauthenticated read-only view of the automated modpack boot-check
// results — trimmed to just what the "verified" badge on a modpack search
// result needs. GET /admin/modpack-checks carries the same data plus console
// tails and per-mod debug stats meant for support/QA; that stays behind
// verifyAdmin. This route exposes nothing sensitive, so it isn't gated.
router.get("/", (req, res) => {
  try {
    const modpackChecker = require("../scripts/modpackChecker.js");
    const data = modpackChecker.readLog();
    const results = (data.results || []).map((r) => ({
      platform: r.platform,
      projectId: r.projectId,
      gameVersion: r.gameVersion,
      status: r.status,
      checkedAt: r.checkedAt,
    }));
    res.json({ results });
  } catch (err) {
    console.error("Error reading modpack checks:", err);
    res.status(500).json({ error: "Failed to read modpack checks" });
  }
});

module.exports = router;
