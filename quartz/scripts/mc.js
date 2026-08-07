var events = require("events");
var eventEmitter = new events.EventEmitter();
fs = require("fs");
let states = [];
const files = require("./files.js");
const config = require("./utils.js").getConfig();
const utils = require("./utils.js");
const readJSON = require("./utils.js").readJSON;
const { time, Console } = require("console");
const { randomBytes } = require("crypto");
const { stat } = require("fs");
const writeJSON = require("./utils.js").writeJSON;
let terminalOutput = [];
let terminalInput = "";

let players = [];

const portOffset = 10000;
const idOffset = parseInt(config.idOffset);

// Default JVM startup flags (Aikar's flags with -Xmx placeholder)
// Users can modify this to customize RAM allocation or other flags
const getDefaultStartupFlags = (allocatedRAM) => {
  return `-Xmx${allocatedRAM}G -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 -Daikars.new.flags=true -Dusing.aikars.flags=https://mcflags.emc.gs`;
};

let amountOfThreads = 16;

const {execSync} = require("child_process");
try {
let amountOfCores = parseInt(execSync(`lscpu | grep "^Core(s) per socket" | awk '{print $4}'`));
let threadsPerCore = parseInt(execSync(`lscpu | grep "^Thread(s) per core" | awk '{print $4}'`));
amountOfThreads = amountOfCores * threadsPerCore;
} catch (e) {
  console.log("error getting amount of threads: " + e);
}


let threads = [];

for (let i = 0; i < amountOfThreads; i++) {
  threads.push(i);
}

console.log("threads: " + threads);
let serversOnThreads = [];

setInterval(() => {
  console.log(serversOnThreads);
}, 1000* 60 * 5);

function getServersOnThreads() {
  return serversOnThreads;
}
        
function proxiesToggle(id, toggle, secret) {
  if (toggle == true) {
    let paperGlobal = fs.readFileSync(
      `servers/${id}/config/paper-global.yml`,
      "utf8"
    );

    //set the line after 'velocity:' to 'enabled: true'
    let paperGlobalLines = paperGlobal.split("\n");
    let secretIndex = paperGlobalLines.findIndex((line) => {
      return line.includes("    secret:");
    });
    paperGlobalLines[secretIndex] = "    secret: " + secret;
    let index = paperGlobalLines.indexOf("  velocity:");
    paperGlobalLines[index + 1] = "    enabled: true";

    paperGlobal = paperGlobalLines.join("\n");

    fs.writeFileSync(`servers/${id}/config/paper-global.yml`, paperGlobal);

    let serverProperties = fs.readFileSync(
      `servers/${id}/server.properties`,
      "utf8"
    );

    serverProperties = serverProperties.replace(
      /online-mode=true/g,
      `online-mode=false`
    );

    fs.writeFileSync(`servers/${id}/server.properties`, serverProperties);
  } else {
    let paperGlobal = fs.readFileSync(
      `servers/${id}/config/paper-global.yml`,
      "utf8"
    );

    let index = paperGlobal.split("\n").indexOf("secret: ");
    let paperGlobalLines = paperGlobal.split("\n");

    paperGlobalLines[index] == "    secret: " + secret;

    //set the line after 'velocity:' to 'enabled: false'
    let index2 = paperGlobalLines.indexOf("  velocity:");
    paperGlobalLines[index2 + 1] = "    enabled: false";
    paperGlobal = paperGlobalLines.join("\n");

    fs.writeFileSync(`servers/${id}/config/paper-global.yml`, paperGlobal);

    let serverProperties = fs.readFileSync(
      `servers/${id}/server.properties`,
      "utf8"
    );

    serverProperties = serverProperties.replace(
      /online-mode=false/g,
      `online-mode=true`
    );

    fs.writeFileSync(`servers/${id}/server.properties`, serverProperties);
  }
}

function getState(id) {
  if (states[id] == undefined) {
    states[id] = "false";
  }
  return states[id];
}
function checkServer(id) {
  if (states[id] == undefined) {
    states[id] = "false";
    console.log("setting status of " + id + " to false on line #2");
  }
  let server = readJSON("servers/" + id + "/server.json");
  //detect if geyser is installed, add to specialPlugins
  if (fs.existsSync(`servers/${id}/plugins/cx_geyser-spigot_Geyser.jar`)) {
    server.specialPlugins.push("geyser");
  }
  return {
    version: server.version,
    software: server.software,
    specialDatapacks: server.specialDatapacks,
    specialPlugins: server.specialPlugins,
    state: states[id],
  };
}
// Forge/NeoForge 1.17+ launch from an argfile inside
// libraries/net/{minecraftforge/forge,neoforged/neoforge}/<build>/unix_args.txt.
// True when `version` uses that layout — year-based versions (26.x, 27.x, …)
// always do, as do 1.17 and up.
function usesLoaderArgFile(version) {
  if (parseInt(version.split(".")[0]) >= 2 && !version.startsWith("1.")) {
    return true;
  }
  return parseInt(version.split(".")[1]) >= 17;
}

