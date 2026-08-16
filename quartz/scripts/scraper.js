const jQuery = require("jquery");
const {JSDOM} = require("jsdom");
const fs = require("fs");
const path = require("path");
const $ = jQuery(new JSDOM().window);
const {exec} = require("child_process");
const files = require("./files.js");

let skipOldVersions = false;

let index = {};
let scraperLog = [];

// Helper function to download a jar and track it
async function downloadAndLogJar(filename, url) {
    try {
        const jarPath = path.join("assets/jars", filename);

        // Check if file already exists (but always download geyser and floodgate)
        const isGeyserOrFloodgate = filename.includes("geyser") || filename.includes("floodgate");
        if (fs.existsSync(jarPath) && !isGeyserOrFloodgate) {
            index[filename] = url;
            scraperLog.push({
                filename: filename,
                url: url,
                success: true,
                timestamp: new Date().toISOString(),
                note: "File already exists"
            });
            return true;
        }

        // Download the jar
        const response = await fetch(url);
        if (!response.ok) {
            scraperLog.push({
                filename: filename,
                url: url,
                success: false,
                timestamp: new Date().toISOString(),
                error: `HTTP ${response.status}`
            });
            return false;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(jarPath, buffer);

        index[filename] = url;
        scraperLog.push({
            filename: filename,
            url: url,
            success: true,
            timestamp: new Date().toISOString(),
            fileSize: buffer.length
        });
        return true;
    } catch (err) {
        scraperLog.push({
            filename: filename,
            url: url,
            success: false,
            timestamp: new Date().toISOString(),
            error: err.message
        });
        return false;
    }
}

// Helper function to log jar URLs (for tracking without downloading)
function logJar(filename, url, success = true) {
    scraperLog.push({
        filename: filename,
        url: url,
        success: success,
        timestamp: new Date().toISOString()
    });
}

//paper
async function downloadPaperJars() {
    // v3 API: versions are grouped by family, e.g. { "26.1": ["26.1.2", "26.1.1"], "1.21": [...] }
    const response = await fetch("https://fill.papermc.io/v3/projects/paper");
    const paperProject = await response.json();
    const allVersions = Object.values(paperProject.versions).flat();

    for (const version of allVersions) {
        try {
            // Skip pre-release and release candidate versions
            if (version.includes("-pre") || version.includes("-rc")) {
                continue;
            }

            if (!skipOldVersions || isRecentMinecraftVersion(version)) {
                // Use /builds/latest instead of fetching all builds and taking the last one
                const buildRes = await fetch(`https://fill.papermc.io/v3/projects/paper/versions/${version}/builds/latest`);
                if (!buildRes.ok) continue;
                const build = await buildRes.json();

                // v3 channel enum: ALPHA, BETA, STABLE, RECOMMENDED
                let channel;
                if (build.channel === "STABLE" || build.channel === "RECOMMENDED") {
                    channel = "release";
                } else if (build.channel === "BETA") {
                    channel = "beta";
                } else {
                    channel = "alpha";
                }

                // v3 download key is "server:default" (not "server") — grab the first entry regardless of key name
                const serverDownload = build.downloads && Object.values(build.downloads)[0];
                if (!serverDownload) continue;

                const filename = `paper-${version}-${channel}.jar`;
                await downloadAndLogJar(filename, serverDownload.url);

                // If the channel is release, clean up any stale beta/alpha jars for this version
                if (channel === "release") {
                    for (const stale of ["beta", "alpha"]) {
                        const staleFilename = `paper-${version}-${stale}.jar`;
                        if (index[staleFilename]) delete index[staleFilename];
                        if (fs.existsSync(`assets/jars/${staleFilename}`)) {
                            fs.unlinkSync(`assets/jars/${staleFilename}`);
                        }
                    }
                }
            }
        } catch (e) {
            //console.log(e);
        }
    }
}


//velocity
async function downloadVelocityJars() {
    //use papermc api
    const response = await fetch("https://api.papermc.io/v2/projects/velocity");
    const velocityVersions = await response.json();
    for (let i in velocityVersions.versions) {
        let version = velocityVersions.versions[i];
        const response = await fetch(`https://api.papermc.io/v2/projects/velocity/versions/${version}/builds`);
        const builds = await response.json();
        const build = builds.builds[builds.builds.length - 1].build;
        let channel = "release";
        if (version.includes("SNAPSHOT")) {
            channel = "beta";
        }

        const link = `https://api.papermc.io/v2/projects/velocity/versions/${version}/builds/${build}/downloads/velocity-${version}-${build}.jar`;
        version = version.split("-")[0];
        const filename = `velocity-${version}-${channel}.jar`;

        if (!skipOldVersions || getMajorVersion(version, 1) >= 21) {
            await downloadAndLogJar(filename, link);
    }

        //
    

    }
}

async function downloadForgeJars() {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout

        const response = await fetch("https://files.minecraftforge.net/maven/net/minecraftforge/forge/index.html", {
            signal: controller.signal
        });
        clearTimeout(timeout);

    // Wait for the response text to resolve
    const minecraftVersionsHtml = $(await response.text());

    // section.sidebar-nav li.li-version-list > ul > li
    let minecraftVersions = minecraftVersionsHtml.find("section.sidebar-nav li.li-version-list > ul > li > a").toArray();
    let latest = minecraftVersionsHtml.find("section.sidebar-nav li.li-version-list > ul > li.elem-active").toArray()[0];
    minecraftVersions.push(latest);
    //console.log(minecraftVersions)
    for (let i in minecraftVersions) {
        let url = "https://files.minecraftforge.net/maven/net/minecraftforge/forge/index_"+minecraftVersions[i].textContent.trim()+".html";
        //console.log(url)
        const response2 = await fetch(url);
        let forgeVersionsHtml = $(await response2.text());

        let forgeVersionChannels = forgeVersionsHtml.find(".downloads > .download > .title").toArray();
        let forgeVersionLinks = forgeVersionsHtml.find(".downloads > .download > .links > .link-boosted > a").toArray();
        for (let j in forgeVersionLinks) {
            let channel = Array.from(forgeVersionChannels[j].childNodes)
            .filter(node => node.nodeType === 3)[1]
            .nodeValue.trim().split(" ")[1].toLowerCase();
            let link = forgeVersionLinks[j].href.split("&url=")[1];
            let components = link.split("/").pop().split("-");
            let filename = "forge-" + components[1] + "-" + channel + ".jar";
            if (!components[1].includes("1.7.10_pre4")) {
                // `i` here would be the outer loop's index into minecraftVersions
                // (up to ~80), not this version's own components - almost always
                // out of range for the 4-element components array, silently
                // caught by getMajorVersion's try/catch as 0, which failed the
                // >= 21 check for virtually every real build in partial-download
                // mode (skipOldVersions=true - i.e. every scheduled/boot run).
                if (!skipOldVersions || getMajorVersion(components[1], 1) >= 21) {
                    await downloadAndLogJar(filename, link);
            }
            }
        }


    }
    } catch (err) {
        console.error("Error downloading Forge jars (skipping):", err.message);
        scraperLog.push({
            filename: "forge-general",
            url: "https://files.minecraftforge.net/maven/net/minecraftforge/forge/index.html",
            success: false,
            timestamp: new Date().toISOString(),
            error: `${err.name}: ${err.message} (skipped, will retry next run)`
        });
    }

}

