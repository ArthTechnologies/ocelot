<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import { getModpackChecks } from "$lib/scripts/req";
  import {
    X,
    RefreshCw,
    ShieldCheck,
    ShieldClose,
    MinusCircle,
    ChevronDown,
    ChevronRight,
    Loader,
  } from "lucide-svelte";

  const dispatch = createEventDispatcher();

  let data: any = null;
  let loading = true;
  let error = "";
  let filter = "all";
  let expanded: string | null = null;
  let pollTimer: any = null;

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

    clearTimeout(pollTimer);
    if (data?.running) pollTimer = setTimeout(load, POLL_MS);
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

  const results = () => (data?.results || []) as any[];

  $: counts = {
    all: results().length,
    passed: results().filter((r) => r.status === "passed").length,
    failed: results().filter((r) => r.status === "failed").length,
    skipped: results().filter((r) => r.status === "skipped").length,
  };

  $: filters = [
    { value: "all", label: "All", count: counts.all },
    { value: "passed", label: "Passed", count: counts.passed },
    { value: "failed", label: "Failed", count: counts.failed },
    { value: "skipped", label: "Skipped", count: counts.skipped },
  ];

  // One section per loader + game version, in the order the checker ran them.
  $: groups = (() => {
    const shown = results().filter((r) => filter === "all" || r.status === filter);
    const map = new Map<string, any[]>();
    for (const r of shown) {
      const key = `${r.loader || "?"} ${r.gameVersion || data?.gameVersion || "?"}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].map(([key, rows]) => ({
      key,
      rows,
      passed: rows.filter((r) => r.status === "passed").length,
    }));
  })();

  $: progress = data?.progress || null;
  $: percent =
    progress && progress.total ? Math.round((progress.index / progress.total) * 100) : 0;
</script>

<svelte:window on:keydown={(e) => e.key === "Escape" && dispatch("close")} />

<div
  class="fixed inset-0 z-50 flex items-center justify-center p-4"
  style="background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);"
  role="presentation"
  on:click|self={() => dispatch("close")}
  on:keydown={(e) => e.key === "Escape" && dispatch("close")}
>
  <div
    class="bg-base-100 border border-base-300/40 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[88vh] flex flex-col overflow-hidden"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-base-300/50">
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
    <div class="overflow-y-auto px-6 py-5 flex flex-col gap-5">
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
            <div class="flex items-center justify-between mb-2">
              <p class="font-semibold text-sm flex items-center gap-2">
                <Loader size={14} class="animate-spin text-warning" />
                {progress.current || "Discovering packs…"}
                {#if progress.currentGameVersion}
                  <span class="badge badge-ghost badge-sm">
                    {progress.currentLoader} {progress.currentGameVersion}
                  </span>
                {/if}
                {#if progress.attempt > 1}
                  <span class="badge badge-warning badge-sm">attempt {progress.attempt}</span>
                {/if}
              </p>
              <p class="text-xs text-base-content/60">
                {progress.index}/{progress.total || "?"}
                {#if progress.phase}· {progress.phase}{/if}
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
              Run <code class="px-1">checkModpacks</code> in the panel console, or wait for the
              weekly run.
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

          <!-- Results, one section per loader + version -->
          {#each groups as group}
            <div class="rounded-xl border border-base-300/40 overflow-hidden">
              <div
                class="px-4 py-2.5 bg-base-200/60 flex items-center justify-between text-sm font-semibold"
              >
                <span class="capitalize">{group.key}</span>
                <span class="text-base-content/50 font-normal text-xs">
                  {group.passed}/{group.rows.length} passed
                </span>
              </div>
              <table class="table table-sm">
                <thead>
                  <tr class="text-xs">
                    <th class="w-8"></th>
                    <th>Pack</th>
                    <th class="w-24">Status</th>
                    <th class="w-24">Mods</th>
                    <th class="w-20">Time</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {#each group.rows as row}
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
                        {#if row.mods?.expected}
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
                        <td colspan="6" class="bg-base-200/40">
                          <div class="text-xs space-y-2 py-1">
                            <div class="flex flex-wrap gap-x-6 gap-y-1 text-base-content/60">
                              <span>Checked {when(row.checkedAt)}</span>
                              <span>{row.platform === "cf" ? "CurseForge" : "Modrinth"} · {row.projectId}</span>
                              {#if row.slug}<span>{row.slug}</span>{/if}
                            </div>
                            {#if row.firstFailure}
                              <div>
                                <span class="font-semibold">First attempt:</span>
                                {row.firstFailure}
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
          {/each}
        {/if}
      {/if}
    </div>
  </div>
</div>
