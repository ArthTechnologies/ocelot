<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { AlertTriangle, ArrowDownCircle } from "lucide-svelte";
  import { apiurl } from "../../scripts/req";
  import { updateServer } from "../../scripts/req";
  import { t } from "$lib/scripts/i18n";

  let latestUpdate = "";
  let latestVariant = "release";
  let serverAddons: string[] = [];
  let addonReady: Record<string, boolean> = {};
  let areWorldgenMods = false;
  let updateReady = false;
  let serverVersion = "";
  let serverSoftware = "";
  let newerVersionAvailable = false;
  let jarsList: string[] = [];
  // The version we've just asked for, so the button stops offering an update
  // the server is already applying.
  let pendingVersion = "";
  let pendingServerId = "";

  // /info/jars normalises every filename to software-version-variant.ext
  const JAR_NAME = /^([a-zA-Z]+)-(\d+(?:\.\d+)*)-(\w+)\.(jar|zip)$/;

  // Changing the game version of a Forge/NeoForge server means reinstalling the
  // loader against a mod set built for the old one, so there's no one-click
  // update for them at all. server.software reaches localStorage with
  // inconsistent casing depending on which path wrote it, so match lowercased.
  const NO_UPDATE_SOFTWARE = ["forge", "neoforge"];
  $: unsupportedSoftware = NO_UPDATE_SOFTWARE.includes(
    (serverSoftware || "").toLowerCase()
  );

  // A stored server version can carry a variant suffix ("1.20.1*pre",
  // "1.20.1 Experimental") — compare on the numeric part only.
  function cleanVersion(v: string) {
    return (v || "").split("*")[0].split(" ")[0].trim();
  }

  // Compare dotted versions segment by segment, treating a missing segment as
  // 0. Subtracting the third segment of a two-part version like "1.21" gives
  // NaN, which silently made every x.y server ineligible for any update.
  // Returns NaN when either side isn't a numeric version (e.g. "latest").
  function compareVersions(a: string, b: string) {
    const pa = a.split(".").map((n: string) => parseInt(n, 10));
    const pb = b.split(".").map((n: string) => parseInt(n, 10));
    if (pa.some(isNaN) || pb.some(isNaN)) return NaN;
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] === undefined ? 0 : pa[i];
      const y = pb[i] === undefined ? 0 : pb[i];
      if (x !== y) return x - y;
    }
    return 0;
  }

  function variantLabel(variant: string) {
    if (!variant || variant == "release") return "";
    return " " + variant.charAt(0).toUpperCase() + variant.slice(1);
  }

  function evaluate() {
    newerVersionAvailable = false;
    updateReady = false;
    latestUpdate = "";
    latestVariant = "release";
    addonReady = {};

    if (!serverSoftware || !serverVersion || jarsList.length == 0) return;
    if (NO_UPDATE_SOFTWARE.includes(serverSoftware.toLowerCase())) return;

    const current = cleanVersion(serverVersion);
    if (pendingVersion) {
      if (current != pendingVersion) return;
      pendingVersion = "";
    }
    const software = serverSoftware.toLowerCase();

    // Track the newest release and the newest of any variant separately, so a
    // server is only pushed onto an experimental/snapshot build when there is
    // no newer release at all — and the variant is labelled when that happens.
    let bestRelease: { version: string; variant: string } | null = null;
    let bestAny: { version: string; variant: string } | null = null;

    for (const file of jarsList) {
      const match = file.match(JAR_NAME);
      if (!match) continue;
      const [, jarSoftware, version, variant, ext] = match;
      if (jarSoftware != software || ext != "jar") continue;

      // With an uncomparable current version ("latest") there's nothing to
      // measure against, so fall back to offering the newest jar we have.
      const diff = compareVersions(version, current);
      if (isNaN(diff) ? version == current : diff <= 0) continue;

      if (bestAny == null || compareVersions(version, bestAny.version) > 0) {
        bestAny = { version: version, variant: variant };
      }
      if (
        variant == "release" &&
        (bestRelease == null ||
          compareVersions(version, bestRelease.version) > 0)
      ) {
        bestRelease = { version: version, variant: variant };
      }
    }

    const target = bestRelease || bestAny;
    if (target == null) return;

    latestUpdate = target.version;
    latestVariant = target.variant;
    newerVersionAvailable = true;

    // Readiness is about the version we're moving *to*. This used to compare
    // against serverVersion, so it checked the version being left behind —
    // green-lighting updates to a version with no worldgen zip, and blocking
    // ones where the zip only exists for the target.
    areWorldgenMods = serverAddons.length > 0;
    const ready: Record<string, boolean> = {};
    serverAddons.forEach((addon: string) => {
      ready[addon] = jarsList.some((jar: string) =>
        jar.startsWith(addon.toLowerCase() + "-" + latestUpdate + "-")
      );
    });
    addonReady = ready;
    updateReady =
      !areWorldgenMods || serverAddons.every((addon: string) => ready[addon]);
  }

  let lastState = "";
  // Returns true when the server this button belongs to has changed under us.
  function readState() {
    if (!browser) return false;
    const serverId = localStorage.getItem("serverID") || "";
    const version = localStorage.getItem("serverVersion") || "";
    const software = localStorage.getItem("serverSoftware") || "";
    const addons = localStorage.getItem("serverAddons") || "";
    const state = serverId + "|" + software + "|" + version + "|" + addons;
    if (state == lastState) return false;
    lastState = state;

    // A pending update belongs to the server it was started on — carrying it
    // over would hide the button on whichever server is opened next.
    if (serverId != pendingServerId) pendingVersion = "";

    serverVersion = version;
    serverSoftware = software;
    // serverAddons is stored as `addons.toString()`, so a server with none is
    // saved as "" — and "".split(",") is [""], a length-1 array holding one
    // empty string, not []. Drop those blanks so "no addons" really is empty.
    serverAddons = addons.split(",").filter((addon) => addon !== "");
    areWorldgenMods = serverAddons.length > 0;
    return true;
  }

  function fetchJars() {
    return fetch(apiurl + "info/jars")
      .then((x) => x.json())
      .then((x) => {
        jarsList = x;
        evaluate();
      })
      .catch(() => {});
  }

  onMount(() => {
    readState();
    fetchJars();
    // /server/[slug] isn't keyed, so this component is reused when navigating
    // between servers — and localStorage only gets the current server's values
    // once getStatus() resolves, which is after this component is created.
    // Poll rather than trusting the snapshot taken at construction.
    const interval = setInterval(() => {
      if (readState()) evaluate();
    }, 500);
    return () => clearInterval(interval);
  });

  function update() {
    if (!updateReady || !browser || latestUpdate == "") return;
    const target = latestUpdate;
    const serverId = localStorage.getItem("serverID") || "";
    pendingVersion = target;
    pendingServerId = serverId;
    newerVersionAvailable = false;
    updateServer(Number(serverId), target)?.then((res) => {
      if (res == "error") {
        // Nothing was applied, so let the button come back.
        pendingVersion = "";
        evaluate();
      }
    });
  }

  function onclick() {
    readState();
    fetchJars();
  }