// neoforge
async function downloadNeoforgeJars() {
    try {
        const response = await fetch("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge");
        let neoforgeVersions = await response.json();
        neoforgeVersions = neoforgeVersions.versions;

        const latestVersions = [];
        for (let i = neoforgeVersions.length - 1; i >= 0; i--) {
            let version = neoforgeVersions[i];

            // Skip invalid versions (like 0.25w14craftmine.*)
            if (!version.match(/^\d+\.\d+/)) {
                continue;
            }

            let minecraftVersion = version.split(".")[0] + "." + version.split(".")[1];

            let minecraftVersionAlreadyPresent = false;
            for (let j in latestVersions) {
                let version2 = latestVersions[j];

                if (version2.includes(minecraftVersion)) {
                    minecraftVersionAlreadyPresent = true;
                    break;
                }
            }

            if (!minecraftVersionAlreadyPresent) {
                latestVersions.push(version);
            }
        }

        for (let i in latestVersions) {
            let url = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${latestVersions[i]}/neoforge-${latestVersions[i]}-installer.jar`;
            // Convert NeoForge version (e.g., 21.6.15) to Minecraft version (e.g., 1.21.6)
            let parts = latestVersions[i].split(".");
            let minecraftVersion = "1." + parts[0] + "." + parts[1];
            let channel = "release";
            if (latestVersions[i].includes("beta")) {
                channel = "beta";
            }
            let filename = `neoforge-${minecraftVersion}-${channel}.jar`;
            console.log(`NeoForge: Version=${latestVersions[i]}, MinecraftVersion=${minecraftVersion}, Filename=${filename}`);

            if (!skipOldVersions || isRecentMinecraftVersion(minecraftVersion, 20)) {
                await downloadAndLogJar(filename, url);
            }
        }
    } catch (err) {
        scraperLog.push({
            filename: "neoforge-general",
            url: "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge",
            success: false,
            timestamp: new Date().toISOString(),
            error: err.message
        });
    }
}

function getMajorVersion(version, i) {
    try {
        return parseInt(version.split(".")[i]);
    } catch (e) {
        return 0;
    }
}

// Minecraft switched from "1.X.Y" to year-based "26.0", "27.0", etc.
// Anything with a leading segment >= 2 is the new scheme and always counts as recent.
// Legacy "1.X.Y" versions must have minor >= minLegacyMinor.
function isRecentMinecraftVersion(version, minLegacyMinor = 21) {
    const major = getMajorVersion(version, 0);
    if (major >= 2) return true;
    if (major === 1) return getMajorVersion(version, 1) >= minLegacyMinor;
    return false;
}


async function downloadQuiltJars() {
    const url = "https://quiltmc.org/api/v1/download-latest-installer/java-universal";

    let filename = "quilt-installer.jar";

        await downloadAndLogJar(filename, url);

}

async function downloadFabricJars() {
    const response = await fetch("https://meta.fabricmc.net/v2/versions/game");
    const fabricVersions = await response.json();

    //get latest loader version
    const response2 = await fetch("https://meta.fabricmc.net/v2/versions/loader");
    const fabricLoaderVersions = await response2.json();
    const latestLoaderVersion = fabricLoaderVersions[0].version;

    //get latest installer version
    const response3 = await fetch("https://meta.fabricmc.net/v2/versions/installer");
    const fabricInstallerVersions = await response3.json();
    const latestInstallerVersion = fabricInstallerVersions[0].version;

    for (let i in fabricVersions) {
        if (fabricVersions[i].stable) {
            const url = `https://meta.fabricmc.net/v2/versions/loader/${fabricVersions[i].version}/${latestLoaderVersion}/${latestInstallerVersion}/server/jar`;
            const filename = `fabric-${fabricVersions[i].version}-release.jar`;

            if (!skipOldVersions || getMajorVersion(fabricVersions[i].version, 0) >= 21) {
                await downloadAndLogJar(filename, url);


        }

    }
}
}

