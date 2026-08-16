<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import { getScraperStatus, runScraper } from "$lib/scripts/req";
  import {
    X,
    RefreshCw,
    CheckCircle2,
    XCircle,
    ChevronRight,
    Loader,
    Play,
    Clock,
  } from "lucide-svelte";

  const dispatch = createEventDispatcher();

  let data: any = null;
  let loading = true;
  let error = "";
  let filter = "all";
  let pollTimer: any = null;
  let starting: "" | "full" | "partial" = ""; // which run button was clicked, waiting on the start response
  let actionError = "";

  // The scraper is one sequential job (minutes, not the hours a modpack
  // check takes), so a faster poll while it's live still costs nothing.
  const POLL_MS = 2000;

  async function load() {
    const res = await getScraperStatus();
    if (res) {
      data = res;
      error = "";
    } else if (!data) {
      error = "Couldn't load scraper status. This endpoint requires admin access.";
    }
    loading = false;

    if (!data?.running) starting = "";

    clearTimeout(pollTimer);
    if (data?.running) pollTimer = setTimeout(load, POLL_MS);
  }

  async function startRun(mode: "full" | "partial") {
    if (starting || data?.running) return;
    starting = mode;
    actionError = "";
    const res = await runScraper(mode);
    if (!res || res.ok === false) {
      actionError = res?.error || "Couldn't start the scrape.";
      starting = "";
      return;
    }
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

  function when(ts: string | null | undefined) {
    return ts ? new Date(ts).toLocaleString() : "never";
  }

  function duration(startIso: string | null | undefined, endIso: string | null | undefined) {
    if (!startIso || !endIso) return "-";
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (!ms || ms < 1000) return "-";
    const total = Math.round(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  }

  $: progress = data?.progress || null;
  $: log = (progress?.log || []) as any[];
  $: counts = {
    all: log.length,
    success: log.filter((l) => l.success).length,
    failed: log.filter((l) => !l.success).length,
  };
  $: filters = [
    { value: "all", label: "All", count: counts.all },
    { value: "success", label: "Downloaded", count: counts.success },
    { value: "failed", label: "Failed", count: counts.failed },
  ];
  // Newest first — the tail of a run in flight is what you actually want to
  // watch, not the first jars it already got through minutes ago.
  $: rows = log
    .filter((l) => filter === "all" || (filter === "success" ? l.success : !l.success))
    .slice()
    .reverse();

  // The two phases after the main scrape steps aren't "download loaders" in
  // the same sense (vanilla/snapshot are fire-and-forget, finishing is just
  // the settle-and-write-to-disk wait) but still deserve a place in the
  // stepper so it doesn't look stalled at 100% for the last few seconds.
  $: displaySteps = [
    ...((progress?.steps || []) as { name: string; label: string }[]),
    { name: "vanilla", label: "Vanilla + Snapshot" },
    { name: "finishing", label: "Finalizing" },
  ];
  $: currentStepIndex = displaySteps.findIndex((s) => s.name === progress?.phase);
</script>

<svelte:window on:keydown={(e) => e.key === "Escape" && dispatch("close")} />

<div
  class="fixed inset-0 z-50 overflow-y-auto p-4"
  style="background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);"
  role="presentation"
  on:click|self={() => dispatch("close")}
  on:keydown={(e) => e.key === "Escape" && dispatch("close")}
>
  <div class="mx-auto max-w-4xl">
    <div class="bg-base-100 border border-base-300/40 rounded-2xl shadow-2xl w-full">
      <!-- Header -->
      <div
        class="sticky top-0 z-10 bg-base-100 rounded-t-2xl flex items-center justify-between px-6 py-4 border-b border-base-300/50"
      >
        <div>
          <h2 class="text-xl font-bold flex items-center gap-2">
            Debug Scraper
            {#if data?.running}
              <span class="badge badge-warning gap-1 text-xs">
                <Loader size={12} class="animate-spin" /> running
              </span>
            {/if}
          </h2>
          <p class="text-base-content/50 text-xs mt-0.5">
            Last run {when(progress?.finishedAt)}
            {#if progress?.startedAt && progress?.finishedAt}
              · took {duration(progress.startedAt, progress.finishedAt)}
            {/if}
            {#if progress?.mode}· mode: {progress.mode}{/if}
          </p>
        </div>
        <div class="flex items-center gap-1">
          <button
            class="btn btn-outline btn-sm gap-1.5"
            disabled={!!starting || data?.running}
            on:click={() => startRun("partial")}
            title="Refresh only recent Minecraft versions (what the 2-hourly cron runs)"
          >
            {#if starting === "partial"}
              <Loader size={14} class="animate-spin" />
            {:else}
              <Play size={14} />
            {/if}
            Run Partial
          </button>
          <button
            class="btn btn-primary btn-sm gap-1.5"
            disabled={!!starting || data?.running}
            on:click={() => startRun("full")}
            title="Re-scrape every version (what the daily cron runs)"
          >
            {#if starting === "full"}
              <Loader size={14} class="animate-spin" />
            {:else}
              <Play size={14} />
            {/if}
            Run Full
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
            Loading scraper status…
          </div>
        {:else if error}
          <div class="alert alert-error bg-error/10 border border-error/30 text-sm">{error}</div>
        {:else}
          <!-- Step overview -->
          <div class="rounded-xl border border-base-300/40 p-4">
            <div class="flex flex-wrap gap-2">
              {#each displaySteps as step, i}
                {@const state =
                  !data?.running
                    ? "idle"
                    : i < currentStepIndex
                    ? "done"
                    : i === currentStepIndex
                    ? "active"
                    : "pending"}
                <span
                  class="badge gap-1.5 py-3 {state === 'active'
                    ? 'badge-warning'
                    : state === 'done'
                    ? 'badge-success badge-outline'
                    : 'badge-ghost bg-base-200 text-base-content/50'}"
                >
                  {#if state === "active"}
                    <Loader size={12} class="animate-spin" />
                  {:else if state === "done"}
                    <CheckCircle2 size={12} />
                  {/if}
                  {step.label}
                </span>
                {#if i < displaySteps.length - 1}
                  <ChevronRight size={14} class="text-base-content/20 self-center -mx-1" />
                {/if}
              {/each}
            </div>
            {#if data?.running}
              <div class="flex gap-4 mt-3 text-xs text-base-content/60">
                <span class="flex items-center gap-1"><Clock size={12} /> Started {when(progress.startedAt)}</span>
                <span class="text-success">{counts.success} downloaded</span>
                <span class="text-error">{counts.failed} failed</span>
              </div>
            {:else if progress?.finishedAt}
              <div class="flex gap-4 mt-3 text-xs text-base-content/60">
                <span class="text-success">{counts.success} downloaded</span>
                <span class="text-error">{counts.failed} failed</span>
              </div>
            {/if}
          </div>

          <!-- Log -->
          <div>
            <div class="flex flex-wrap gap-2 mb-3">
              {#each filters as f}
                <button
                  class="btn btn-sm {filter === f.value ? 'btn-primary' : 'btn-ghost bg-base-200'}"
                  on:click={() => (filter = f.value)}
                >
                  {f.label} <span class="opacity-60">({f.count})</span>
                </button>
              {/each}
            </div>

            {#if rows.length === 0}
              <p class="text-base-content/50 text-sm py-6 text-center">
                {log.length === 0 ? "No jars logged yet." : "Nothing matches this filter."}
              </p>
            {:else}
              <div class="rounded-xl border border-base-300/40 overflow-hidden">
                <div class="max-h-[28rem] overflow-y-auto divide-y divide-base-300/30">
                  {#each rows as entry}
                    <div class="flex items-start gap-2.5 px-3 py-2 text-sm">
                      {#if entry.success}
                        <CheckCircle2 size={16} class="text-success shrink-0 mt-0.5" />
                      {:else}
                        <XCircle size={16} class="text-error shrink-0 mt-0.5" />
                      {/if}
                      <div class="min-w-0 flex-1">
                        <p class="font-mono text-xs truncate">{entry.filename}</p>
                        {#if entry.error}
                          <p class="text-error text-xs mt-0.5">{entry.error}</p>
                        {:else if entry.note}
                          <p class="text-base-content/50 text-xs mt-0.5">{entry.note}</p>
                        {:else if entry.fileSize}
                          <p class="text-base-content/50 text-xs mt-0.5">
                            {(entry.fileSize / 1024 / 1024).toFixed(1)} MB
                          </p>
                        {/if}
                      </div>
                      <span class="text-base-content/40 text-xs whitespace-nowrap"
                        >{new Date(entry.timestamp).toLocaleTimeString()}</span
                      >
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
