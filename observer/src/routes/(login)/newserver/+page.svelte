<script lang="ts">
  import { onMount } from "svelte";
  import { apiurl, createServer, getServers } from "$lib/scripts/req";
  import { t, locale, locales } from "$lib/scripts/i18n";
  import Helper from "$lib/components/ui/Helper.svelte";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import Modpacks from "$lib/components/ui/Modpacks.svelte";
  import UploadWorld from "$lib/components/ui/UploadWorld.svelte";
  import SourceModal from "$lib/components/ui/SourceModal.svelte";
  import { SITE_URL } from "$lib/config";
  import { Check, X, AlertCircle, AlertTriangle } from "lucide-svelte";

  import { alert } from "$lib/scripts/utils";

  let version = "1.19.4";
  export let software = $t("software.paper");
  let name = "";
  let visible = false;
  let gamemode: string;
  let admin = "";
  let modpacks = false;
  let modpackURL = "";
  let latestVersion = "1.20.1";
  let showSourceModal = false;
  let worldgenMods = [
    { name: "terralith", tooltip: "Terralith - Overworld Evolved" },
    { name: "incendium", tooltip: "Incendium - Nether Expansion" },
    { name: "nullscape", tooltip: "Nullscape - End Expansion" },
    { name: "structory", tooltip: "Structory - New Structures" },
  ];
  let jarsList = [];
  let jarsError = ""; // set when the /info/jars fetch itself fails
  let versionsError = ""; // set when the selected software has zero available versions
  let rawJarsResponse = ""; // exact body /info/jars last responded with, for the debug modal
  let jarsApiUrl = ""; // full URL that was actually requested, for the debug modal
  let id = -1;
  let showGeyserBar = false;
  const quickVersions = ["1.20.1", "1.18.2", "1.16.5", "1.12.2"];
  let quickVersion = quickVersions[0];
  const quickSoftwares = [
    { name: "Paper", desc: "Best for Normal Minecraft" },
    { name: "Forge", desc: "Most popular mod loader" },
    { name: "Fabric", desc: "Lightweight mod loader" },
  ];
  let quickSoftware = quickSoftwares[0].name;
  let showAllSoftware = false;

  function parseJarFileName(filename) {
    // Format: software-version-variant.jar
    const match = filename.match(/^([a-zA-Z]+)-(\d+(?:\.\d+)*)-(\w+)\.(jar|zip)$/);
    if (match) {
      return {
        software: match[1],
        version: match[2],
        variant: match[3],
      };
    }
    return null;
  }

  function formatVersionDisplay(version, variant) {
    // Don't show "release" variant in UI
    if (variant === "release") {
      return version;
    }
    return `${version} ${variant.charAt(0).toUpperCase() + variant.slice(1)}`;
  }

  function getLatestVersionForSoftware(softwareName, jars) {
    let CVS = softwareName.split(" - ")[0].toLowerCase();
    let versionOptions = [];

    for (let i in jars) {
      let parsed = parseJarFileName(jars[i]);
      if (parsed && parsed.software === CVS) {
        versionOptions.push({
          version: parsed.version,
          variant: parsed.variant,
          display: formatVersionDisplay(parsed.version, parsed.variant),
        });
      }
    }

    // Sort versions in descending order
    versionOptions.sort((a, b) => {
      const partsA = a.version.split(".").map(p => parseInt(p, 10));
      const partsB = b.version.split(".").map(p => parseInt(p, 10));

      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const partA = partsA[i] || 0;
        const partB = partsB[i] || 0;
        if (partA !== partB) {
          return partB - partA;
        }
      }
      return 0;
    });

    return versionOptions.length > 0 ? versionOptions[0].version : "1.20.1";
  }

  $: latestVersion = getLatestVersionForSoftware(software, jarsList);
  $: showGeyserBar = software.split(" - ")[0] === "Paper" && version.split(" ")[0] === latestVersion;
  $: isPaper = software.split(" - ")[0] === "Paper";
  $: isModded = ["Forge", "NeoForge", "Fabric", "Quilt"].includes(
    software.split(" - ")[0]
  );
  $: forgeLike = ["Forge", "NeoForge"].includes(software.split(" - ")[0]);
  $: availableQuick = forgeLike ? quickVersionsAvailable(software, jarsList) : [];
  // The 4 quick-pick buttons are a fixed, hardcoded list - none of them
  // being available doesn't mean the software has no versions at all (the
  // dropdown below may still have plenty), so this gets its own message
  // rather than reusing versionsError's "nothing available" wording.
  $: quickPickUnavailable =
    forgeLike && jarsList.length > 0 && availableQuick.length === 0 && !versionsError;
  // Pretty-print if the raw body happens to be valid JSON (the success case,
  // for versionsError/quickPickUnavailable), otherwise show it verbatim (a
  // non-JSON error page, for jarsError) - either way it's exactly what the
  // API sent, not a re-serialization of jarsList after-the-fact.
  $: formattedJarsResponse = (() => {
    try {
      return JSON.stringify(JSON.parse(rawJarsResponse), null, 2);
    } catch (e) {
      return rawJarsResponse;
    }
  })();

  function quickVersionsAvailable(softwareName, jars) {
    const CVS = softwareName.split(" - ")[0].toLowerCase();
    return quickVersions.filter((v) =>
      jars.some((jar) => {
        const parsed = parseJarFileName(jar);
        return parsed && parsed.software === CVS && parsed.version === v;
      })
    );
  }

  function syncDropdownTo(v) {
    const dropdown = document.getElementById("versionDropdown");
    if (dropdown == null) return;
    if (v != null) {
      // The select displays "Choose" while a quick-version button is active,
      // but its value must stay the real version — Modpacks.svelte reads the
      // search version straight off this element.
      let placeholder = document.getElementById("versionPlaceholder");
      if (placeholder == null) {
        placeholder = document.createElement("option");
        placeholder.id = "versionPlaceholder";
        placeholder.text = "Choose";
        placeholder.hidden = true;
        dropdown.insertBefore(placeholder, dropdown.firstChild);
      }
      placeholder.value = v;
      dropdown.value = v;
      version = v;
    } else {
      version = dropdown.value.trim().toLowerCase();
    }
  }

  function selectQuickVersion(v) {
    quickVersion = v;
    syncDropdownTo(v === "other" ? null : v);
    checkV();
  }

  function softwareStringFor(base) {
    const keys = {
      Paper: "software.paper",
      Forge: "software.forge",
      Fabric: "software.fabric",
      Vanilla: "software.vanilla",
    };
    return $t(keys[base]);
  }

  function syncSoftwareDropdownTo(base) {
    const dropdown = document.getElementById("softwareDropdown");
    if (dropdown == null) return;
    if (base != null) {
      // Same trick as the version select: display "Choose" while a quick
      // block is active, but keep the real software string as the value —
      // Modpacks.svelte reads it straight off this element.
      let placeholder = document.getElementById("softwarePlaceholder");
      if (placeholder == null) {
        placeholder = document.createElement("option");
        placeholder.id = "softwarePlaceholder";
        placeholder.text = "Choose";
        placeholder.hidden = true;
        dropdown.insertBefore(placeholder, dropdown.firstChild);
      }
      const full = softwareStringFor(base);
      placeholder.value = full;
      dropdown.value = full;
      software = full;
    } else {
      software = dropdown.value;
    }
  }

  function selectQuickSoftware(base) {
    quickSoftware = base;
    syncSoftwareDropdownTo(base);
    checkS();
  }

  function toggleShowAll() {
    if (showAllSoftware) {
      // Collapse back to the quick blocks and revert to the highlighted one.
      showAllSoftware = false;
      selectQuickSoftware(quickSoftware);
    } else {
      // The placeholder ("Choose") is already selected in the dropdown, and
      // `software` keeps its current value until the user actually picks.
      showAllSoftware = true;
    }
  }

  onMount(() => {
    syncSoftwareDropdownTo(quickSoftware);
  });

  if (browser) {
    let email = localStorage.getItem("accountEmail");

    // Check if coming from subscription-success page
    const params = new URLSearchParams(window.location.search);
    if (params.get("fromSubscription") === "true") {
      const referrer = localStorage.getItem("referrer") || "unknown";

      // If we already know the referrer, send analytics directly
      if (referrer && referrer !== "unknown") {
        const campaign = localStorage.getItem("campaign_name") || "unknown";
        fetch(`${SITE_URL}/api/analytics/payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ referrer, campaign }),
        }).catch((err) => console.error("Analytics error:", err));
      } else {
        // If no referrer known, ask the user
        showSourceModal = true;
      }
    }

    if (document.location.href.includes("?id=")) {
      id = parseInt(document.location.href.split("?id=")[1].split("&")[0]);
    } else {
      getServers(email).then((response) => {
        if (browser) {
          for (let i in response) {
            //if it is a string, that means it is not created yet
            if (typeof response[i] == "string") {
              id = i.id;

              break;
            }
          }

          if (id == -1) alert($t("alert.makeANewSubscription"));
        }
      });
    }
    jarsApiUrl = apiurl + "info/jars";
    fetch(jarsApiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        token: localStorage.getItem("token"),
        username: localStorage.getItem("accountEmail"),
      },
    })
      // Read the body as text first (a response can only be consumed once)
      // so the exact bytes the API sent are always available for the "view
      // raw response" modal, whether or not they turn out to be valid JSON.
      .then((res) =>
        res.text().then((text) => ({ ok: res.ok, status: res.status, statusText: res.statusText, text }))
      )
      .then(({ ok, status, statusText, text }) => {
        rawJarsResponse = text;
        if (!ok) {
          throw new Error(`Server responded with ${status} ${statusText}`);
        }
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          throw new Error("Response wasn't valid JSON.");
        }
        if (!Array.isArray(parsed)) {
          throw new Error("Server returned an unexpected response instead of a list of versions.");
        }
        console.log(parsed);
        jarsError = "";
        jarsList = parsed;

        // The fetch itself has already succeeded at this point - jarsList is
        // populated. An error in the UI refresh below is a separate bug, not
        // a fetch failure, so it's caught here rather than by the outer
        // catch - otherwise it gets mislabeled as "couldn't load available
        // versions" even though the versions loaded just fine.
        try {
          findVersions();
          version = getLatestVersionForSoftware(software, jarsList);
          checkV();
        } catch (err) {
          console.error("Failed to refresh the version picker after loading versions:", err);
        }
      })
      .catch((err) => {
        console.error("Failed to load available server versions:", err);
        jarsError = `Couldn't load available versions from ${jarsApiUrl}: ${err.message}`;
      });

    //this checks if the user has paid for a modded plan
    fetch(apiurl + "info/subscriptions", {
      method: "GET",
      headers: {
        username: localStorage.getItem("accountEmail"),
        token: localStorage.getItem("token"),
      },
    })
      .then((res) => res.json())
      .then((json) => {
        //this makes sure that the backend has multiple plans
        if (
          !(
            json.subscriptions > 0 &&
            json.moddedSubscriptions == 0 &&
            json.basicSubscriptions == 0
          )
        ) {
          let servers = JSON.parse(localStorage.getItem("servers"));
          let moddedServers = 0;
          for (let i in servers) {
            if (typeof servers[i] == "object") {
              switch (servers[i].software.toLowerCase) {
                case "forge":
                case "fabric":
                case "quilt":
                  moddedServers++;
                  break;
              }
            }
          }

        }
      });
  }

  function handleSourceModalSubmit(event: any) {
    const { source, youtuberName, other } = event.detail;

    // Store the source information for analytics if needed
    localStorage.setItem("userSource", source);
    if (youtuberName) {
      localStorage.setItem("youtuberName", youtuberName);
    }
    if (other) {
      localStorage.setItem("otherSource", other);
    }

    // Build the referrer string based on source
    let referrer = source;
    if (source === "youtube" && youtuberName) {
      referrer = `youtube:${youtuberName}`;
    } else if (source === "other" && other) {
      referrer = `other:${other}`;
    }

    // Send analytics to site
    const campaign = localStorage.getItem("campaign_name") || "unknown";
    fetch(`${SITE_URL}/api/analytics/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referrer, campaign }),
    }).catch((err) => console.error("Analytics error:", err));

    // Close the modal and allow normal flow
    showSourceModal = false;
  }

  function send() {
    let addons = [];
    let cmd = [];
    let sSoftware = software.toLowerCase().split(" - ")[0];
    let sVersion: string = version.toLowerCase();

    //for all 3 checkboxes, if checked, add their ids to the addons array
    if (document.getElementById("terralith").checked) {
      addons.push("terralith");
    }
    if (document.getElementById("incendium").checked) {
      addons.push("incendium");
    }
    if (document.getElementById("nullscape").checked) {
      addons.push("nullscape");
    }
    if (document.getElementById("structory").checked) {
      addons.push("structory");
    }

    cmd.push("op " + admin);
    cmd.push("defaultgamemode " + gamemode);

    console.log("cmd = " + cmd);

    console.log(browser && name != "");
    if (browser && name != "") {
      let modpackURL = localStorage.getItem("modpackURL");
      let modpackID = localStorage.getItem("modpackID");
      let versionID = localStorage.getItem("modpackVersionID");
      createServer(
        id,
        name,
        sSoftware,
        sVersion,
        addons,
        cmd,
        modpackURL,
        modpackID,
        versionID
      ).then((res) => {
        localStorage.setItem("modpackURL", "");
        localStorage.setItem("modpackID", "");
        localStorage.setItem("modpackVersionID", "");
        localStorage.setItem("serverSoftware", sSoftware);
        if (res == true) {
          console.log("redricting to homepage...");
          // dispatch "redrict" (tells the navbar to refresh its server list
          // and update the highlighted icon) only after the navigation has
          // actually landed - Nav.svelte's isViewingExistingServer() guard
          // reads window.location.pathname synchronously, and firing this
          // event before goto() resolves let it see the old (pre-navigation)
          // path. That made Nav think the user wasn't viewing the server
          // they just created, so it force-navigated back to /newserver -
          // and the location.reload() below then reloaded THAT wrong page.
          goto("/server/"+(10000 + id)).then(() => {
            window.dispatchEvent(new Event("redrict"));
          });
          setTimeout(() => {
      location.reload();
    }, 300);
        } else {
          if (res.includes("Maximum servers"))
            alert($t("alert.maximumServersReached"));
          else if (res.includes("If you want another"))
            alert($t("alert.makeANewSubscription"));
          else if (res.includes("You are not subscribed"))
            alert($t("alert.subscribe"));
          else alert(res);
        }
      });
    } else if (browser) {
      alert($t("alert.enterName"));
    }
  }
  // #worldgen is always in the template (never behind an {#if}), but the
  // /info/jars fetch can resolve and call checkV() before Svelte's initial
  // mount has actually inserted it into the DOM - a stale-cached lookup here
  // used to throw ("worldgen is null") in that window even though the fetch
  // itself succeeded. A fresh lookup each time sidesteps that race entirely.
  function getWorldgenEl() {
    return document.getElementById("worldgen");
  }

  function checkV() {
    if (browser) {
      version = document.getElementById("versionDropdown").value.trim().toLowerCase();
      console.log("version selected: " + version);
    }

    let worldgenModsAvailable = false;

    if (!modpacks) {
      let worldgenMods = ["terralith", "incendium", "nullscape", "structory"];
      worldgenMods.forEach((item) => {
        let checkbox = document.getElementById(item);
        if (checkbox != null) {
          // Check if any variant of this mod exists for the selected version
          const modExists = jarsList.some(jar =>
            jar.startsWith(item + "-" + version + "-")
          );

          if (modExists) {
            worldgenModsAvailable = true;
            checkbox.disabled = false;
          } else {
            checkbox.disabled = true;
          }
        }
      });
      if (worldgenModsAvailable) {
        getWorldgenEl()?.classList.remove("hidden");
      } else {
        getWorldgenEl()?.classList.add("hidden");
        document.getElementById("terralith").checked = false;
        document.getElementById("incendium").checked = false;
        document.getElementById("nullscape").checked = false;
        document.getElementById("structory").checked = false;
      }
    } else {
      getWorldgenEl()?.classList.add("hidden");
      //modpacks search as soon as the button is loaded, so this search needs to
      //be re-done for the new version.
      const modpacks = document.getElementById("modpacks");
      modpacks.innerHTML = "";
      new Modpacks({
        target: modpacks,
      });
    }
  }

  function findVersions() {
    let CVS = software.split(" - ")[0].toLowerCase();
    let versionOptions = [];

    for (let i in jarsList) {
      let parsed = parseJarFileName(jarsList[i]);
      if (parsed && parsed.software === CVS) {
        versionOptions.push({
          version: parsed.version,
          variant: parsed.variant,
          display: formatVersionDisplay(parsed.version, parsed.variant),
        });
      }
    }

    // Sort versions in descending order
    versionOptions.sort((a, b) => {
      const partsA = a.version.split(".").map(p => parseInt(p, 10));
      const partsB = b.version.split(".").map(p => parseInt(p, 10));

      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const partA = partsA[i] || 0;
        const partB = partsB[i] || 0;
        if (partA !== partB) {
          return partB - partA;
        }
      }
      return 0;
    });

    // jarsList having entries but none matching this software's own jar
    // naming (software-version-variant.ext) means there's genuinely nothing
    // to put in the dropdown - surface that instead of leaving it empty with
    // no explanation. Only fires once jarsList has actually loaded, so it
    // doesn't flash on every software switch before the fetch resolves.
    versionsError =
      jarsList.length > 0 && versionOptions.length === 0
        ? `No ${software.split(" - ")[0]} versions are available on this node.`
        : "";

    // Append versions to dropdown
    let versionDropdown = document.getElementById("versionDropdown");
    versionDropdown.innerHTML = "";
    let i = 0;

    versionOptions.forEach((item) => {
      let option = document.createElement("option");
      option.value = item.version;
      option.text = item.display;
      if (i === 0 && CVS === "paper") {
        option.text += " - Latest Version";
      }
      versionDropdown.add(option);

      if (i === 0) {
        version = item.display;
      }
      i++;
    });
  }
  function checkS() {
    software = document.getElementById("softwareDropdown").value;
    const modpackElement = document.getElementById("modpacks");
    findVersions();

    if (software.split(" - ")[0] == "Forge" || software.split(" - ")[0] == "NeoForge") {
      const available = quickVersionsAvailable(software, jarsList);
      quickVersion = available.includes(quickVersion)
        ? quickVersion
        : available[0] || "other";
      syncDropdownTo(quickVersion === "other" ? null : quickVersion);
    }

    if (software.split(" - ")[0] == "Paper") {
      getWorldgenEl()?.classList.remove("hidden");
      modpackElement.classList.add("hidden");
      modpacks = false;
    } else if (
      software.split(" - ")[0] == "Quilt" ||
      software.split(" - ")[0] == "Fabric" ||
      software.split(" - ")[0] == "Forge" ||
      software.split(" - ")[0] == "NeoForge"
    ) {
      getWorldgenEl()?.classList.add("hidden");
      modpackElement.classList.remove("hidden");
      modpacks = true;
    } else {
      getWorldgenEl()?.classList.add("hidden");
      modpackElement.classList.add("hidden");
      modpacks = false;
    }
  }
</script>

<div class="flex place-content-center">
  <div class="flex-col mb-10">
    <div class="divider px-10 text-3xl font-poppins-bold">
      {$t("newserver.title")}
    </div>

    <div id="serverForm">
      <form>
        <div class="flex flex-col w-[22rem] xl:w-[30rem]">
          <label class="label" for="1">{$t("newserver.l.name")}</label>
          <input
            bind:value={name}
            id="nameInput"
            class="input-bordered input "
            type="text"
            placeholder="{$t('general.ex')} My Minecraft Server"
          />

          <!-- svelte-ignore a11y-label-has-associated-control -->
          <label class="label" for="softwareDropdown"
            >{$t("newserver.l.software")}</label
          >
          <div class="flex gap-2">
            <div
              class="flex min-w-0 gap-2 overflow-hidden transition-all duration-300 {showAllSoftware
                ? 'flex-[0] basis-0 opacity-0 -mr-2 pointer-events-none'
                : 'flex-[3] basis-0 opacity-100'}"
            >
              {#each quickSoftwares as s}
                <button
                  type="button"
                  class="flex-1 basis-0 min-w-0 h-16 rounded-btn border px-1 flex flex-col items-center justify-center gap-0.5 transition-colors
                    {quickSoftware === s.name
                    ? 'border-base-content/60 bg-base-200'
                    : 'border-base-content/20 bg-base-100 hover:border-base-content/40'}"
                  on:click={() => selectQuickSoftware(s.name)}
                >
                  <span class="text-sm xl:text-base leading-none">{s.name}</span>
                  <span
                    class="text-[9px] xl:text-[11px] leading-tight opacity-60"
                    >{s.desc}</span
                  >
                </button>
              {/each}
            </div>
            <button
              type="button"
              class="flex-1 basis-0 min-w-0 h-16 rounded-btn border px-1 flex flex-col items-center justify-center gap-0.5 transition-all duration-300
                {showAllSoftware
                ? 'border-base-content/60 bg-base-200'
                : 'border-base-content/20 bg-base-100 hover:border-base-content/40'}"
              on:click={toggleShowAll}
            >
              <span class="text-sm xl:text-base leading-none"
                >{showAllSoftware ? "Back" : "Show All"}</span
              >
              <span class="text-[9px] xl:text-[11px] leading-tight opacity-60"
                >{showAllSoftware
                  ? "Popular software"
                  : "More software options"}</span
              >
            </button>
            <select
              on:change={checkS}
              id="softwareDropdown"
              name="softwareDropdown"
              tabindex="0"
              disabled={!showAllSoftware}
              class="select select-bordered bg-base-100 h-16 min-w-0 transition-all duration-300 {showAllSoftware
                ? 'flex-[3] basis-0 p-2 opacity-100'
                : 'w-0 grow-0 basis-0 p-0 border-0 opacity-0 -ml-2 pointer-events-none'}"
            >
              <option>{$t("software.paper")}</option>
              <option>{$t("software.forge")} </option>
              <option>{$t("software.neoForge")}</option>
              <option>{$t("software.fabric")}</option>
              <option>{$t("software.quilt")}</option>
              <option>{$t("software.velocity")}</option>
              <option>{$t("software.vanilla")}</option>
              <option>{$t("software.snapshot")}</option>
            </select>
          </div>

          <label class="label" for="versionDropdown"
            >{$t("newserver.l.version")}</label
          >
          <div class="flex gap-2">
            <div
              class="flex-1 gap-2 {forgeLike ? 'grid grid-cols-5' : 'hidden'}"
            >
              {#each quickVersions as v}
                <button
                  type="button"
                  class="h-12 rounded-btn border px-0 text-xs xl:text-sm transition-colors
                    {quickVersion === v
                    ? 'border-base-content/60 bg-base-200'
                    : 'border-base-content/20 bg-base-100 hover:border-base-content/40'}"
                  class:opacity-40={!availableQuick.includes(v)}
                  disabled={!availableQuick.includes(v)}
                  on:click={() => selectQuickVersion(v)}>{v}</button
                >
              {/each}
              <button
                type="button"
                class="h-12 rounded-btn border px-0 text-xs xl:text-sm transition-colors
                  {quickVersion === 'other'
                  ? 'border-base-content/60 bg-base-200'
                  : 'border-base-content/20 bg-base-100 hover:border-base-content/40'}"
                on:click={() => selectQuickVersion("other")}>Other</button
              >
            </div>
            <select
              on:change={checkV}
              id="versionDropdown"
              name="versionDropdown"
              tabindex="0"
              disabled={forgeLike && quickVersion !== "other"}
              class="select select-bordered p-2 bg-base-100 disabled:opacity-50 {forgeLike
                ? 'w-24 shrink-0'
                : 'w-full'}"
            >
              {#if JSON.stringify(jarsList).includes(software + "-" + latestVersion)}<option
                  value={latestVersion}
                  >{latestVersion}{isPaper ? " - Latest Version" : ""}</option
                >
              {/if}
              <option>1.19.4</option>
              <option>1.18.2</option>
              <option>1.17.1</option>
              <option>1.16.5</option>
              <option>1.12.2</option>
            </select>
          </div>

          {#if jarsError}
            <div class="bg-error w-full rounded-lg text-white p-2 py-2 flex items-start mt-2 space-x-2 text-sm">
              <AlertCircle size="20" class="flex-shrink-0 mt-0.5" />
              <span class="flex-1">{jarsError}</span>
              <label for="jarsApiResponseModal" class="btn btn-xs btn-neutral shrink-0"
                >View response</label
              >
            </div>
          {:else if versionsError}
            <div class="bg-error w-full rounded-lg text-white p-2 py-2 flex items-start mt-2 space-x-2 text-sm">
              <AlertCircle size="20" class="flex-shrink-0 mt-0.5" />
              <span class="flex-1">{versionsError}</span>
              <label for="jarsApiResponseModal" class="btn btn-xs btn-neutral shrink-0"
                >View response</label
              >
            </div>
          {:else if quickPickUnavailable}
            <div class="bg-warning w-full rounded-lg text-black p-2 py-2 flex items-start mt-2 space-x-2 text-sm">
              <AlertTriangle size="20" class="flex-shrink-0 mt-0.5" />
              <span class="flex-1"
                >None of the quick-pick versions ({quickVersions.join(", ")}) are available for {software.split(
                  " - "
                )[0]} on this node — choose a version from the dropdown instead.</span
              >
              <label for="jarsApiResponseModal" class="btn btn-xs btn-neutral shrink-0"
                >View response</label
              >
            </div>
          {/if}

          <input type="checkbox" id="jarsApiResponseModal" class="modal-toggle" />
          <div class="modal">
            <div class="modal-box bg-opacity-95 backdrop-blur relative max-w-2xl">
              <label
                for="jarsApiResponseModal"
                class="btn btn-neutral btn-sm btn-circle absolute right-2 top-2">✕</label
              >
              <h3 class="text-xl font-bold mb-1">API response</h3>
              <p class="text-xs text-base-content/60 mb-3 break-all">GET {jarsApiUrl}</p>
              <pre
                class="bg-base-300 rounded-lg p-3 text-xs overflow-auto max-h-[60vh] whitespace-pre-wrap break-all">{formattedJarsResponse ||
                  "(empty response)"}</pre>
            </div>
          </div>

          <div class="flex gap-2 mt-5">
            <div class="flex-[2] flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-base-200 border border-base-content/20 text-base-content/60 text-sm">
              {#if showGeyserBar}
                <Check size="15" class="shrink-0" />
              {:else}
                <X size="15" class="shrink-0" />
              {/if}
              <span>Geyser crossplay</span>
            </div>
            <div class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-base-200 border border-base-content/20 text-base-content/60 text-sm">
              {#if isPaper}
                <Check size="15" class="shrink-0" />
              {:else}
                <X size="15" class="shrink-0" />
              {/if}
              <span>Plugins</span>
            </div>
            <div class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-base-200 border border-base-content/20 text-base-content/60 text-sm">
              {#if isModded}
                <Check size="15" class="shrink-0" />
              {:else}
                <X size="15" class="shrink-0" />
              {/if}
              <span>Mods</span>
            </div>
          </div>

          <div id="worldgen">
            <div class="justify-center flex mt-2 mb-1">
              <p class="label">Worldgen Mods</p>

              <Helper tooltipText={$t("newserver.t.worldgen")} />
            </div>

            <div class="flex justify-center">
              {#each worldgenMods as item, i}
                <div
                  class="flex flex-col items-center md:tooltip md:tooltip-right"
                  data-tip={item.tooltip}
                >
                  <img
                    class="mask mask-hexagon w-[5rem] h-[5rem] md:w-[5.15rem] md:h-[5.15rem] hover:scale-[1.2] transition-all duration-100 ease-in-out"
                    src={"/images/" + item.name + ".webp"}
                    alt={item.name}
                  />
                </div>
              {/each}
            </div>
            <div class="p-2" />
            <div
              class="flex justify-center space-x-[3.475rem] md:space-x-[3.575rem]"
            >
              {#each worldgenMods as item}
                <input
                  id={item.name}
                  type="checkbox"
                  class="checkbox checkbox-secondary"
                />
              {/each}
            </div>
          </div>
          <div
            id="modpacks"
            class=" justify-evenly mt-4 space-y-5 rounded-xl items-center"
          >
            {#if modpacks}
              <Modpacks />{/if}
          </div>

          <a on:click={send} class="btn btn-neutral mt-4"
            >{$t("button.createServer")}</a
          >
        </div>
      </form>
    </div>
  </div>
</div>

{#if showSourceModal}
  <SourceModal on:submit={handleSourceModalSubmit} />
{/if}
