<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import { getModpackChecks, runModpackCheck, runOneModpackCheck } from "$lib/scripts/req";
  import ModpackCheckStream from "$lib/components/ui/ModpackCheckStream.svelte";
  import {
    X,
    RefreshCw,
    ShieldCheck,
    ShieldClose,
    MinusCircle,
    ChevronDown,
    ChevronRight,
    Loader,
    Play,
    RotateCw,
    TerminalSquare,
  } from "lucide-svelte";

  const dispatch = createEventDispatcher();

  let data: any = null;
  let loading = true;
  let error = "";
  let filter = "all";
  let expanded: string | null = null;
  let pollTimer: any = null;
  let starting = false; // "Run Check" clicked, waiting on the start response
  let recheckingKey: string | null = null; // rowKey mid single-pack recheck
  let actionError = "";
  let showLiveView = false;

  // While a run is in flight the endpoint is the only window into it, so poll.
  // A run takes hours, so 5s is plenty.
  const POLL_MS = 5000;

  async function load() {
    const res = await getModpackChecks();
    if (res) {
      data = res;
      error = "";
    } else if (!data) {
      error = "Couldn't load check results. This endpoint requires admin access.";
    }
    loading = false;

    // Both a full run and a single-pack recheck share the backend's `running`
    // flag, so once it drops there's nothing left in flight to track locally.
    if (!data?.running) {
      recheckingKey = null;
      starting = false;
    }

    clearTimeout(pollTimer);
    if (data?.running) pollTimer = setTimeout(load, POLL_MS);
  }

  async function startFullCheck() {
    if (starting || data?.running) return;
    starting = true;
    actionError = "";
    const res = await runModpackCheck();
    if (!res || res.ok === false) {
      actionError = res?.error || "Couldn't start the check.";
      starting = false;
      return;
    }
    showLiveView = true;
    load();
  }

  async function recheckPack(row: any) {
    if (data?.running || recheckingKey) return;
    recheckingKey = rowKey(row);
    actionError = "";
    const res = await runOneModpackCheck({
      platform: row.platform,
      projectId: row.projectId,
      gameVersion: row.gameVersion,
      loader: row.loader,
      name: row.name,
      slug: row.slug,
    });
    if (!res || res.ok === false) {
      actionError = res?.error || "Couldn't start the recheck.";
      recheckingKey = null;
      return;
    }
    showLiveView = true;
    load();
  }

  // Fired by the live view once its stream reports the check has finished -
  // the row it was watching just changed, so refresh the table underneath it.
  function onLiveFinished() {
    load();
  }

  onMount(() => {
    document.body.style.overflow = "hidden";
    load();
  });

  onDestroy(() => {
    document.body.style.overflow = "";
    clearTimeout(pollTimer);
  });

  const rowKey = (r: any) => r.platform + ":" + r.projectId + ":" + r.gameVersion;

  function when(ts: number | null | undefined) {
    return ts ? new Date(ts).toLocaleString() : "never";
  }

  function duration(ms: number | null | undefined) {
    if (!ms || ms < 1000) return "—";
    const total = Math.round(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  }

  // `results` must stay a reactive declaration, not a plain function: Svelte's
  // `$:` dependency tracking only sees identifiers literally referenced in a
  // statement, so a `$: counts = { ... results() ... }` block calling a
  // separately-defined `const results = () => data?.results` never reruns
  // when `data` changes — it only "depends on" `results`, which is never
  // reassigned. Declaring `results` itself with `$:` makes it a real
  // dependency that downstream reactive statements correctly pick up.
  $: results = (data?.results || []) as any[];

  $: counts = {
    all: results.length,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
  };

  $: filters = [
    { value: "all", label: "All", count: counts.all },
    { value: "passed", label: "Passed", count: counts.passed },
    { value: "failed", label: "Failed", count: counts.failed },
    { value: "skipped", label: "Skipped", count: counts.skipped },
  ];

  // Flat list, sorted by loader + game version so similar packs still land
  // near each other without needing a dedicated group section per version.
  $: rows = results
    .filter((r) => filter === "all" || r.status === filter)
    .slice()
    .sort((a, b) => {
      const av = `${a.loader || ""} ${a.gameVersion || ""}`;
      const bv = `${b.loader || ""} ${b.gameVersion || ""}`;
      return av.localeCompare(bv) || (a.name || "").localeCompare(b.name || "");
    });

  $: progress = data?.progress || null;
  // currentPacks is slot-indexed and holds null for a slot the work queue has
  // drained past, so the actually-active packs are the non-null entries.
  $: activePacks = (progress?.currentPacks || []).filter(Boolean);
  $: percent =
    progress && progress.total ? Math.round((progress.index / progress.total) * 100) : 0;
</script>

<svelte:window on:keydown={(e) => e.key === "Escape" && dispatch("close")} />

<div
  class="fixed inset-0 z-50 overflow-y-auto p-4"
  style="background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);"
  role="presentation"
  on:click|self={() => dispatch("close")}
  on:keydown={(e) => e.key === "Escape" && dispatch("close")}
>
  <div class="mx-auto max-w-6xl">
    <div
      class="bg-base-100 border border-base-300/40 rounded-2xl shadow-2xl w-full"
    >
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-base-100 rounded-t-2xl flex items-center justify-between px-6 py-4 border-b border-base-300/50">
      <div>
        <h2 class="text-xl font-bold flex items-center gap-2">
          Modpack Checker
          {#if data?.running}
            <span class="badge badge-warning gap-1 text-xs">
              <Loader size={12} class="animate-spin" /> running
            </span>
          {/if}
        </h2>
        <p class="text-base-content/50 text-xs mt-0.5">
          Last run {when(data?.lastRun)}
          {#if data?.durationMs}· took {duration(data.durationMs)}{/if}
          {#if data?.forgeGameVersions?.length}
            · Forge on {data.forgeGameVersions.join(", ")}
          {/if}
        </p>
      </div>
      <div class="flex items-center gap-1">
        {#if data?.running}
          <button
            class="btn btn-warning btn-sm gap-1.5"
            on:click={() => (showLiveView = true)}
            title="Watch the live console + download progress"
          >
            <TerminalSquare size={14} />
            Watch Live
          </button>
        {/if}
        <button
          class="btn btn-primary btn-sm gap-1.5"
          disabled={starting || data?.running}
          on:click={startFullCheck}
          title="Run a full modpack check now"
        >
          {#if starting || data?.running}
            <Loader size={14} class="animate-spin" />
          {:else}
            <Play size={14} />
          {/if}
          Run Check
        </button>
        <button class="btn btn-ghost btn-sm btn-circle" on:click={load} title="Refresh">
          <RefreshCw size={16} />
        </button>
        <button
          class="btn btn-ghost btn-sm btn-circle"
          on:click={() => dispatch("close")}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>
    </div>

    <!-- Body -->
    <div class="px-6 py-5 flex flex-col gap-5">
      {#if actionError}
        <div class="alert alert-error bg-error/10 border border-error/30 text-sm">{actionError}</div>
      {/if}
      {#if loading}
        <div class="flex items-center gap-3 text-base-content/60">
          <span class="loading loading-spinner loading-md text-primary"></span>
          Loading check results…
        </div>
      {:else if error}
        <div class="alert alert-error bg-error/10 border border-error/30 text-sm">{error}</div>
      {:else}
        <!-- Live progress -->
        {#if data?.running && progress}
          <div class="rounded-xl border border-warning/30 bg-warning/5 p-4">
            <div class="flex items-start justify-between gap-3 mb-2">
              <!-- One line per slot. Joining the names and listing the badges
                   separately stopped working once more than a couple of packs
                   ran at once — there was no telling which phase belonged to
                   which pack. -->
              <div class="font-semibold text-sm min-w-0">
                {#if activePacks.length > 0}
                  {#each activePacks as pack}
                    <p class="flex items-center gap-2 flex-wrap py-0.5">
                      <Loader size={14} class="animate-spin text-warning shrink-0" />
                      <span class="truncate">{pack.name}</span>
                      <span class="badge badge-ghost badge-sm">
                        {pack.loader} {pack.gameVersion}{#if pack.phase} · {pack.phase}{/if}
                      </span>
                    </p>
                  {/each}
                {:else}
                  <p class="flex items-center gap-2">
                    <Loader size={14} class="animate-spin text-warning shrink-0" />
                    <span>Discovering packs…</span>
                  </p>
                {/if}
              </div>
              <p class="text-xs text-base-content/60 whitespace-nowrap">
                {progress.index}/{progress.total || "?"}
                <!-- The global phase is whichever slot wrote last; the per-pack
                     badges carry the real phases, so it only shows when nothing
                     is active yet (discovering). -->
                {#if progress.phase && activePacks.length === 0}· {progress.phase}{/if}
              </p>
            </div>
            <progress class="progress progress-warning w-full" value={percent} max="100"></progress>
            <div class="flex gap-4 mt-2 text-xs text-base-content/60">
              <span>Started {when(progress.startedAt)}</span>
              <span class="text-success">{progress.passed} passed</span>
              <span class="text-error">{progress.failed} failed</span>
              <span>{progress.skipped} skipped</span>
            </div>
          </div>
        {/if}

        {#if counts.all === 0}
          <div class="text-base-content/60 text-sm py-8 text-center">
            No checks have completed yet.
            {#if !data?.running}
              Click <span class="font-medium">Run Check</span> above, or wait for the weekly run.
            {/if}
          </div>
        {:else}
          <!-- Summary / filters -->
          <div class="flex flex-wrap gap-2">
            {#each filters as option}
              <button
                class="btn btn-sm {filter === option.value ? 'btn-primary' : 'btn-ghost bg-base-200'}"
                on:click={() => (filter = option.value)}
              >
                {option.label}
                <span class="badge badge-sm ml-1.5">{option.count}</span>
              </button>
            {/each}
          </div>

          <!-- Results, flat list with a version badge per row -->
          <div class="rounded-xl border border-base-300/40 overflow-hidden">
              <table class="table table-sm">
                <thead>
                  <tr class="text-xs">
                    <th class="w-8"></th>
                    <th>Pack</th>
                    <th class="w-32">Version</th>
                    <th class="w-24">Status</th>
                    <th class="w-24">Mods</th>
                    <th class="w-20">Time</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {#each rows as row}
                    <tr
                      class="hover cursor-pointer align-top"
                      on:click={() =>
                        (expanded = expanded === rowKey(row) ? null : rowKey(row))}
                    >
                      <td class="text-base-content/40">
                        {#if expanded === rowKey(row)}
                          <ChevronDown size={14} />
                        {:else}
                          <ChevronRight size={14} />
                        {/if}
                      </td>
                      <td>
                        <div class="font-medium">{row.name}</div>
                        <div class="text-xs text-base-content/50">
                          {row.versionName || "—"}
                          {#if row.attempts > 1}· {row.attempts} attempts{/if}
                        </div>
                      </td>
                      <td class="text-xs">
                        <span class="badge badge-ghost badge-sm capitalize">
                          {row.loader || "?"} {row.gameVersion || data?.gameVersion || "?"}
                        </span>
                      </td>
                      <td>
                        {#if row.status === "passed"}
                          <span class="badge badge-success badge-sm gap-1">
                            <ShieldCheck size={11} /> passed
                          </span>
                        {:else if row.status === "failed"}
                          <span class="badge badge-error badge-sm gap-1">
                            <ShieldClose size={11} /> failed
                          </span>
                        {:else}
                          <span class="badge badge-ghost badge-sm gap-1">
                            <MinusCircle size={11} /> skipped
                          </span>
                        {/if}
                      </td>
                      <td class="text-xs">
                        {#if row.mods?.serverPack}
                          <span title="Installed from the server pack — mods come pre-bundled, so there is no manifest count to compare against">
                            {row.mods.installed}
                          </span>
                        {:else if row.mods?.expected}
                          <span
                            class={row.mods.installed < row.mods.expected ? "text-warning" : ""}
                          >
                            {row.mods.installed}/{row.mods.expected}
                          </span>
                        {:else}
                          <span class="text-base-content/40">—</span>
                        {/if}
                      </td>
                      <td class="text-xs text-base-content/60">{duration(row.durationMs)}</td>
                      <td class="text-xs text-base-content/70">{row.reason || ""}</td>
                    </tr>
                    {#if expanded === rowKey(row)}
                      <tr>
                        <td colspan="7" class="bg-base-200/40">
                          <div class="text-xs space-y-2 py-1">
                            <div class="flex items-center justify-between gap-3 flex-wrap">
                              <div class="flex flex-wrap gap-x-6 gap-y-1 text-base-content/60">
                                <span>Checked {when(row.checkedAt)}</span>
                                <span>{row.platform === "cf" ? "CurseForge" : "Modrinth"} · {row.projectId}</span>
                                {#if row.slug}<span>{row.slug}</span>{/if}
                              </div>
                              <button
                                class="btn btn-xs btn-ghost bg-base-200 gap-1.5"
                                disabled={data?.running || !!recheckingKey}
                                on:click|stopPropagation={() => recheckPack(row)}
                                title="Re-check just this pack"
                              >
                                {#if recheckingKey === rowKey(row)}
                                  <Loader size={12} class="animate-spin" /> Rechecking…
                                {:else}
                                  <RotateCw size={12} /> Recheck
                                {/if}
                              </button>
                            </div>
                            {#if row.mods?.serverPack}
                              <div class="text-base-content/60">
                                Installed from the pack's server pack — same file customers get.
                                {row.mods.installed} mods live on the server; nothing was
                                downloaded per-mod, so there is no manifest count to compare against.
                                {#if row.mods.removedClientSide || row.mods.disabledByConflict}
                                  · panel removed {row.mods.removedClientSide || 0} client-side
                                  {#if row.mods.disabledByConflict}
                                    and disabled {row.mods.disabledByConflict} conflicting
                                  {/if}
                                  from the bundle
                                {/if}
                              </div>
                            {:else if row.mods?.manifest}
                              <div class="text-base-content/60">
                                Manifest lists {row.mods.manifest} mods · panel removed
                                {row.mods.removedClientSide || 0} client-side
                                {#if row.mods.disabledByConflict}
                                  and disabled {row.mods.disabledByConflict} conflicting
                                {/if}
                                · {row.mods.installed}/{row.mods.expected} expected on the server
                              </div>
                            {/if}
                            {#if row.firstFailure}
                              <div>
                                <span class="font-semibold">First attempt:</span>
                                {row.firstFailure}
                              </div>
                            {/if}
                            {#if row.mods?.failedMods?.length}
                              <div>
                                <p class="font-semibold mb-1">
                                  {row.mods.failedMods.length} mod{row.mods.failedMods.length === 1 ? "" : "s"} failed to download
                                </p>
                                <div class="bg-base-300/50 rounded-lg p-3 max-h-48 overflow-y-auto flex flex-col gap-1.5">
                                  {#each row.mods.failedMods as mod (mod.name)}
                                    <div>
                                      <span class="font-medium">{mod.name}</span>
                                      <span class="text-base-content/50"> — {mod.reason}</span>
                                    </div>
                                  {/each}
                                </div>
                              </div>
                            {/if}
                            {#if row.consoleTail}
                              <div>
                                <p class="font-semibold mb-1">Console tail</p>
                                <pre
                                  class="bg-base-300/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">{row.consoleTail}</pre>
                              </div>
                            {:else}
                              <p class="text-base-content/40">No console output recorded.</p>
                            {/if}
                          </div>
                        </td>
                      </tr>
                    {/if}
                  {/each}
                </tbody>
              </table>
          </div>
        {/if}
      {/if}
    </div>
    </div>
  </div>
</div>

{#if showLiveView}
  <ModpackCheckStream
    on:close={() => (showLiveView = false)}
    on:finished={onLiveFinished}
  />
{/if}