// Highest build number wins, comparing every number group in the folder name
// ("1.18.2-40.2.21" -> [1,18,2,40,2,21]) so a longer build sorts above a
// shorter one with the same prefix.
function compareLoaderBuilds(a, b) {
  const na = (a.match(/\d+/g) || []).map(Number);
  const nb = (b.match(/\d+/g) || []).map(Number);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const diff = (na[i] || 0) - (nb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Picks which build to launch out of libraries/…/forge. A server can end up
// with several here (a version or software switch leaves the old build behind),
// and this used to take readdirSync()[0] — an arbitrary directory-order pick
// that could launch a build the installer didn't just install.
//
// On the argfile layout only builds that actually have a unix_args.txt are
// eligible, since that's the file the exec line points at. If none qualify we
// still return the highest build rather than undefined, which would put the
// literal string "undefined" in the launch command.
function pickLoaderBuild(libDir, version) {
  let builds;
  try {
    builds = fs
      .readdirSync(libDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (e) {
    return undefined;
  }
  if (builds.length === 0) {
    return undefined;
  }

  const sorted = builds.slice().sort(compareLoaderBuilds);

  if (usesLoaderArgFile(version)) {
    const withArgFile = sorted.filter((build) =>
      fs.existsSync(libDir + "/" + build + "/unix_args.txt")
    );
    if (withArgFile.length > 0) {
      return withArgFile[withArgFile.length - 1];
    }
    console.log(
      "no build in " + libDir + " has a unix_args.txt — falling back to " +
        sorted[sorted.length - 1]
    );
  }

  return sorted[sorted.length - 1];
}

function run(
  id,
  software,
  version,
  addons,
  cmd,
  em,
  isNew,
  modpackURL,
  modpackID,
  modpackVersionID
) {
  try {
    const { exec, execSync, spawn } = require("child_process");
    //this looks for servers running on the same port that may obstruct startup
    killObstructingProcess(parseInt(id));

    if (fs.existsSync("servers/" + id + "/world/session.lock")) {
      fs.unlinkSync("servers/" + id + "/world/session.lock");
    }
    if (fs.existsSync("servers/" + id + "/world_nether/session.lock")) {
      fs.unlinkSync("servers/" + id + "/world_nether/session.lock");
    }
    if (fs.existsSync("servers/" + id + "/world_the_end/session.lock")) {
      fs.unlinkSync("servers/" + id + "/world_the_end/session.lock");
    }

    let server = readJSON("servers/" + id + "/server.json");
    states[id] = "starting";
    players[id] = [];
    terminalOutput[id] = "";
    

    // i isNew is undefined, set it to true
    if (isNew == undefined) {
      isNew = true;
    }

    //make sure isNew is a boolean
    isNew = Boolean(isNew);

    if (isNew === false) {
      software = server.software;
      version = server.version;
      addons = server.addons;
    } else {
      if (fs.existsSync("assets/template/default-server-icon.png")) {
        fs.copyFileSync(
          "assets/template/default-server-icon.png",
          "servers/" + id + "/server-icon.png"
        );
      }
    }

    for (let i in cmd) {
      if (cmd[i] != undefined) {
        cmd[i] = cmd[i].toLowerCase();
      }
    }

    let folder = "servers/" + id;
    if (software == "quilt") {
      folder = "servers/" + id + "/server";
      if (!fs.existsSync(folder)) {
        try {
          fs.mkdirSync(folder);
        } catch {
          console.log("error creating server folder");
        }
      }
    }

        let count = 0;
    //check if server is over storage limit
    let serverStorageLimit = 16;
    if (config.plus == server.productID) {
      serverStorageLimit = 24;
    } else if (config.premium == server.productID) {
      serverStorageLimit = 32;
    }

    // Check storage asynchronously without blocking
    (async () => {
      try {
        let size = await files.folderSizeRecursiveAsync(folder);
        //convert size to gb
        size = size / 1000000000;
        console.log("storage: " + size.toFixed(2)+ "/" + serverStorageLimit + "GB");
        if (size > serverStorageLimit) {
          states[id] = "false";
          console.log("setting status of " + id + " to false on line #12");
          // Stop the server if over limit
          throw new Error("Server is over storage limit.");
        }
      } catch (err) {
        console.error("Storage check failed for server " + id + ":", err);
      }
    })();
    

    let allocatedRAM;
    // Explicit override, independent of the Stripe productID tiers below —
    // used by the modpack checker so its throwaway slot gets more headroom
    // than a basic customer server without touching billing config.
    if (server.ramOverrideGB) {
      allocatedRAM = server.ramOverrideGB;
    } else if (config.basic == server.productID) {
      allocatedRAM = 4;
    } else if (config.plus == server.productID) {
      allocatedRAM = 6;
    } else if (config.premium == server.productID) {
      allocatedRAM = 8;
    } else if (config.max == server.productID) {
      allocatedRAM = 12;
    }else {
      allocatedRAM = 4;
    }

    // Cap RAM to 1GB if testing mode is enabled
    if (config.testingMode === "true" || config.testingMode === true) {
      allocatedRAM = 1;
    }

    let startupFlags = server.startupFlags || getDefaultStartupFlags(allocatedRAM);
    let args = [
      startupFlags + " -jar server.jar",
    ];
    //make a new folder called name using fs
    let s = "paper";
    let c = "servers";
    let installer = false;

    fs.writeFileSync(folder + "/eula.txt", "eula=true");

    //make software all lowercase
    software = software.toLowerCase();
    switch (software) {
      case "paper":
        s = "paper";
        c = "servers";
        break;
      case "velocity":
        s = "velocity";
        c = "proxies";
        break;
      case "quilt":
        s = "fabric";
        c = "modded";
        installer = true;
        break;
      case "vanilla":
        s = "vanilla";
        c = "vanilla";
        break;
      case "waterfall":
        s = "waterfall";
        c = "proxies";
        break;
      case "forge":
        s = "forge";
        c = "modded";
        installer = true;
        break;
      case "neoforge":
        s = "neoforge";
        c = "modded";
        installer = true;
        break;
      case "fabric":
        s = "fabric";
        c = "modded";

        break;
      case "snapshot":
        s = "snapshot";
        c = "vanilla";
        break;
      case "spigot":
        s = "spigot";
        c = "servers";
        break;
    }
    let javaVer = "8";
    //this selects the correct version of java for the minecraft version
    // Year-based versions (26.x, 27.x, …) always need Java 25
    if (parseInt(version.split(".")[0]) >= 2 && !version.startsWith("1.")) javaVer = "25";
    else if (parseInt(version.split(".")[1]) >= 20) javaVer = "21";
    else if (version.includes("1.19")) javaVer = "21";
    else if (version.includes("1.18")) javaVer = "17";
    else if (version.includes("1.17")) javaVer = "17";
    if (software == "velocity") javaVer = "17";

    if (software == "snapshot") {
      javaVer = "25";
    }

    if (server.javaVersion != undefined && !isNaN(server.javaVersion)) {
      javaVer = server.javaVersion;
    }

    let absolutePath = execSync("pwd").toString().trim();

    if (software == "quilt") {
      absolutePath = absolutePath + "/servers/" + id;
    }

    let port = portOffset + parseInt(id);
    let thread1 = threads[0]
    let thread2 = threads[1]; 
    let thread3 = threads[2];
    let thread4 = threads[3];
    //removes those threads from the array
    threads.splice(0, 3);
    
    //adds those threads to the end of the array
    threads.push(thread1);
    threads.push(thread2);
    threads.push(thread3);
    threads.push(thread4);

    let threadsString = thread1 + "," + thread2 + "," + thread3 + "," + thread4;

    //clear any existing items with the same id
    for (let i = 0; i < serversOnThreads.length; i++) {
      if (serversOnThreads[i].id == id) {
        serversOnThreads.splice(i, 1);
        break;
      }
    }


    serversOnThreads.push({id: id, threads: threadsString});


    //the .1 is to let java have some extra room to prevent crashes
    let prefix = `docker run -m ${allocatedRAM}.1g -i -v ${absolutePath}/servers/${id}:/server -w /server -p ${port}:${port}/tcp -p ${port}:${port}/udp -p ${port + 66}:${port + 66}/tcp -p ${port + 33}:${port + 33}/udp --user 1000:1000 --cpuset-cpus="${threadsString}" eclipse-temurin:${javaVer} java`;
    console.log("prefix: " + prefix);

    let doneInstallingServer = false;

    if (!fs.existsSync(folder)) {
      try {
        fs.mkdirSync(folder);
      } catch {
        console.log("error creating server folder");
      }
      //fs.writeFileSync(folder + "/world.zip", worldFile);
    }
    if (!fs.existsSync(folder + "/plugins")) {
      fs.mkdirSync(folder + "/plugins");
    }
    if (!fs.existsSync(folder + "/mods/")) {
      fs.mkdirSync(folder + "/mods/");
    }
    if (!fs.existsSync(folder + "/.fileVersions")) {
      fs.mkdirSync(folder + "/.fileVersions");
    }
    let libraryline = "/libraries/net/minecraftforge/forge/";
    if (software == "neoforge") {
      libraryline = "/libraries/net/neoforged/neoforge/";
    }

    if (software != "quilt") {
      console.log("moving " + software + "-" + version + " to " + folder);
      // Try to find jar with any variant
      let jarPath = null;
      const jarDir = "assets/jars/";
      const jars = fs.readdirSync(jarDir);
      for (let jar of jars) {
        if (jar.startsWith(software + "-" + version + "-") && jar.endsWith(".jar")) {
          jarPath = jarDir + jar;
          break;
        }
      }

      if (jarPath && fs.existsSync(jarPath)) {
        fs.copyFileSync(jarPath, folder + "/server.jar");
      }
    } else {
      fs.copyFileSync(
        "assets/jars/" + software + "-0.5.1.jar",
        "servers/" + id + "/server.jar"
      );
      args = [
        getDefaultStartupFlags(4) + " -jar server.jar install server " +
          version +
          " --download-server",
      ];
    }

    //run code for each item in addons
    //mkdir folder/world/datapacks
    // if world folder doesnt exist
    if (!fs.existsSync(folder + "/world/datapacks")) {
      if (!fs.existsSync(folder + "/world")) {
        fs.mkdirSync(folder + "/world");
      }
      fs.mkdirSync(folder + "/world/datapacks");
    }
    
    for (let i in addons) {
      let lowercase;
      let uppercase;
      let lrId;
      if (addons[i] == "terralith") {
         lowercase = "terralith";
         uppercase = "Terralith";
         lrId = "8oi3bsk5";
      }
      if (addons[i] == "incendium") {
         lowercase = "incendium";
         uppercase = "Incendium";
         lrId = "ZVzW5oNS";
      }
      if (addons[i] == "nullscape") {
         lowercase = "nullscape";
         uppercase = "Nullscape";
         lrId = "LPjGiSO4";
      }
      if (addons[i] == "structory") {
         lowercase = "structory";
         uppercase = "Structory";
         lrId = "aKCwCJlY";
      }

      // Try to find zip with any variant
      let zipPath = null;
      const jarDir = "assets/jars/";
      const jars = fs.readdirSync(jarDir);
      for (let jar of jars) {
        if (jar.startsWith(lowercase + "-" + version + "-") && jar.endsWith(".zip")) {
          zipPath = jarDir + jar;
          break;
        }
      }

      if (zipPath && fs.existsSync(zipPath)) {
        fs.copyFileSync(
          zipPath,
          folder + "/world/datapacks/lr_"+lrId+"_"+uppercase+".zip"
        );
      }

      
    }

    let data;
    if (software == "velocity") {
      if (isNew) {
        data = fs.readFileSync("assets/template/velocity.toml", "utf8");
      } else {
        data = fs.readFileSync("servers/" + id + "/velocity.toml", "utf8");
      }
      let result;
      if (server.adminServer) {
        result = data.replace(
          /player-info-forwarding-mode = "NONE"/g,
          `player-info-forwarding-mode = "modern"`
        );
      } else {
        result = data
          .replace(/bind = "0.0.0.0:25577"/g, `bind = "0.0.0.0:${port}"`)
          .replace(
            /player-info-forwarding-mode = "NONE"/g,
            `player-info-forwarding-mode = "modern"`
          );
      }

      fs.writeFileSync(folder + "/velocity.toml", result, "utf8");

      if (!fs.existsSync(folder + "/forwarding.secret")) {
        let secret = randomBytes(12).toString("hex");
        fs.writeFileSync(folder + "/forwarding.secret", secret, "utf8");
      }
    } else {
      if (isNew) {
        data = fs.readFileSync("assets/template/server.properties", "utf8");
        data = data.replace(/spawn-protection=16/g, `spawn-protection=0`);
        if (software == "paper") {
          let paperGlobal = fs.readFileSync(
            "assets/template/paper-global.yml",
            "utf8"
          );
          if (!fs.existsSync(folder + "/config")) {
            fs.mkdirSync(folder + "/config");
          }
          fs.writeFileSync(
            folder + "/config/paper-global.yml",
            paperGlobal,
            "utf8"
          );
        }
      } else {
        data = fs.readFileSync(folder + "/server.properties", "utf8");
      }
      let result = data;
      if (!server.adminServer) {
        //find every server-port line (exact key match, so "management-server-port" etc are left alone)
        let lines = result.split("\n");
        let serverPortIndices = [];
        lines.forEach((line, idx) => {
          if (/^\s*server-port\s*=/.test(line)) {
            serverPortIndices.push(idx);
          }
        });

        //replace the first occurrence with the new port, and drop any duplicates
        if (serverPortIndices.length > 0) {
          lines[serverPortIndices[0]] = "server-port=" + port;
          for (let i = serverPortIndices.length - 1; i >= 1; i--) {
            lines.splice(serverPortIndices[i], 1);
          }
        }
        result = lines.join("\n");
      }

      fs.writeFileSync(folder + "/server.properties", result, "utf8");
    }

    //special plugin operations
    //if a plugin has a jar but not a folder, we know that
    //it hasnt been installed yet and the config needs to modified
    let plugins = fs.readdirSync(folder + "/plugins");

    if (server.javaVersion == undefined) {
      server.javaVersion = javaVer;
    }

    if (server.startupFlags == undefined) {
      server.startupFlags = getDefaultStartupFlags(allocatedRAM);
    }

    utils.writeJSON("servers/" + id + "/server.json", server);

    for (let i in plugins) {
      let isJar = plugins[i].includes(".jar");
      if (isJar) {
        if (plugins[i].includes("Dynmap")) {
          let interval1 = setInterval(() => {
            if (fs.existsSync(folder + "/plugins/dynmap/configuration.txt")) {
              let data = fs.readFileSync(
                folder + "/plugins/dynmap/configuration.txt",
                "utf8"
              );

              let lines = data.split("\n");

              let a = lines.findIndex((line) => {
                return line.includes("webserver-port");
              });

              lines[a] = "webserver-port: " + (port + 66);

              let b = lines.findIndex((line) => {
                return line.includes("deftemplatesuffix");
              });

              lines[b] = "deftemplatesuffix: vlowres";

              let c = lines.findIndex((line) => {
                return line.includes("image-format");
              });

              lines[c] = "image-format: jpg";

              fs.writeFileSync(
                folder + "/plugins/dynmap/configuration.txt",
                lines.join("\n"),

                "utf8"
              );

              if (!server.specialPlugins.includes("dynmap")) {
                server.specialPlugins.push("dynmap");
              }
              utils.writeJSON("servers/" + id + "/server.json", server);
              let interval2 = setInterval(() => {
                if (getState(id) == "true") {
                  writeTerminal(id, "dynmap fullrender world");
                  clearInterval(interval2);
                }
              }, 3000);
              clearInterval(interval1);
            }
          }, 10);
        } else {
          if (server.specialPlugins != undefined) {
            if (server.specialPlugins.includes("dynmap")) {
              server.specialPlugins.splice(
                server.specialPlugins.indexOf("dynmap"),
                1
              );
              utils.writeJSON("servers/" + id + "/server.json", server);
            }
          }
        }

        if (plugins[i].includes("BlueMap")) {
          //change accept-download to true in BlueMap/core.conf
          let interval1 = setInterval(() => {
            if (fs.existsSync(folder + "/plugins/BlueMap/core.conf")) {
              let data = fs.readFileSync(
                folder + "/plugins/BlueMap/core.conf",
                "utf8"

              );
             
              let lines = data.split("\n");
              let a = lines.findIndex((line) => {
                return line.includes("accept-download:");
              } 
);
              lines[a] = "accept-download: true";

              fs.writeFileSync(
                folder + "/plugins/BlueMap/core.conf",
                lines.join("\n"),

                "utf8"
              );

              //change the port in BlueMap/webserver.conf to port + 66
              if (fs.existsSync(folder + "/plugins/BlueMap/webserver.conf")) {
                let data2 = fs.readFileSync(
                  folder + "/plugins/BlueMap/webserver.conf",
                  "utf8"
                );
                let lines2 = data2.split("\n");
                let b = lines2.findIndex((line) => {
                  return line.includes("port:");
                });
                let configuredAlready = !lines2[b].includes("8100");
                lines2[b] = "port: " + (port + 66);
                fs.writeFileSync(
  
  
                  folder + "/plugins/BlueMap/webserver.conf",
                  lines2.join("\n"),
                  "utf8"
                );
                if (!server.specialPlugins.includes("bluemap")) { 
                  server.specialPlugins.push("bluemap");
                }
                utils.writeJSON("servers/" + id + "/server.json", server);
                if (!configuredAlready) {
                  writeTerminal(id, "say [Arth Panel] BlueMap has been configured. Please restart the server to start using it.");
                  
                }
                clearInterval(interval1);
              }
            }
          }, 10);
        } else {
          if (server.specialPlugins != undefined) {
          if (server.specialPlugins.includes("bluemap")) {
            server.specialPlugins.splice(
              server.specialPlugins.indexOf("bluemap"),
              1
            );
            utils.writeJSON("servers/" + id + "/server.json", server);
          }
        }
        }

        if (plugins[i].includes("Simple-Voice-Chat")) {
          let interval1 = setInterval(() => {
            if (
              fs.existsSync(
                folder + "/plugins/voicechat/voicechat-server.properties"
              )
            ) {
              let data = fs.readFileSync(
                folder + "/plugins/voicechat/voicechat-server.properties",
                "utf8"
              );

              let lines = data.split("\n");

              let a = lines.findIndex((line) => {
                return line.includes("port=");
              });

              lines[a] = "port=" + (port + 33);

              fs.writeFileSync(
                folder + "/plugins/voicechat/voicechat-server.properties",
                lines.join("\n"),

                "utf8"
              );
              if (!server.specialPlugins.includes("voicechat")) {
                server.specialPlugins.push("voicechat");
              }
              utils.writeJSON("servers/" + id + "/server.json", server);

              clearInterval(interval1);
            }
          }, 10);
        } else {
          if (server.specialPlugins != undefined) {
          if (server.specialPlugins.includes("voicechat")) {
            server.specialPlugins.splice(
              server.specialPlugins.indexOf("voicechat"),
              1
            );
            utils.writeJSON("servers/" + id + "/server.json", server);
          }
        }
        }

        if (plugins[i].includes("DiscordSRV")) {
          if (!server.specialPlugins.includes("discordsrv")) {
            server.specialPlugins.push("discordsrv");
          }
          utils.writeJSON("servers/" + id + "/server.json", server);
        } else {
          if (server.specialPlugins != undefined) {
          if (server.specialPlugins.includes("discordsrv")) {
            server.specialPlugins.splice(
              server.specialPlugins.indexOf("discordsrv"),
              1
            );
            utils.writeJSON("servers/" + id + "/server.json", server);
          }
        }
        }

        if (plugins[i].includes("Chunky")) {
          if (!server.specialPlugins.includes("chunky")) {
            server.specialPlugins.push("chunky");
          }
          utils.writeJSON("servers/" + id + "/server.json", server);
        } else {
          if (server.specialPlugins != undefined) {
          if (server.specialPlugins.includes("chunky")) {
            server.specialPlugins.splice(
              server.specialPlugins.indexOf("chunky"),
              1
            );
            utils.writeJSON("servers/" + id + "/server.json", server);
          }
        }
        }
      }
    }
    //copy /assets/template/Geyser-Spigot.jar to folder/plugins

    let ls;
    let interval = 0;
    // Only a run() that kicks off its own download gates on one. A restart, or
    // the modpack checker (which downloads separately and then calls us with
    // no URL), must never inherit a stale hold from an earlier install.
    let heldForModpack = false;
    if (c == "modded" && isNew) {
      if (modpackURL != undefined) {
        downloadModpack(id, modpackURL, modpackID, modpackVersionID);
        heldForModpack = true;
      }
    }
    if (installer) {
      // Run the installer whenever it's a brand-new server OR the expected
      // loader libraries aren't on disk yet (e.g. after a software/version
      // switch) — isNew alone isn't a reliable signal that libraries exist.
      let librariesAlreadyInstalled = fs.existsSync(folder + libraryline);
      if (isNew || !librariesAlreadyInstalled) {
        interval = 500;
        states[id] = "installing";
        //previous terminals should be cleared
        //so give extra feedback the server is installing
        terminalOutput[id] =
          "[System] Installing " +
          software.charAt(0).toUpperCase() +
          software.slice(1) +
          "...";

        if (software == "forge") {
          const forgeInstaller = spawn(
            prefix + " -jar server.jar --installServer",
            { cwd: folder, stdio: ["pipe", "pipe", "pipe"], shell: true, timeout: 600000 }
          );

          forgeInstaller.stdout.on("data", (data) => {
            // Prevent stdout from growing unbounded (100MB limit)
            if (terminalOutput[id].length < 100 * 1024 * 1024) {
              terminalOutput[id] += "\n[Forge Installer] " + data.toString();
            }
            // Installer output belongs in the server's own console, not the
            // panel's — it's already captured in terminalOutput above.
          });

          forgeInstaller.stderr.on("data", (data) => {
            // Prevent stderr from growing unbounded (100MB limit)
            if (terminalOutput[id].length < 100 * 1024 * 1024) {
              terminalOutput[id] += "\n[Forge Error] " + data.toString();
            }
          });

          forgeInstaller.on("exit", (code) => {
            console.log("Forge installer exited with code: " + code);
            terminalOutput[id] += "\n[Forge Installer] Process exited with code: " + code;
            // Don't mark as done yet - wait for libraries to actually exist
            // Poll for libraries since installer may exit before downloads complete
            let libraryCheckCount = 0;
            const maxLibraryChecks = 240;
            const libraryCheckInterval = setInterval(() => {
              libraryCheckCount++;
              if (fs.existsSync(folder + libraryline)) {
                clearInterval(libraryCheckInterval);
                doneInstallingServer = true;
              } else if (libraryCheckCount > maxLibraryChecks) {
                clearInterval(libraryCheckInterval);
                states[id] = "false";
                terminalOutput[id] += "\n[Error]: Forge libraries failed to download.";
              }
            }, 500);
          });
        } else {
          //quilt
          exec(
            prefix + " " + args,
            { cwd: "servers/" + id, stdio: "inherit" },
            (error, stdout, stderr) => {
              // Only the fact of a failure reaches the panel; the installer's
              // own output stays in the server console.
              if (error) console.log("Quilt installer failed for " + id + ": " + error.message);
              doneInstallingServer = true;
            }
          );
        }
      } else {
        // librariesAlreadyInstalled is guaranteed true here (see condition above)
        doneInstallingServer = true;
      }
      let timeToLoad = true;

      //wait for forge to install
      setInterval(() => {
        if (doneInstallingServer && timeToLoad) {
          timeToLoad = false;
          // The loader is installed, but a modpack install may still be
          // fetching mods — and if the pack contains any CurseForge won't
          // serve, this parks the server here until the user uploads them.
          whenClearToBoot(id, heldForModpack, () => {
          states[id] = "starting";
          terminalOutput[id] = "";

          let startupFlags = server.startupFlags || getDefaultStartupFlags(allocatedRAM);
          let args = startupFlags;
          //-Dlog4j.configurationFile=consoleconfig.xml
          //get the forge version from the name of the folder inside /libraries/net/minecraftforge/forge/

          let execLine = "";
          let cwd = folder;

          if (software == "forge" || software == "neoforge") {
            let forgeVersion;

            if (fs.existsSync(folder +libraryline)) {
              forgeVersion = pickLoaderBuild(folder + libraryline, version);
            }

            execLine =
              prefix +
              ` @user_jvm_args.txt @${libraryline.substring(1)}${forgeVersion}/unix_args.txt "$@"`;
            
               //allocate ram to user_jvm_args.txt
               if (fs.existsSync
                (folder + "/user_jvm_args.txt")) {
                  let data = fs.readFileSync(
                    folder + "/user_jvm_args.txt",
                    "utf8"  
                  );
                  let lines = data.split("\n");
                  let a = lines.findIndex((line) => {
                    return line.includes("-Xmx");
                  }   
                  );
                  lines[a] = "-Xmx" + allocatedRAM + "G";
                  fs.writeFileSync(
                    folder + "/user_jvm_args.txt",
                    lines.join("\n"),
                    "utf8"
                  );
                }
              
            if (software == "forge") {
              if (parseInt(version.split(".")[1]) >= 21) {
                execLine = prefix + ` -jar forge-${forgeVersion}-shim.jar`;
              }
  
              if (version.includes("1.16")) {
                execLine = prefix + ` -jar forge-${forgeVersion}.jar`;
              }
  
              if (version.includes("1.12")) {
                execLine = prefix + ` ${args} -jar forge-${forgeVersion}.jar`;
              }
  
              if (parseInt(version.split(".")[1]) <= 8) {
                let jarname = "";
                fs.readdirSync(folder).forEach((file) => {
                  if (file.includes("-universal.jar")) {
                    jarname = file;
                  }
                });
                execLine = prefix + ` -jar ${jarname}`;
              }
            } else {
              execLine = prefix + ` @user_jvm_args.txt @libraries/net/neoforged/neoforge/${forgeVersion}/unix_args.txt "$@"`;
            }

   
          } else {
       
            execLine = prefix + ` @user_jvm_args.txt @libraries/net/neoforged/neoforge/21.1.122/unix_args.txt "$@"`;
            //?
          }
          console.log("exec line: "+execLine);
          let timestamp = new Date().toLocaleTimeString();
          console.log(timestamp + " :t starting server " + id + " with:\n" + execLine);
          ls = spawn(
            execLine,
            { cwd: cwd, stdio: ["pipe", "pipe", "pipe"], shell: true },
            (error, stdout, stderr) => {
              if (states[id] != "false") terminalOutput[id] = stdout;
              states[id] = "false";
              console.log("setting status of " + id + " to false on line #3");
            }
          );

          ls.stdout.on("data", (data) => {
            count++;
            if (count >= 3) {
              terminalOutput[id] += "\n" + data.toString();
              if (terminalOutput[id].length > 100 * 1024 * 1024) {
                terminalOutput[id] = "[...pruned first 50MB of logs...]\n" + terminalOutput[id].slice(50 * 1024 * 1024);
              }
            }
            if (
              terminalOutput[id].includes("Done (") &&
              states[id] != "stopping"
            ) {
              //replace states[id] with true
              states[id] = "true";
            } else if (
              terminalOutput[id].includes(
                "Failed to start the minecraft server"
              )
            ) {
              states[id] = "false";
              console.log("Server " + id + " failed to start.");

              killObstructingProcess(parseInt(id));
              ls.kill();
            }
          });
          ls.stderr.on("data", data => {
  const text = data.toString("utf8");
  // Prevent stderr from growing unbounded (100MB limit)
  if (terminalOutput[id].length < 100 * 1024 * 1024) {
    terminalOutput[id]+= "\n" + text;
  }

    if (terminalOutput[id].includes("to the Docker daemon")) {
      terminalOutput[id] = "[Crash]: Docker is not properly setup. Contact an admin.";
      states[id] = "false";
    }
});
          let count2 = 0;
          let intervalID = setInterval(() => {
            if (states[id] == "stopping") {
              // Fires every 200ms while stopping — logging here floods the panel.
              if (count2 < 5 * 24) {
                ls.stdin.write("stop\n");
                count2++;
              } else {
                states[id] = "false";
                console.log("setting status of " + id + " to false on line #5");

                killObstructingProcess(parseInt(id));
                ls.kill();
                clearInterval(intervalID);
              }
            }
          }, 200);
          eventEmitter.on("writeCmd:" + id, function () {
            ls.stdin.write(terminalInput + "\n");
          });
          ls.on("exit", () => {
            states[id] = "false";
            console.log("setting status of " + id + " to false on line #7");
            clearInterval(intervalID);
          });
          }); //whenClearToBoot
        }
      }, interval);
    } else {
      // Fabric packs have no installer step to hide the download behind, so
      // without this the server would boot against a half-populated mods
      // folder. Starts synchronously when nothing is being downloaded.
      whenClearToBoot(id, heldForModpack, () => {
      let count = 0;
      let timestamp = new Date().toLocaleTimeString();
      console.log(timestamp + " :t starting server " + id + " with:\n" + prefix + " " + args);
      ls = spawn(
        prefix + " " + args,
        { cwd: folder, stdio: ["pipe", "pipe", "pipe"], shell: true },
        (error, stdout, stderr) => {
          if (states[id] != "false") terminalOutput[id] = stdout;
          states[id] = "false";
          if (error) console.log("Server " + id + " exited: " + error.message);
        }
      );
      ls.stdout.on("data", (data) => {
        count++;
        if (count >= 3) {
          terminalOutput[id] += "\n" + data.toString();
          if (terminalOutput[id].length > 100 * 1024 * 1024) {
            terminalOutput[id] = "[...pruned first 50MB of logs...]\n" + terminalOutput[id].slice(50 * 1024 * 1024);
          }
        }
        if (terminalOutput[id].includes("Done (") && states[id] != "stopping") {
          //replace states[id] with true
          states[id] = "true";
        } else if (
          terminalOutput[id].includes("Failed to start the minecraft server")
        ) {
          states[id] = "false";
          console.log("Server " + id + " failed to start.");

          killObstructingProcess(parseInt(id));
          ls.kill();
        }
      });
ls.stderr.on("data", data => {
  const text = data.toString("utf8");
  // Prevent stderr from growing unbounded (100MB limit)
  if (terminalOutput[id].length < 100 * 1024 * 1024) {
    terminalOutput[id] += "\n" + text;
  }
    if (terminalOutput[id].includes("to the Docker daemon")) {
      terminalOutput[id] = "[Crash]: Docker is not properly setup. Contact an admin.";
      states[id] = "false";
      console.log("Server " + id + " could not start: Docker is not set up correctly.");
    }
  // This handler fires per stderr chunk, so nothing unconditional goes here.
});

      let count2 = 0;
      let intervalID = setInterval(() => {
        if (states[id] == "stopping") {
          // Fires every 200ms while stopping — logging here floods the panel.
          if (count2 < 5 * 24) {
            ls.stdin.write("stop\n");
            count2++;
          }
        }
      }, 200);
      eventEmitter.on("writeCmd:" + id, function () {
        ls.stdin.write(terminalInput + "\n");
      });
      ls.on("exit", (code) => {
                  // terminalOutput[id] already up to date via stdout append
        states[id] = "false";
        console.log("Server " + id + " stopped (exit code " + code + ")");
        // The last 2000 chars go to logs/crash.txt below when this wasn't a
        // clean stop — no need to mirror server output into the panel console.

        if (!fs.existsSync("logs/crash.txt")) {
          fs.writeFileSync("logs/crash.txt", "");
        }
        if (
          !terminalOutput[id].includes("stop") &&
          !terminalOutput[id].includes("Stopping server") &&
          !terminalOutput[id].includes("Stopping the server") &&
          !terminalOutput[id].includes("Server stopped")
        ) {
          fs.appendFileSync(
            "logs/crash.txt", Date.now().toString() + "\n" +
            terminalOutput[id].slice(-2000) + "\n"
          );
        }
        clearInterval(intervalID);
      });
      }); //whenClearToBoot
    }

    //for every item in the cmd array, run the command
    //`ls` is only set here when the spawn happened synchronously above - the
    //installer path (and now a held modpack install) assigns it later, so this
    //has always been a no-op for those and must not throw for them either
    for (let i in cmd) {
      if (ls && cmd[i] != undefined && cmd[i] != "op") {
        ls.stdin.write(cmd[i] + "\n");
      }
    }

    var text = fs.readFileSync("assets/template/geyserconfig.yml", "utf8");
    var textByLine = text.split("\n");
    textByLine[15] = "  port: " + port;

    text = textByLine.join("\n");

    const geyserStampedJar = fs.readdirSync("assets/jars").find(f => f.startsWith("geyser-spigot-") && f.endsWith(".jar"));

    if (software == "paper" || software == "spigot") {
      if (
        geyserStampedJar &&
        (fs.existsSync(folder + "/plugins/cx_geyser-spigot_Geyser.jar") ||
          isNew)
      ) {
        fs.copyFileSync(
          "assets/jars/" + geyserStampedJar,
          folder + "/plugins/cx_geyser-spigot_Geyser.jar"
        );
        fs.copyFileSync(
          "assets/jars/floodgate-spigot.jar",
          folder + "/plugins/cx_floodgate-spigot_Floodgate.jar"
        );
        try {
          const tag = geyserStampedJar.replace("geyser-spigot-", "").replace(".jar", "");
          const decoded = Buffer.from(tag, "base64").toString("utf8");
          const colonIdx = decoded.indexOf(":");
          const buildNumber = decoded.slice(0, colonIdx);
          const timestamp = decoded.slice(colonIdx + 1);
          const date = new Date(timestamp);
          const dateStr = date.toLocaleString("en-US", { month: "long", day: "numeric" });
          setTimeout(() => {
            terminalOutput[id] += `\n[Arth]: Geyser build ${buildNumber} from ${dateStr} is installed`;
          }, 2000);
        } catch (_) {}
      }
      //create /plugins/Geyser-Spigot/
      if (!fs.existsSync(folder + "/plugins/Geyser-Spigot")) {
        fs.mkdirSync(folder + "/plugins/Geyser-Spigot");
      }
      if (!server.adminServer && !fs.existsSync(folder + "/plugins/Geyser-Spigot/config.yml")) {
        fs.writeFileSync(folder + "/plugins/Geyser-Spigot/config.yml", text);
      }

      fs.copyFile(
        "assets/template/downloading/cx_geyser-spigot_Geyser.jar",
        folder + "/plugins/cx_geyser-spigot_Geyser.jar",
        (err) => {}
      );

      fs.copyFile(
        "assets/template/downloading/cx_floodgate-spigot_Floodgate.jar",
        folder + "/plugins/cx_floodgate-spigot_Floodgate.jar",
        (err) => {}
      );
    } else if (software == "velocity") {
      if (
        fs.existsSync("assets/jars/cx_geyser-velocity_Geyser.jar") &&
        (fs.existsSync(folder + "/plugins/cx_geyser-velocity_Geyser.jar") ||
          isNew)
      ) {
        if (!isNew) {
          fs.unlinkSync(folder + "/plugins/cx_geyser-velocity_Geyser.jar");
          fs.unlinkSync(
            folder + "/plugins/cx_floodgate-velocity_Floodgate.jar"
          );
        }
        fs.copyFileSync(
          "assets/jars/cx_geyser-velocity_Geyser.jar",
          folder + "/plugins/cx_geyser-velocity_Geyser.jar"
        );
        fs.copyFileSync(
          "assets/jars/cx_floodgate-velocity_Floodgate.jar",
          folder + "/plugins/cx_floodgate-velocity_Floodgate.jar"
        );
      }
      //create /plugins/Geyser-Spigot/
      if (!fs.existsSync(folder + "/plugins/Geyser-Velocity")) {
        fs.mkdirSync(folder + "/plugins/Geyser-Velocity");
      }
      if (!server.adminServer && !fs.existsSync(folder + "/plugins/Geyser-Velocity/config.yml")) {
        fs.writeFileSync(folder + "/plugins/Geyser-Velocity/config.yml", text);
      }
      fs.copyFile(
        "assets/template/downloading/cx_geyser-velocity_Geyser.jar",
        folder + "/plugins/cx_geyser-velocity_Geyser.jar",
        (err) => {}
      );

      fs.copyFile(
        "assets/template/downloading/cx_floodgate-velocity_Floodgate.jar",
        folder + "/plugins/cx_floodgate-velocity_Floodgate.jar",
        (err) => {}
      );
    }



  } catch (e) {
    console.log(e.message);
    terminalOutput[id] =
      "Server failed to start. Here is the error message:\n\n"+e.message+"\n"+e.stack;
    for (let i in e.message.split("\n")) {
      let item = e.message.split("\n")[i];
      if (item.includes("no such file or directory, open")) terminalOutput[id] = "[Error]: Missing file "+ item.split("y, open ")[1];
    }
    states[id] = "false";
  }
}
// A server held for manual mods has no process to send `stop` to, so its state
// would never settle back to "false" on its own. Dropping the hold is the stop.
function isHeldForManualMods(id) {
  return getPendingManualMods(id).length > 0;
}

function stop(id) {
  if (isHeldForManualMods(id)) {
    releaseManualModsHold(id);
    states[id] = "false";
    return;
  }
  states[id] = "stopping";
}

function stopAsync(id, callback) {
  if (states[id] == "false") {
    callback();
  } else if (isHeldForManualMods(id)) {
    releaseManualModsHold(id);
    states[id] = "false";
    callback();
  } else {
    states[id] = "stopping";
    const intervalId = setInterval(() => {
      if (states[id] === "false") {
        clearInterval(intervalId); // Clear the interval once the condition is met
        callback();
      }
    }, 200);
  }
}

function killAsync(id, callback) {
  if (states[id] == "false") {
    callback();
  } else {
    releaseManualModsHold(id);
    killObstructingProcess(parseInt(id));
    states[id] = "false";
    callback();
  }
}

function kill(id) {
  releaseManualModsHold(id);
  killObstructingProcess(parseInt(id));
  states[id] = "false";
}

// Last `chars` of a server's console output, without touching the incremental
// read index readTerminal() maintains for connected clients. Used by the
// modpack checker to record why a start failed.
function getTerminalTail(id, chars = 4000) {
  const output = terminalOutput[id];
  if (typeof output !== "string") return "";
  return output.length > chars ? output.slice(output.length - chars) : output;
}
// Global state to track terminal processing index
if (typeof globalTerminalState === 'undefined') {
  var globalTerminalState = {};
}

function readTerminal(id) {
  let server = readJSON("servers/" + id + "/server.json");
  let fullOutput = terminalOutput[id];
  
  // Initialize processing state
  if (!globalTerminalState[id]) {
    globalTerminalState[id] = { index: 0 };
  }
  let state = globalTerminalState[id];
  if (fullOutput === undefined) {
    fullOutput = "";
  }
  // Process only new content
  let newOutput = fullOutput.slice(state.index);
  state.index = fullOutput.length;
  
  // Process each line individually
  let lines = newOutput.split('\n');
  for (let line of lines) {
    // Java player join
    if (line.includes("UUID of player")) {
      let match = line.match(/UUID of player (\w+) is ([a-f0-9-]+)/);
      if (match) {
        let name = match[1];
        let uuid = match[2];
        
        players[id] = players[id] || [];
        if (!players[id].some(p => p.uuid === uuid)) {
          players[id].push({ name, uuid });
        }
      }
    }
    
    // Bedrock player join
    if (line.includes(" joined (UUID: ")) {
      let match = line.match(/(.*) joined \(UUID: ([a-f0-9-]+)\)/);
      if (match) {
        let fullName = match[1];
        let name = '.' + fullName.split('.').pop();
        let uuid = match[2];
        
        players[id] = players[id] || [];
        if (!players[id].some(p => p.uuid === uuid)) {
          players[id].push({ name, uuid });
        }
      }
    }
    
    // Player leave (both Java/Bedrock)
    if (line.includes(" left the game")) {
      let match = line.match(/: (\S+) left the game$/);
      if (match) {
        let name = match[1];
        console.log("Player left: " + name);
        players[id] = players[id] || [];
        players[id] = players[id].filter(p => p.name !== name);
      }
    }
  }
  
  // Return simplified output
  return files.simplifyTerminal(fullOutput, server.software);
}


function writeTerminal(id, cmd) {
  terminalInput = cmd;
  let timestamp = new Date().toLocaleTimeString();
  console.log("[" + timestamp + "] writing to terminal: " + cmd);
  eventEmitter.emit("writeCmd:" + id);
}
// Runs `worker` over `items` with at most `limit` in flight at once. `limit`
// defaults to Infinity (start everything at once) so normal customer installs
// keep their existing behavior — only callers that pass a real cap (the
// modpack checker) are throttled. Workers here never reject, so this only
// needs to track completion, not success/failure.
function runLimited(items, limit, worker) {
  return new Promise((resolve) => {
    if (items.length === 0) return resolve();
    let index = 0;
    let inFlight = 0;
    let completed = 0;

    function startNext() {
      while (inFlight < limit && index < items.length) {
        const item = items[index++];
        inFlight++;
        worker(item).then(() => {
          inFlight--;
          completed++;
          if (completed === items.length) resolve();
          else startNext();
        });
      }
    }

    startNext();
  });
}

// Looks up the real download URL for one CurseForge mod file, with a couple
// retries. A 429/5xx here is CurseForge asking us to back off, not the mod
// being unavailable - blindly treating it the same as a clean "no data"
// response (an author who disabled third-party downloads) turns transient
// rate-limit noise into a permanent "mod failed" result, which is exactly
// what made the modpack checker's throttled, multi-minute download runs
// (see MOD_DOWNLOAD_CONCURRENCY in modpackChecker.js) shed far more mods
// than a customer's install, which fires every lookup at once and clears in
// a couple of seconds. Only the transient cases are retried; a real "no
// data" 200 is never retried since asking again won't change the answer.
// Turns a curl outcome into the kind of sentence a human reading the admin
// dashboard actually wants, instead of a bare status code.
function describeCurseForgeFailure(status, error) {
  if (error) return `Request failed (${error.message})`;
  if (status === 429) return "Rate limited by CurseForge";
  // CurseForge's own documented behavior for this endpoint: a 403 here means
  // the author turned off third-party download hosting for this file, not
  // that our key is bad (a bad key would 403 every mod, not a handful).
  if (status === 403) return "Author disabled third-party downloads (403)";
  if (status === 404) return "File not found on CurseForge";
  if (status >= 500 && status < 600) return `CurseForge server error (HTTP ${status})`;
  if (status === 200) return "Author disabled third-party downloads";
  return `HTTP ${status === null || Number.isNaN(status) ? "unknown" : status}`;
}

function fetchCurseForgeDownloadUrl(projectID, fileID, apiKey, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = [1500, 4000];
  const STATUS_MARKER = "HTTPSTATUS:";

  return new Promise((resolve) => {
    exec(
      `curl -s -w '\\n${STATUS_MARKER}%{http_code}' -X GET "https://api.curseforge.com/v1/mods/${projectID}/files/${fileID}/download-url" -H 'x-api-key: ${apiKey}'`,
      (error, stdout) => {
        stdout = stdout || "";
        const markerIndex = stdout.lastIndexOf(STATUS_MARKER);
        const status = markerIndex !== -1 ? parseInt(stdout.slice(markerIndex + STATUS_MARKER.length)) : null;
        const body = markerIndex !== -1 ? stdout.slice(0, markerIndex) : stdout;

        let url = null;
        try {
          url = JSON.parse(body).data || null;
        } catch (e) {
          // Not JSON (an HTML error page, a truncated body, ...) - url stays null.
        }

        if (url) return resolve({ url, reason: null });

        const transient = !!error || status === 429 || (status >= 500 && status < 600);
        if (transient && attempt < MAX_ATTEMPTS) {
          const delay = BACKOFF_MS[attempt - 1] || 4000;
          console.log(
            `CurseForge download-url lookup for mod ${projectID} file ${fileID} got ` +
              `${error ? "an exec error (" + error.message + ")" : "HTTP " + status} - ` +
              `retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_ATTEMPTS}).`
          );
          setTimeout(() => {
            fetchCurseForgeDownloadUrl(projectID, fileID, apiKey, attempt + 1).then(resolve);
          }, delay);
          return;
        }

        const reason = describeCurseForgeFailure(status, error);
        console.log(
          `CurseForge has no usable download for mod ${projectID} file ${fileID}: ` +
            `${reason} - ${(body || "(empty body)").slice(0, 200).trim()}`
        );
        resolve({ url: null, reason });
      }
    );
  });
}

// Downloads one mod file with a couple of retries. A valid download URL
// doesn't guarantee the transfer itself succeeds - a CDN edge hiccup or a
// dropped connection leaves an empty/missing file with no explanation, which
// is exactly what showed up as "File never landed on disk" with zero detail
// once the lookup-step retry above started actually distinguishing real
// blocks (403s) from transient ones. `files.downloadAsync` (used elsewhere
// for one-off downloads) doesn't check the result or report why, so this
// runs its own curl instead of reusing it, keeping that shared helper's
// behavior untouched for its other callers.
function downloadModFileWithRetry(destPath, url, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = [1500, 4000];

  return new Promise((resolve) => {
    exec(`curl -sS --max-time 60 -o "${destPath}" -L "${url}"`, (error) => {
      let ok = false;
      try {
        ok = fs.existsSync(destPath) && fs.statSync(destPath).size > 0;
      } catch (e) {}

      if (ok) return resolve({ ok: true, reason: null });

      if (attempt < MAX_ATTEMPTS) {
        const delay = BACKOFF_MS[attempt - 1] || 4000;
        console.log(
          `Downloading ${destPath} failed` +
            (error ? ` (${error.message})` : " (empty file)") +
            ` - retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_ATTEMPTS}).`
        );
        setTimeout(() => {
          downloadModFileWithRetry(destPath, url, attempt + 1).then(resolve);
        }, delay);
        return;
      }

      resolve({
        ok: false,
        reason: error
          ? `Download failed after ${MAX_ATTEMPTS} attempts (${error.message})`
          : `Download produced an empty file after ${MAX_ATTEMPTS} attempts`,
      });
    });
  });
}

// CurseForge exposes, per mod project, whether its author lets third-party
// launchers download it (`allowModDistribution`). A false there means every
// download-url lookup for that mod comes back empty no matter how often we
// ask, so the pack cannot be installed unattended - somebody has to fetch
// those jars from the website by hand.
//
// Looked up in bulk via POST /v1/mods rather than per mod, so a 200-mod pack
// costs one or two extra requests instead of 200 on top of the download-url
// calls the install already makes. CurseForge doesn't document a cap on
// modIds.length, so this chunks conservatively rather than assuming one -
// a request that's too large should degrade to several smaller ones, not
// silently drop mods off the end of an untested limit. This is only ever an
// optimization: fetchCurseForgeDownloadUrl() below still catches a mod this
// call misses (a false negative here just costs one wasted lookup, not a
// missed detection).
function fetchCurseForgeModMeta(projectIDs, apiKey) {
  const CHUNK = 100;
  const unique = [
    ...new Set(projectIDs.map(Number).filter((n) => !Number.isNaN(n))),
  ];
  const meta = new Map();

  const fetchChunk = (chunk) =>
    new Promise((resolve) => {
      //single-quoted for the shell, so any quote inside the JSON has to be escaped
      const body = JSON.stringify({ modIds: chunk }).replace(/'/g, "'\\''");
      exec(
        `curl -s -X POST "https://api.curseforge.com/v1/mods" ` +
          `-H 'x-api-key: ${apiKey}' -H 'Content-Type: application/json' ` +
          `-H 'Accept: application/json' --data '${body}'`,
        { maxBuffer: 64 * 1024 * 1024 },
        (error, stdout) => {
          if (error) {
            console.log("CurseForge bulk mod lookup failed: " + error.message);
            return resolve();
          }
          try {
            const mods = JSON.parse(stdout).data || [];
            for (const mod of mods) {
              meta.set(mod.id, {
                name: mod.name,
                slug: mod.slug,
                websiteUrl: (mod.links && mod.links.websiteUrl) || null,
                logoUrl: (mod.logo && mod.logo.thumbnailUrl) || null,
                // Only an explicit false counts as blocked - a missing field
                // (an older or partial response) must not park a whole server.
                allowModDistribution: mod.allowModDistribution,
              });
            }
          } catch (e) {
            console.log("CurseForge bulk mod lookup returned unparseable JSON.");
          }
          resolve();
        }
      );
    });

  const chunks = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    chunks.push(unique.slice(i, i + CHUNK));
  }
  return chunks
    .reduce((chain, chunk) => chain.then(() => fetchChunk(chunk)), Promise.resolve())
    .then(() => meta);
}

// The jar's own file name, so the upload modal can tell the user exactly which
// file the server is waiting for. Only called for mods already known to be
// blocked, so this is a handful of requests per pack rather than one per mod.
// The file endpoint still serves metadata when `downloadUrl` is null, which is
// the whole reason it's usable here.
function fetchCurseForgeFileName(projectID, fileID, apiKey) {
  return new Promise((resolve) => {
    exec(
      `curl -s -X GET "https://api.curseforge.com/v1/mods/${projectID}/files/${fileID}" -H 'x-api-key: ${apiKey}'`,
      (error, stdout) => {
        if (error) return resolve(null);
        try {
          const data = JSON.parse(stdout).data || {};
          resolve(data.fileName || data.displayName || null);
        } catch (e) {
          resolve(null);
        }
      }
    );
  });
}

function isThirdPartyBlockedReason(reason) {
  return (
    typeof reason === "string" &&
    reason.toLowerCase().includes("third-party downloads")
  );
}

// deleteClientSideMods() bins anything on this list right after an install, so
// there's no point sending the user off to CurseForge for one - the jar would
// be deleted the moment it landed. Same normalisation as the deleter itself.
function isClientSideModName(fileName) {
  if (!fileName) return false;
  let list;
  try {
    list = fs.readFileSync("assets/clientsidemods.txt", "utf8").split("\n");
  } catch (e) {
    return false;
  }
  const normalized = fileName.toLowerCase().replace(/[-_]/g, "");
  return list.some((entry) => {
    const match = entry.toLowerCase().replace(/[-_]/g, "").trim();
    return match && normalized.includes(match);
  });
}

// Turns the raw blocked-mod records into what the panel shows the user: a real
// mod name, the CurseForge pages to grab the jar from, and the file name the
// server expects.
function buildManualModList(id, blocked, apiKey) {
  return Promise.all(
    blocked.map(({ projectID, fileID, info }) =>
      fetchCurseForgeFileName(projectID, fileID, apiKey).then((fileName) => ({
        projectId: projectID,
        fileId: fileID,
        name: info.name || "CurseForge mod " + projectID,
        fileName: fileName || null,
        logoUrl: info.logoUrl || null,
        //  /files/<id> is the page with the changelog and the button;
        //  /download/<id> starts the download straight away.
        pageUrl: info.websiteUrl ? info.websiteUrl + "/files/" + fileID : null,
        downloadUrl: info.websiteUrl
          ? info.websiteUrl + "/download/" + fileID
          : null,
      }))
    )
  ).then((mods) => mods.filter((m) => !isClientSideModName(m.fileName || m.name)));
}

// Per-server record of an in-flight (or finished) modpack install. run() uses
// this to hold a server back from booting while its mods are still landing,
// and to park it indefinitely when the pack contains mods CurseForge won't
// serve - see whenClearToBoot().
const modpackDownloads = {};

function beginModpackDownload(id) {
  modpackDownloads[id] = {
    done: false,
    startedAt: Date.now(),
    manualMods: [],
    announced: false,
    waitAnnounced: false,
    released: false,
    cancelled: false,
  };
}

function finishModpackDownload(id, manualMods, download) {
  // A download abandoned by its caller (the checker moving on to the next
  // pack, a reinstall landing mid-flight) can settle long after a newer
  // downloadModpack() call has replaced the record for this id. Marking the
  // new record done would let whoever is waiting on it proceed with a
  // half-installed pack, so a finish only counts for the record it belongs to.
  if (download && modpackDownloads[id] !== download) return;
  if (!modpackDownloads[id]) beginModpackDownload(id);
  modpackDownloads[id].manualMods = manualMods || [];
  modpackDownloads[id].done = true;
}

// True once the downloadModpack() call currently on record for this server has
// fully settled - every download finished (or conclusively failed), filters
// run, manual-mod list built. The modpack checker waits on this for server
// packs, which carry their mods pre-bundled and no manifest, so the index-file
// rewrite it watches for manifest packs never happens.
function isModpackDownloadSettled(id) {
  const d = modpackDownloads[id];
  return !!(d && d.done);
}

// The mods this server is still waiting on. Empty once the user has supplied
// them (or gave up and stopped the server), so this doubles as "is this server
// currently held?".
//
// Gated on `announced`, not just `done` - a modpack can be (re)installed on an
// already-running server via POST /:id/modpack, which calls downloadModpack()
// directly without going through run(). That path never engages
// whenClearToBoot (see heldForModpack in run()), so it never actually holds a
// boot - the next Start is a normal, ungated one. Without this check, this
// function would still report the blocked mods from that install, and the
// frontend would show a "server is waiting on mods" modal for a server that
// isn't waiting on anything - it already started (or will) regardless.
function getPendingManualMods(id) {
  const d = modpackDownloads[id];
  if (!d || !d.done || !d.announced || d.released || d.cancelled) return [];
  return d.manualMods.map((mod) => ({ ...mod }));
}

// Called by POST /server/:id/manual-mods once the uploaded jars are on disk.
function resumeManualMods(id) {
  const d = modpackDownloads[id];
  if (!d) return false;
  d.released = true;
  d.manualMods = [];
  if (typeof terminalOutput[id] === "string") {
    terminalOutput[id] +=
      "\n[Arth Hosting] Manual mods received — starting the server.";
  }
  console.log("Server " + id + " released from its manual-mod hold.");
  return true;
}

// A held server has no process to send `stop` to, so stopping one means
// dropping the hold itself - otherwise whenClearToBoot() would boot it later.
function releaseManualModsHold(id) {
  if (modpackDownloads[id]) modpackDownloads[id].cancelled = true;
}

function announceManualMods(id) {
  const d = modpackDownloads[id];
  if (!d || d.announced) return;
  d.announced = true;
  states[id] = "starting";
  if (typeof terminalOutput[id] !== "string") terminalOutput[id] = "";
  // The frontend watches for this exact prefix and opens the upload modal with
  // the JSON that follows it, so keep the wording stable and keep it one line.
  terminalOutput[id] +=
    "\n[Arth Hosting] This server has the following mods that need to be downloaded manually: " +
    JSON.stringify({ mods: d.manualMods });
  console.log(
    "Server " +
      id +
      " is holding startup for " +
      d.manualMods.length +
      " mod(s) CurseForge won't serve."
  );
}

// Give up waiting on a download that never settled rather than parking the
// server forever - something upstream broke, and a stuck "starting" with no
// console is worse than a server that boots with mods missing.
const MAX_DOWNLOAD_HOLD_MS = 30 * 60 * 1000;

// Calls `start` as soon as this server is clear to boot. `engaged` is false for
// every server that didn't kick off a modpack download in this run() call
// (restarts, and the modpack checker, which downloads separately and would
// otherwise inherit a stale hold) - those start synchronously, exactly as
// before.
function whenClearToBoot(id, engaged, start) {
  if (!engaged) return start();

  const check = () => {
    const d = modpackDownloads[id];
    if (!d) return start();
    if (d.cancelled) return;

    if (!d.done) {
      if (Date.now() - d.startedAt > MAX_DOWNLOAD_HOLD_MS) {
        console.log(
          "Modpack download for server " + id + " never finished — booting anyway."
        );
        return start();
      }
      if (!d.waitAnnounced) {
        d.waitAnnounced = true;
        if (typeof terminalOutput[id] !== "string") terminalOutput[id] = "";
        terminalOutput[id] += "\n[Arth Hosting] Downloading modpack mods…";
      }
      return setTimeout(check, 1000);
    }

    if (!d.released && d.manualMods.length > 0) {
      announceManualMods(id);
      return setTimeout(check, 1000);
    }

    start();
  };

  check();
}

function downloadModpack(id, modpackURL, modpackID, versionID, concurrency = Infinity) {
  const folder = "servers/" + id;
  resetDownloadProgress(id);
  beginModpackDownload(id);
  // Every finish below names this record so a finish outliving this call
  // can't settle a newer install's record - see finishModpackDownload.
  const download = modpackDownloads[id];

  // Every mod below is fetched with `curl -o <folder>/mods/<name>.jar`, and
  // curl won't create the directory — it just fails, silently, for every mod.
  // run() happens to make this folder before it calls us, so callers that
  // download first (the modpack checker) would otherwise install nothing.
  try {
    fs.mkdirSync(folder + "/mods", { recursive: true });
  } catch (e) {
    console.log("Could not create mods folder for server " + id + ": " + e.message);
  }

  if (modpackURL.includes("modrinth.com")) {
    files.downloadAsync(
      folder + "/modpack.mrpack",
      modpackURL,
      (error, stdout, stderr) => {
        exec(
          "unzip -o " + folder + "/modpack.mrpack" + " -d " + folder,
          (error, stdout, stderr) => {
            exec(
              "cp -r " + folder + "/overrides/* " + folder + "/",
              (error, stdout, stderr) => {
                if (fs.existsSync(folder + "/modrinth.index.json")) {
                  //there's an odd bug where the file has no read access, so this changes that
                  exec("chmod +r " + folder + "/modrinth.index.json", (x) => {
                    modpack = JSON.parse(
                      fs.readFileSync(folder + "/modrinth.index.json")
                    );

                    //for each file in modpack.files, download it
                    const modFilesToDownload = [];
                    for (let i in modpack.files) {
                      //if the prefixhas a backslash, convert it to slash, as backslashes are ignored in linux
                      if (modpack.files[i].path.includes("\\")) {
                        modpack.files[i].prefix = modpack.files[i].path.replace(
                          /\\/g,
                          "/"
                        );
                      }

                      if (modpack.files[i].path.includes("mods/")) {
                        modFilesToDownload.push(modpack.files[i]);
                      }
                    }
                    //don't scan/filter mods or hand back control until every mod
                    //download above has actually finished writing to disk
                    downloadProgress[id].total = modFilesToDownload.length;
                    runLimited(modFilesToDownload, concurrency, (file) => new Promise((resolve) => {
                      const displayName = file.path.split("mods/")[1] || file.path;
                      downloadProgress[id].inFlight.push(displayName);
                      const destPath =
                        folder +
                          "/mods/lr_" +
                          file.downloads[0].split("data/")[1].split("/versions")[0] + "_" +
                          file.path.split("mods/")[1].split(".jar")[0].replace("_", "-").replace(" ", "-")+".jar";
                      // downloadModFileWithRetry retries transient CDN blips on
                      // its own, and only reports back once it's given up - so
                      // "not ok" here means the file genuinely never landed.
                      downloadModFileWithRetry(destPath, file.downloads[0]).then(({ ok, reason }) => {
                        const idx = downloadProgress[id].inFlight.indexOf(displayName);
                        if (idx !== -1) downloadProgress[id].inFlight.splice(idx, 1);
                        if (ok) {
                          downloadProgress[id].completed++;
                        } else {
                          downloadProgress[id].failed++;
                          downloadProgress[id].failedMods.push({
                            name: displayName,
                            reason: reason || "Download failed for an unknown reason",
                            // No per-file project id in modrinth.index.json to
                            // look a real mod name up by - displayName is
                            // already the real filename, unlike the CF branch.
                            platform: "mr",
                            projectId: null,
                          });
                        }
                        resolve();
                      });
                    })).then(() => {
                    //copy override mods over one again since sometimes it doesnt work
                    execSync(
                      "cp -r " + folder + "/overrides/* " + folder + "/"
                    );
                    //add in modpackID so that it frontends can check for updates later
                    modpack.projectID = modpackID;
                    modpack.platform = "mr";
                    modpack.currentVersionDateAdded = Date.now();
                    modpack.versionID = versionID;
                    writeJSON(folder + "/modrinth.index.json", modpack);
                    deleteClientSideMods(id);
                    resolveModConflicts(id);
                    // Modrinth serves every file from its own CDN, so there's
                    // no equivalent of CurseForge's per-author distribution
                    // opt-out and nothing can ever need a manual upload here.
                    finishModpackDownload(id, [], download);
                    // Cosmetic, so it runs alongside rather than blocking.
                    setModpackIcon(id, "mr", modpackID).catch((e) =>
                      console.log("Modpack icon failed for " + id + ": " + e.message)
                    );
                    return utils.refreshPermissions();
                    });
                  });
                } else {
                  // No index file means the download or unzip fell over. Let
                  // the server through rather than parking it on a hold that
                  // will never resolve.
                  finishModpackDownload(id, [], download);
                }
              }
            );
          }
        );
      }
    );
    //curseforge download URLs are usually from 'forgecdn.net', so we check for 'forge' instead of 'curseforge'.
  } else if (modpackURL.includes("forge")) {
    const apiKey = config.curseforgeKey;

    files.downloadAsync(
      folder + "/modpack.zip",
      modpackURL,
      (error, stdout, stderr) => {
        console.log("downloading modpack from forge...");
        //make the directory "temp"
        if (!fs.existsSync(folder + "/temp")) {
          fs.mkdirSync(folder + "/temp");
        }
        exec(
          "unzip -o " + folder + "/modpack.zip" + " -d " + folder + "/temp",
          (error, stdout, stderr) => {
            let overridesFolder = "/temp/overrides";
            //if theres no overrides folder, get the name of the folder inside temp
            if (!fs.existsSync(folder + "/temp/overrides")) {
              overridesFolder = "/temp";
              //deletes .txt files, so it only moves over mods and configs and such
              exec(
                "find " + folder + "/temp -type f -name '*.txt' -delete",
                () => {}
              );

              if (fs.existsSync(folder + "/temp/server.properties")) {
                fs.unlinkSync(folder + "/temp/server.properties");
              }

              //this detects if theres only one folder in the temp folder
              let tempFiles = fs.readdirSync(folder + "/temp");
              if (tempFiles.length == 1 && tempFiles[0] != "mods") {
                let subfolderFiles = fs.readdirSync(
                  folder + "/temp/" + tempFiles[0]
                );
                for (let i in subfolderFiles) {
                  if (subfolderFiles[i] != "server.properties") {
                    fs.renameSync(
                      folder +
                        "/temp/" +
                        tempFiles[0] +
                        "/" +
                        subfolderFiles[i],
                      folder + "/temp/" + subfolderFiles[i]
                    );
                  }
                }
              }

              console.log(overridesFolder);
            }

            console.log("Unzipping modpack for server " + id + "...");
            if (error) console.log("Modpack unzip error for " + id + ": " + error.message);
            exec(
              "cp -r " + folder + overridesFolder + "/* " + folder + "/",
              (error, stdout, stderr) => {
                if (fs.existsSync(folder + "/temp/manifest.json")) {
                  //there's an odd bug where the file has no read access, so this changes that
                  exec("chmod +r " + folder + "/temp/manifest.json", (x) => {
                    fs.copyFileSync(
                      folder + "/temp/manifest.json",
                      folder + "/curseforge.index.json"
                    );
                    modpack = JSON.parse(
                      fs.readFileSync(folder + "/curseforge.index.json")
                    );
                    console.log("modpackID:" + modpackID);
                    //don't scan/filter mods or clean up until every mod
                    //download above has actually finished writing to disk
                    downloadProgress[id].total = modpack.files.length;
                    // Mods CurseForge won't hand over, collected as the loop
                    // runs and handed to run() at the end so it can park the
                    // server until the user uploads them.
                    const blocked = [];
                    fetchCurseForgeModMeta(
                      modpack.files.map((f) => f.projectID),
                      apiKey
                    ).then((modMeta) => {
                      const blockedUpFront = modpack.files.filter(
                        (f) =>
                          (modMeta.get(Number(f.projectID)) || {})
                            .allowModDistribution === false
                      ).length;
                      if (blockedUpFront > 0) {
                        console.log(
                          "Modpack for server " + id + ": " + blockedUpFront + " of " +
                            modpack.files.length +
                            " mods have third-party downloads disabled and will need uploading by hand."
                        );
                      }
                      return runLimited(modpack.files, concurrency, (file) => new Promise((resolve) => {
                      let projectID = file.projectID;
                      let fileID = file.fileID;
                      console.log(projectID + " " + fileID);
                      const displayName = "CF mod " + projectID;
                      const destPath = folder + "/mods/cf_" + projectID + "_CFMod.jar";
                      downloadProgress[id].inFlight.push(displayName);
                      // fetchCurseForgeDownloadUrl and downloadModFileWithRetry
                      // both retry transient failures themselves, but this is
                      // still the final say on success - only count a mod once
                      // its jar is actually on disk, not just because neither
                      // helper reported an error.
                      const finishMod = (failureReason) => {
                        const idx = downloadProgress[id].inFlight.indexOf(displayName);
                        if (idx !== -1) downloadProgress[id].inFlight.splice(idx, 1);
                        let ok = false;
                        try {
                          ok = fs.existsSync(destPath) && fs.statSync(destPath).size > 0;
                        } catch (e) {}
                        if (ok) {
                          downloadProgress[id].completed++;
                        } else {
                          downloadProgress[id].failed++;
                          downloadProgress[id].failedMods.push({
                            name: displayName,
                            reason: failureReason || "Download failed for an unknown reason",
                            // displayName is just "CF mod <id>" - the manifest
                            // never carries a real name, so the frontend looks
                            // it up from this on click.
                            platform: "cf",
                            projectId: projectID,
                          });
                          // Only a distribution block is worth stopping the
                          // server for - it's the one failure retrying the
                          // install can never fix. Rate limits and CDN blips
                          // stay ordinary failures so a flaky run doesn't
                          // demand a manual upload the user doesn't owe.
                          if (
                            isThirdPartyBlockedReason(failureReason) ||
                            modInfo.allowModDistribution === false
                          ) {
                            blocked.push({ projectID, fileID, info: modInfo });
                          }
                        }
                        resolve();
                      };
                      const modInfo = modMeta.get(Number(projectID)) || {};
                      // CurseForge has already told us this one is off limits,
                      // so skip the lookup instead of spending a request to be
                      // told 403.
                      if (modInfo.allowModDistribution === false) {
                        return finishMod("Author disabled third-party downloads");
                      }
                      fetchCurseForgeDownloadUrl(projectID, fileID, apiKey).then(({ url, reason }) => {
                        if (!url) return finishMod(reason);
                        downloadModFileWithRetry(destPath, url).then(({ reason: dlReason }) =>
                          finishMod(dlReason)
                        );
                      });
                    }));
                    }).then(() => {
                    //add in modpackID so that it frontends can check for updates later
                    modpack.projectID = modpackID;
                    modpack.platform = "cf";
                    modpack.currentVersionDateAdded = Date.now();
                    modpack.versionID = versionID;
                    writeJSON(folder + "/curseforge.index.json", modpack);
                    deleteClientSideMods(id);
                    resolveModConflicts(id);
                    // Naming the blocked mods needs one request each, so it
                    // runs after the filters rather than before - the index
                    // file above is the modpack checker's completion signal
                    // and mustn't wait on the network. With nothing blocked
                    // this resolves on the next tick and costs the boot
                    // nothing.
                    buildManualModList(id, blocked, apiKey)
                      .then((manualMods) => finishModpackDownload(id, manualMods, download))
                      .catch((e) => {
                        console.log(
                          "Could not describe blocked mods for server " + id + ": " + e.message
                        );
                        finishModpackDownload(id, [], download);
                      });
                    // Cosmetic, so it runs alongside rather than blocking.
                    setModpackIcon(id, "cf", modpackID).catch((e) =>
                      console.log("Modpack icon failed for " + id + ": " + e.message)
                    );
                    //remove temp folder
                    exec("rm -r " + folder + "/temp");
                    }).catch((e) => {
                      // Anything thrown above would otherwise leave run()
                      // waiting on a download that never reports back.
                      console.log("Modpack install for server " + id + " failed: " + e.message);
                      finishModpackDownload(id, [], download);
                    });
                  });
                } else {
                  // No manifest usually means this is a server pack - mods
                  // pre-bundled, nothing to download per-mod - and sometimes
                  // that the download or unzip fell over. Either way there is
                  // nothing to hold the server for, so settle the record and
                  // clear the extracted copy (the manifest path does this
                  // after its downloads; without it every server-pack install
                  // kept a full second copy of the pack in temp/).
                  exec("rm -r " + folder + "/temp");
                  finishModpackDownload(id, [], download);
                }
              }
            );
          }
        );
      }
    );
  } else {
    // A URL from neither host means nothing will be downloaded, so settle the
    // record immediately - run() waits on it before booting.
    console.log("Unrecognised modpack URL for server " + id + ": " + modpackURL);
    finishModpackDownload(id, [], download);
  }
}

function killObstructingProcess(id) {
  try {
    exec(
      `docker ps --filter "publish=${portOffset + id}" --format "{{.ID}}"`,
      (error, stdout, stderr) => {
        let pid = stdout.trim();
        exec("docker stop " + pid);

        setTimeout(() => {
          exec("docker kill " + pid);
        }, 2500);
      }
    );
  } catch (e) {
    console.log(e);
  }
}

function getPlayerList(id) {
  if (players[id] == undefined) {
    players[id] = [];
  }
  return players[id];
}

// Minecraft only reads servers/<id>/server-icon.png, and only when it is
// exactly 64x64. Modpack artwork is usually 256x256 and Modrinth sometimes
// serves WebP, so it has to be converted. Needs ImageMagick on the host
// (`apt install imagemagick`); without it the default icon is left alone.
let imageMagickBin; // undefined = not looked up yet, null = not installed

function findImageMagick() {
  if (imageMagickBin !== undefined) return imageMagickBin;

  imageMagickBin = null;
  for (const bin of ["magick", "convert"]) {
    try {
      execSync(`command -v ${bin}`, { stdio: "ignore" });
      imageMagickBin = bin;
      break;
    } catch (e) {
      // not on PATH
    }
  }

  if (!imageMagickBin) {
    console.log(
      "ImageMagick not found — modpack artwork won't be used as the server icon. " +
        "Install it with `apt install imagemagick`."
    );
  }
  return imageMagickBin;
}

async function modpackIconUrl(platform, modpackID) {
  if (modpackID === undefined || modpackID === null || modpackID === "") return null;

  try {
    if (platform === "mr") {
      const response = await fetch(
        `https://api.modrinth.com/v2/project/${encodeURIComponent(modpackID)}`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (!response.ok) return null;
      const project = await response.json();
      return project.icon_url || null;
    }

    const apiKey = config.curseforgeKey;
    if (!apiKey) return null;
    const response = await fetch(
      `https://api.curseforge.com/v1/mods/${encodeURIComponent(modpackID)}`,
      { headers: { "x-api-key": apiKey }, signal: AbortSignal.timeout(15000) }
    );
    if (!response.ok) return null;
    const logo = (await response.json())?.data?.logo;
    return (logo && (logo.thumbnailUrl || logo.url)) || null;
  } catch (e) {
    console.log("Could not look up modpack artwork: " + e.message);
    return null;
  }
}

async function setModpackIcon(id, platform, modpackID) {
  const magick = findImageMagick();
  if (!magick) return;

  const url = await modpackIconUrl(platform, modpackID);
  // Plain http(s) only. execFile below doesn't use a shell, but this also
  // rejects anything odd coming back from the APIs.
  if (!url || !/^https?:\/\/\S+$/.test(url)) return;

  const { execFile } = require("child_process");
  const tmp = `servers/${id}/.modpack-icon`;
  const dest = `servers/${id}/server-icon.png`;

  await new Promise((resolve) => {
    execFile("curl", ["-sS", "-L", "--max-time", "30", "-o", tmp, url], () => resolve());
  });
  if (!fs.existsSync(tmp)) return;

  await new Promise((resolve) => {
    execFile(
      magick,
      [
        // [0] takes the first frame — without it an animated source makes
        // ImageMagick write server-icon-0.png, server-icon-1.png, ...
        `${tmp}[0]`,
        // ^ scales to cover then centre-crops, so a non-square logo isn't squashed.
        "-resize",
        "64x64^",
        "-gravity",
        "center",
        "-extent",
        "64x64",
        // Force a plain 32-bit RGBA PNG; Minecraft is picky about the rest.
        `PNG32:${dest}`,
      ],
      (error, stdout, stderr) => {
        if (error) {
          console.log(
            "Could not convert modpack artwork for server " + id + ": " +
              String(stderr || error.message).trim()
          );
        } else {
          // The server reads this from inside the container as uid 1000, and
          // refreshPermissions may already have run by the time we get here.
          try {
            fs.chmodSync(dest, 0o664);
          } catch (e) {
            // best effort
          }
          console.log("Set modpack artwork as the server icon for " + id);
        }
        resolve();
      }
    );
  });

  try {
    fs.unlinkSync(tmp);
  } catch (e) {
    // best effort
  }
}

// What the two mods/ filters below took out on the most recent install, keyed
// by server id. Only the modpack checker reads it: without this, mods the panel
// itself removed look identical to mods that failed to download, and a healthy
// pack gets recorded as "179/187 mods".
const modFilterStats = {};

function emptyModFilterStats() {
  return { removedClientSide: [], disabledByConflict: [] };
}

function resetModFilterStats(id) {
  modFilterStats[id] = emptyModFilterStats();
}

function getModFilterStats(id) {
  const stats = modFilterStats[id] || emptyModFilterStats();
  return {
    removedClientSide: [...stats.removedClientSide],
    disabledByConflict: [...stats.disabledByConflict],
  };
}

// Live per-mod download progress, keyed by server id. Read by the modpack
// checker's stream endpoint so the admin dashboard can show a real "X/Y mods,
// N downloading right now" panel instead of a spinner for the several minutes
// a big pack takes to fetch.
const downloadProgress = {};

function emptyDownloadProgress() {
  return { total: 0, completed: 0, failed: 0, inFlight: [], failedMods: [] };
}

function resetDownloadProgress(id) {
  downloadProgress[id] = emptyDownloadProgress();
}

function getDownloadProgress(id) {
  const progress = downloadProgress[id] || emptyDownloadProgress();
  return { ...progress, inFlight: [...progress.inFlight], failedMods: [...progress.failedMods] };
}

// Returns the file names it deleted. Always runs before resolveModConflicts on
// an install, so it resets the whole record for this server.
function deleteClientSideMods(id) {
  // NOTE: `id` here is already the full server folder name (e.g. "128"),
  // same as everywhere else in this file (see `folder = "servers/" + id` in
  // run()/downloadModpack()) - do NOT add idOffset again here, that pointed
  // at a folder that doesn't exist (servers/228 instead of servers/128) and
  // made every call throw ENOENT, silently swallowed by the global
  // uncaughtException handler, so this never actually deleted anything.
  const modsFolder = "servers/" + id + "/mods";
  // A modpack whose mod downloads all failed (CurseForge returns nothing for
  // mods with third-party downloads disabled) never creates this folder, and
  // the server folder itself may have been removed by the time this runs —
  // downloadModpack calls us from a promise chain nobody awaits, so throwing
  // here surfaces as an unhandled rejection rather than being caught.
  resetModFilterStats(id);
  const removed = modFilterStats[id].removedClientSide;

  if (!fs.existsSync(modsFolder)) {
    console.log("No mods folder for server " + id + " — nothing to filter.");
    return removed;
  }
  const folder = fs.readdirSync(modsFolder);
  const list = fs.readFileSync("assets/clientsidemods.txt", "utf8").split("\n");
  for (let i = 0; i < folder.length; i++) {
    for (let j = 0; j < list.length; j++) {
      const modName = folder[i].toLowerCase().replace(/[-_]/g, "");
      const matchAgainst = list[j].toLowerCase().replace(/[-_]/g, "").trim();

      if (matchAgainst && modName.includes(matchAgainst)) {
        const modPath = modsFolder + "/" + folder[i];
        //skip directories (e.g. the Sinytra Connector's ".connector" cache
        //folder) - fs.unlinkSync throws EISDIR on those
        if (!fs.statSync(modPath).isFile()) {
          continue;
        }
        console.log("deleting client side mod: " + folder[i]);
        fs.unlinkSync(modPath);
        removed.push(folder[i]);
        //a file can match two entries in the list; without this the second
        //match statSyncs a path that no longer exists and throws
        break;
      }
    }
  }
  return removed;
}

// Some mods only break in the presence of another mod, so they can't live in
// clientsidemods.txt (which is an unconditional strip list). Rules live in
// assets/modconflicts.json as
//   [{ "disable": "radium", "whenPresent": ["modernfix"], "reason": "..." }]
// and the offender is renamed to .jar.disabled rather than deleted, so an
// admin can put it back from the Files tab without reinstalling the modpack.
// Returns the file names it disabled.
function resolveModConflicts(id) {
  //`id` is the full server folder name, same caveat as deleteClientSideMods
  const modsFolder = "servers/" + id + "/mods";
  if (!modFilterStats[id]) resetModFilterStats(id);
  const disabled = modFilterStats[id].disabledByConflict;

  if (!fs.existsSync(modsFolder)) {
    console.log("No mods folder for server " + id + " — no conflicts to check.");
    return disabled;
  }

  let rules;
  try {
    rules = JSON.parse(fs.readFileSync("assets/modconflicts.json", "utf8"));
  } catch (e) {
    console.log("Could not read assets/modconflicts.json: " + e.message);
    return disabled;
  }
  if (!Array.isArray(rules)) {
    console.log("assets/modconflicts.json is not an array — skipping conflict check.");
    return disabled;
  }

  const normalize = (name) => name.toLowerCase().replace(/[-_]/g, "").trim();

  //only live .jar files count, so anything already renamed to .jar.disabled is
  //neither a trigger nor a candidate and re-running this is a no-op
  const jars = fs
    .readdirSync(modsFolder)
    .filter(
      (f) =>
        f.toLowerCase().endsWith(".jar") &&
        fs.statSync(modsFolder + "/" + f).isFile()
    );
  const normalized = jars.map(normalize);

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule || !rule.disable || !Array.isArray(rule.whenPresent)) {
      continue;
    }
    const target = normalize(rule.disable);
    if (!target) {
      continue;
    }

    const targets = jars.filter((f, j) => normalized[j].includes(target));
    if (targets.length === 0) {
      continue;
    }

    //the target jar can't trigger its own rule
    const triggers = [];
    for (let k = 0; k < rule.whenPresent.length; k++) {
      const trigger = normalize(rule.whenPresent[k]);
      if (!trigger) {
        continue;
      }
      jars.forEach((f, j) => {
        if (normalized[j].includes(trigger) && !targets.includes(f)) {
          triggers.push(f);
        }
      });
    }
    if (triggers.length === 0) {
      continue;
    }

    for (let t = 0; t < targets.length; t++) {
      const modPath = modsFolder + "/" + targets[t];
      try {
        fs.renameSync(modPath, modPath + ".disabled");
        disabled.push(targets[t]);
        console.log(
          "disabled " +
            targets[t] +
            " on server " +
            id +
            " — conflicts with " +
            triggers.join(", ") +
            (rule.reason ? " (" + rule.reason + ")" : "")
        );
      } catch (e) {
        console.log(
          "could not disable " + targets[t] + " on server " + id + ": " + e.message
        );
      }
    }
  }

  return disabled;
}



module.exports = {
  run,
  stop,
  kill,
  checkServer,
  readTerminal,
  getTerminalTail,
  writeTerminal,
  stopAsync,
  proxiesToggle,
  getState,
  downloadModpack,
  killAsync,
  getServersOnThreads,
  getPlayerList,
  getModFilterStats,
  resetModFilterStats,
  getDownloadProgress,
  resetDownloadProgress,
  getPendingManualMods,
  resumeManualMods,
  releaseManualModsHold,
  isModpackDownloadSettled,
};