async function downloadGeyserJars() {
        const metaRes = await fetch("https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest");
        if (!metaRes.ok) {
            scraperLog.push({ filename: "geyser-spigot.jar", url: "", success: false, timestamp: new Date().toISOString(), error: `Metadata fetch failed: HTTP ${metaRes.status}` });
            return;
        }
        const meta = await metaRes.json();
        const buildNumber = meta.build;
        const timestamp = meta.time ?? new Date().toISOString();
        const tag = Buffer.from(`${buildNumber}:${timestamp}`).toString("base64");
        const stamped = `geyser-spigot-${tag}.jar`;

        // Remove old stamped geyser jars
        const jarsDir = "assets/jars";
        for (const f of fs.readdirSync(jarsDir)) {
            if (f.startsWith("geyser-spigot-") && f.endsWith(".jar")) {
                fs.unlinkSync(path.join(jarsDir, f));
            }
        }

        await downloadAndLogJar(stamped, "https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot");
        await downloadAndLogJar("floodgate-spigot.jar", "https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot");
}

async function downloadWorldgenMods() {
    let worldgenMods = ["terralith", "incendium", "nullscape", "structory"];
    for (let z in worldgenMods) {

        


    const response = await fetch(`https://api.modrinth.com/v2/project/${worldgenMods[z]}/version?loaders=[%22datapack%22]`);
    const versions = await response.json();

    let minecraftVersions = [];

    for (let i in versions) {
        if (worldgenMods[z] != undefined) {

        let url = versions[i].files[0].url;
        let channel = versions[i].version_type;
        for (let j in versions[i].game_versions) {
            let minecraftVersion = versions[i].game_versions[j];
            let minecraftVersionAlreadyPresent = false;
            for (let k in minecraftVersions) {
                if (minecraftVersions[k].split("*")[0] == minecraftVersion && minecraftVersions[k].split("*")[2] == channel) {
                    minecraftVersionAlreadyPresent = true;
                    break;
                }
            }
            if (!minecraftVersionAlreadyPresent) {
                minecraftVersions.push(minecraftVersion+"*"+url+"*"+channel);
            }
        }  
    } 
    }

    for (let i in minecraftVersions) {
        if (worldgenMods[z] != undefined) {
        let minecraftVersion = minecraftVersions[i].split("*")[0];
        let url = minecraftVersions[i].split("*")[1];
        let channel = minecraftVersions[i].split("*")[2];
        let filename = `${worldgenMods[z]}-${minecraftVersion}-${channel}.zip`;
        if (!skipOldVersions || isRecentMinecraftVersion(minecraftVersion)) {
            await downloadAndLogJar(filename, url);
    }
    }
}
    
}
}
function downloadSnapshotJars() {
    files.GET(
      "https://launchermeta.mojang.com/mc/game/version_manifest.json",
      (vdata) => {
        try {
          const json = JSON.parse(vdata);
          if (json.latest.snapshot == json.versions[0].id) {
            files.GET(json.versions[0].url, (data) => {
              try {
                const version = JSON.parse(data);
                if (version.downloads.server != undefined) {

  index["snapshot-" + json.versions[0].id + ".jar"] = version.downloads.server.url;
  logJar("snapshot-" + json.versions[0].id + ".jar", version.downloads.server.url);

                }
              } catch (e) {
                //console.log(e);
              }
            });
          }
        } catch (e) {
          //console.log(e);
        }
      }
    );
  }

  function downloadVanillaJars() {
    files.GET(
        "https://launchermeta.mojang.com/mc/game/version_manifest.json",
        (vdata) => {
            try {
                const json = JSON.parse(vdata);
                for (let i in json.versions) {
                    let version = json.versions[i];
                    if (version.type == "release") {
                        files.GET(version.url, (data) => {
                            try {
                                const version = JSON.parse(data);
                                if (version.downloads.server != undefined) {
                                    if (!skipOldVersions || isRecentMinecraftVersion(version.id)) {
                                    index["vanilla-" + version.id + ".jar"] = version.downloads.server.url;
                                    logJar("vanilla-" + version.id + ".jar", version.downloads.server.url);
                                    }
                                }
                            } catch (e) {
                                //console.log(e);
                            }
                        });
                    }
                }
            } catch (e) {
                //console.log(e);
            }

        }   
    );
}   