</script>

{#if newerVersionAvailable && !unsupportedSoftware}
  <label for="updates" class="btn btn-neutral btn-sm" on:click={onclick}
    ><ArrowDownCircle class="mr-1.5" size="18" />
    {$t("button.update")}</label
  >

  <!-- Put this part before </body> tag -->
  <input type="checkbox" id="updates" class="modal-toggle" />
  <div class="modal" style="margin:0rem;">
    <div class="modal-box bg-opacity-95 backdrop-blur relative">
      <label
        for="updates"
        class="btn btn-neutral btn-sm btn-circle absolute right-2 top-2">✕</label
      >
      <h3 class="text-xl font-bold mb-2">
        {latestUpdate}{variantLabel(latestVariant)}
        {$t("update")}
      </h3>
      {#if ["quilt", "fabric"].includes(serverSoftware.toLowerCase())}
        <div
          class="bg-warning w-86 rounded-lg text-black p-2 py-0.5 flex items-center space-x-2"
        >
          <AlertTriangle size="48" />
          <span class="text-sm">{$t("warning.updateModded")}</span>
        </div>
      {/if}
      <div class="flex justify-center">
        {#if areWorldgenMods}
          {#each serverAddons as addon}
            <img
              class="mask mask-hexagon {addonReady[addon] ? '' : 'grayscale'}"
              src="/images/{addon}.webp"
              width="80ch"
            />
          {/each}
        {/if}
      </div>

      {#if updateReady}
        <p class="text-center my-3">
          {#if areWorldgenMods}
            {$t("update.worldgenReady")} {latestUpdate}.
          {:else}
            {$t("changeVersion.readyToUpdate")} {latestUpdate}.
          {/if}
        </p>
      {:else}
        <p class="text-center">
          {#if areWorldgenMods}
            {$t("update.worldgenNotReady")}
            {latestUpdate}
            {$t("update.worldgenNotReady2")}
          {:else}
            {$t("update.cantUpdate")} {latestUpdate}.
          {/if}
        </p>
      {/if}
      {#if updateReady}
        <label on:click={update} for="updates" class="btn btn-neutral"
          >{$t("button.update")}</label
        >
      {:else}
        <label class="btn btn-disabled">{$t("button.update")}</label>
      {/if}
    </div>
  </div>
{/if}