// Progress tracking for the admin "Debug Scraper" modal. This isn't a
// concurrent/slotted job like the modpack checker - it's one sequential
// chain of loaders - so all we need is "which step is running right now"
// and the scraperLog itself, which already accumulates live as each jar
// downloads. It's deliberately module-level and read by reference-copy in
// getProgress(), same reasoning as modpackChecker.getProgress().
let running = false;
let currentPhase = "idle";
let currentMode = null; // "full" | "partial"
let startedAt = null;
let finishedAt = null;

// Each step gets its own try/catch, so one loader throwing (e.g. Paper's API
// being down) doesn't abort every step after it - previously the whole
// chain was wrapped in a single try/catch, so a single unhandled error early
// in the list silently skipped everything from that point on.
const SCRAPE_STEPS = [
    { name: "paper", label: "Paper", fn: downloadPaperJars },
    { name: "velocity", label: "Velocity", fn: downloadVelocityJars },
    { name: "forge", label: "Forge", fn: downloadForgeJars },
    { name: "neoforge", label: "NeoForge", fn: downloadNeoforgeJars },
    { name: "quilt", label: "Quilt", fn: downloadQuiltJars },
    { name: "fabric", label: "Fabric", fn: downloadFabricJars },
    { name: "geyser", label: "Geyser/Floodgate", fn: downloadGeyserJars },
    { name: "worldgen", label: "Worldgen datapacks", fn: downloadWorldgenMods },
];

async function runScrape(mode) {
    if (running) {
        console.log(`[scraper] Scrape already running (phase: ${currentPhase}) - ignoring ${mode} request`);
        return;
    }

    running = true;
    currentMode = mode;
    skipOldVersions = mode === "partial";
    scraperLog = [];
    startedAt = new Date().toISOString();
    finishedAt = null;

    try {
        for (const step of SCRAPE_STEPS) {
            currentPhase = step.name;
            try {
                await step.fn();
            } catch (err) {
                scraperLog.push({
                    filename: `${step.name}-general`,
                    url: "",
                    success: false,
                    timestamp: new Date().toISOString(),
                    error: `${step.label} step failed: ${err.message}`,
                });
            }
        }

        // Vanilla/snapshot are fire-and-forget callback style (files.GET),
        // not awaitable directly - the trailing wait below is what the
        // original 5-second setTimeout before done() was already doing.
        currentPhase = "vanilla";
        downloadSnapshotJars();
        downloadVanillaJars();
        currentPhase = "finishing";
        await new Promise((resolve) => setTimeout(resolve, 5000));
        done();
    } finally {
        currentPhase = "idle";
        finishedAt = new Date().toISOString();
        running = false;
    }
}

async function fullDownload() {
    await runScrape("full");
}

function done() {
    const indexJson = JSON.stringify(index);
    fs.writeFileSync("assets/scraper.json", indexJson);

    // Write scraper log to logs folder
    const scraperLogJson = JSON.stringify(scraperLog, null, 2);
    fs.writeFileSync("logs/scraper.json", scraperLogJson);
    //console.log("Done running jars scraper");
}

async function partialDownload() {
    await runScrape("partial");
}

function isRunning() {
    return running;
}

// Live state while running, and the last completed run's summary once it
// finishes (scraperLog/startedAt/finishedAt aren't reset until the *next*
// run starts) - one object covers both the "watch it work" and "what
// happened last time" cases the debug modal needs.
function getProgress() {
    return {
        running,
        phase: currentPhase,
        mode: currentMode,
        startedAt,
        finishedAt,
        steps: SCRAPE_STEPS.map((s) => ({ name: s.name, label: s.label })),
        log: scraperLog.slice(),
    };
}

partialDownload();


module.exports = {fullDownload, partialDownload, isRunning, getProgress};
