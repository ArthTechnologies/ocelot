<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy, tick as svelteTick } from "svelte";
  import { streamModpackCheck } from "$lib/scripts/req";
  import CurseForgeModInfoModal from "$lib/components/ui/CurseForgeModInfoModal.svelte";
  import {
    X,
    Loader,
    Download,
    TerminalSquare,
    CheckCircle2,
    Search,
    PackageOpen,
    Rocket,
    Trash2,
    AlertTriangle,
    RefreshCw,
  } from "lucide-svelte";

  const dispatch = createEventDispatcher();

  let controller = new AbortController();
  let finished = false;
  let inspectingProjectId: string | number | null = null;
  let sawAnything = false;
  let streamError = false;
  let event: any = null;
  let termRefs: Record<number, HTMLDivElement> = {};
  let stuckToBottom: Record<number, boolean> = {};

  // The backend writes its first NDJSON line within ~15s even when idle (see
  // IDLE_LIMIT_TICKS in the stream route) and roughly once a second after
  // that while running. A connection that's accepted but then never
  // delivers a byte - a stalled write, a proxy that swallows the response,
  // the backend hanging - leaves fetch()'s reader.read() pending forever:
  // it neither resolves nor rejects, so streamModpackCheck's onEvent is
  // never called and the UI is stuck showing "waiting" with no way to tell
  // that apart from a connection that's actually dead. This watchdog is the
  // client-side backstop for that: armed on connect and re-armed on every
  // real event, it flips into the same error state a failed fetch would.
  const STREAM_TIMEOUT_MS = 20000;
  let watchdog: ReturnType<typeof setTimeout> | null = null;

  function armWatchdog() {
    clearWatchdog();
    watchdog = setTimeout(() => {
      streamError = true;
      controller.abort(); // stop waiting on whatever's stuck
    }, STREAM_TIMEOUT_MS);
  }

  function clearWatchdog() {
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
  }

  // Slot cards stack vertically inside an 80vh body. Three full-height
  // terminals overflow that on most screens, so they shrink once there are
  // more than two — better to see every slot at once than to scroll for the
  // third. Every class is spelled out in full here rather than built up by
  // interpolation, because Tailwind only emits classes it can find literally
  // in the source.
  $: threeUp = (event?.slots?.length || 0) > 2;
  $: termHeight = threeUp ? "h-56" : "h-72";
  $: panelHeight = threeUp ? "lg:h-56" : "lg:h-72";

  const PHASE_META: Record<string, { label: string; icon: any }> = {
    discovering: { label: "Discovering packs", icon: Search },
    checking: { label: "Checking", icon: Loader },
    downloading: { label: "Downloading mods", icon: PackageOpen },
    booting: { label: "Booting server", icon: Rocket },
    "cleaning up": { label: "Cleaning up", icon: Trash2 },
  };

  function phaseMeta(phase: string) {
    return PHASE_META[phase] || { label: phase || "Working", icon: Loader };
  }

  function elapsed(startedAt: number | null | undefined) {
    if (!startedAt) return "-";
    const secs = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  }

  async function handleEvent(data: any) {
    if (data.streamError) {
      clearWatchdog();
      streamError = true;
      return;
    }
    // A real line arrived, so the connection is proven alive - reset the
    // clock before doing anything else with it.
    armWatchdog();

    sawAnything = true;
    event = data;
    if (!data.running) {
      clearWatchdog();
      finished = true;
      dispatch("finished");
      return;
    }

    await svelteTick();
    for (const slot of data.slots || []) {
      const el = termRefs[slot.id];
      if (!el) continue;
      if (stuckToBottom[slot.id] !== false) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }

  function handleScroll(id: number) {
    const el = termRefs[id];
    if (!el) return;
    stuckToBottom[id] = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
  }

  function connect() {
    streamError = false;
    controller = new AbortController();
    armWatchdog();
    streamModpackCheck(handleEvent, controller.signal);
  }

  onMount(() => {
    document.body.style.overflow = "hidden";
    connect();
  });

  onDestroy(() => {
    document.body.style.overflow = "";
    clearWatchdog();
    controller.abort();
  });

  $: percent =
    event?.total ? Math.min(100, Math.round((event.index / event.total) * 100)) : 0;
</script>

<svelte:window on:keydown={(e) => e.key === "Escape" && dispatch("close")} />

<div
  class="fixed inset-0 z-[60] overflow-y-auto p-4"
  style="background: rgba(0,0,0,0.75); backdrop-filter: blur(4px);"
  role="presentation"
  on:click|self={() => dispatch("close")}
  on:keydown={(e) => e.key === "Escape" && dispatch("close")}
>
  <div class="mx-auto max-w-6xl">
    <div class="bg-base-100 border border-base-300/40 rounded-2xl shadow-2xl w-full overflow-hidden">
      <!-- Header -->
      <div class="sticky top-0 z-10 bg-base-100 flex items-center justify-between px-6 py-4 border-b border-base-300/50">
        <div>
          <h2 class="text-xl font-bold flex items-center gap-2">
            <TerminalSquare size={20} class="text-primary" />
            Live Check
            {#if streamError}
              <span class="badge badge-error gap-1 text-xs">
                <AlertTriangle size={12} /> disconnected
              </span>
            {:else if !finished}
              <span class="badge badge-warning gap-1 text-xs">
                <Loader size={12} class="animate-spin" /> live
              </span>
            {:else}
              <span class="badge badge-success gap-1 text-xs">
                <CheckCircle2 size={12} /> done
              </span>
            {/if}
          </h2>
          {#if streamError}
            <p class="text-error text-xs mt-0.5">
              Lost connection to the live stream. The check itself keeps running on the
              server — this view just isn't watching it anymore.
            </p>
          {:else if event?.running}
            <p class="text-base-content/50 text-xs mt-0.5">
              Started {elapsed(event.startedAt)} ago
              {#if event.total > 1}· pack {event.index}/{event.total}{/if}
              · <span class="text-success">{event.passed} passed</span>
              · <span class="text-error">{event.failed} failed</span>
              · {event.skipped} skipped
            </p>
          {:else if !sawAnything}
            <p class="text-base-content/50 text-xs mt-0.5">Waiting for the check to start…</p>
          {:else}
            <p class="text-base-content/50 text-xs mt-0.5">Check finished - close this to see the updated results.</p>
          {/if}
        </div>
        <button class="btn btn-ghost btn-sm btn-circle" on:click={() => dispatch("close")} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      {#if event?.total > 1}
        <progress class="progress progress-primary w-full h-1 rounded-none" value={percent} max="100"></progress>
      {/if}

      <!-- Body -->
      <div class="px-6 py-5 flex flex-col gap-5 max-h-[80vh] overflow-y-auto">
        {#if streamError}
          <div class="flex flex-col items-center justify-center gap-3 text-base-content/60 py-16">
            <AlertTriangle size={32} class="text-error" />
            <p>Couldn't reach the live stream.</p>
            <button class="btn btn-sm btn-error btn-outline gap-1.5" on:click={connect}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        {:else if !event?.running}
          <div class="flex flex-col items-center justify-center gap-3 text-base-content/60 py-16">
            {#if finished}
              <CheckCircle2 size={32} class="text-success" />
              <p>Check complete.</p>
            {:else}
              <span class="loading loading-spinner loading-md text-primary"></span>
              <p>Waiting for the run to report in…</p>
            {/if}
          </div>
        {:else if !event.slots?.length}
          <div class="flex flex-col items-center justify-center gap-3 text-base-content/60 py-16">
            <Search size={32} class="text-primary animate-pulse" />
            <p>Discovering packs to check…</p>
          </div>
        {:else}
          {#each event.slots as slot (slot.id)}
            {@const meta = phaseMeta(slot.pack?.phase || event.phase)}
            <div class="rounded-xl border border-base-300/40 overflow-hidden">
              <!-- Slot header -->
              <div class="flex items-center justify-between px-4 py-2.5 bg-base-200/50 border-b border-base-300/40">
                <div class="flex items-center gap-2 min-w-0">
                  <svelte:component this={meta.icon} size={14} class="text-primary shrink-0 {meta.icon === Loader ? 'animate-spin' : ''}" />
                  <span class="font-medium text-sm truncate">{slot.pack?.name || "-"}</span>
                  <span class="badge badge-ghost badge-sm shrink-0 capitalize">
                    {slot.pack?.loader} {slot.pack?.gameVersion}
                  </span>
                </div>
                <span class="text-xs text-base-content/50 shrink-0">{meta.label}</span>
              </div>

              <!-- Terminal + download progress, side by side -->
              <div class="flex flex-col lg:flex-row">
                <div
                  class="flex-1 bg-black/90 text-gray-200 font-mono text-[12px] leading-relaxed p-3 {termHeight} overflow-y-auto whitespace-pre-wrap break-words"
                  bind:this={termRefs[slot.id]}
                  on:scroll={() => handleScroll(slot.id)}
                >{slot.terminal || "…"}</div>

                <div class="lg:w-64 shrink-0 border-t lg:border-t-0 lg:border-l border-base-300/40 p-3 flex flex-col gap-3 {panelHeight}">
                  <div>
                    <div class="flex items-center justify-between text-xs mb-1">
                      <span class="flex items-center gap-1.5 text-base-content/60">
                        <Download size={12} /> Mods
                      </span>
                      <span class="font-medium flex items-center gap-1.5">
                        {slot.download?.completed || 0}/{slot.download?.total || "?"}
                        {#if slot.download?.failed}
                          <span class="badge badge-warning badge-xs gap-1 font-normal">
                            {slot.download.failed} failed
                          </span>
                        {/if}
                      </span>
                    </div>
                    <!-- Tracks settled (completed+failed) so the bar keeps
                    moving even on a pack that's shedding mods CurseForge won't
                    serve - "completed" alone would look stalled. -->
                    <progress
                      class="progress {slot.download?.failed ? 'progress-warning' : 'progress-primary'} w-full h-1.5"
                      value={slot.download?.total ? (slot.download.completed || 0) + (slot.download.failed || 0) : 0}
                      max={slot.download?.total || 1}
                    ></progress>
                  </div>

                  <div class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
                    {#if slot.download?.inFlight?.length}
                      {#each slot.download.inFlight as file (file)}
                        <div class="flex items-center gap-1.5 text-[11px] text-base-content/70 truncate">
                          <span class="relative flex h-1.5 w-1.5 shrink-0">
                            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60"></span>
                            <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
                          </span>
                          <span class="truncate" title={file}>{file}</span>
                        </div>
                      {/each}
                    {:else}
                      <p class="text-[11px] text-base-content/40">
                        {(slot.pack?.phase || event.phase) === "downloading" ? "Waiting on downloads…" : "Not downloading right now."}
                      </p>
                    {/if}
                  </div>

                  {#if slot.download?.failedMods?.length}
                    <div class="border-t border-base-300/40 pt-2 flex flex-col gap-1 min-h-0 shrink-0">
                      <p class="text-[11px] font-medium text-warning flex items-center gap-1">
                        <AlertTriangle size={11} /> Failed downloads
                      </p>
                      <div class="max-h-28 overflow-y-auto flex flex-col gap-1.5 pr-1">
                        {#each slot.download.failedMods as mod (mod.name)}
                          {#if mod.platform === "cf" && mod.projectId}
                            <button
                              type="button"
                              class="text-[10px] leading-tight text-left hover:bg-base-200/60 rounded px-1 -mx-1 py-0.5 transition-colors"
                              on:click={() => (inspectingProjectId = mod.projectId)}
                              title="Click to look up this mod's real name"
                            >
                              <div class="text-base-content/80 font-medium truncate underline decoration-dotted underline-offset-2">
                                {mod.name}
                              </div>
                              <div class="text-warning/80">{mod.reason}</div>
                            </button>
                          {:else}
                            <div class="text-[10px] leading-tight">
                              <div class="text-base-content/80 font-medium truncate" title={mod.name}>{mod.name}</div>
                              <div class="text-warning/80">{mod.reason}</div>
                            </div>
                          {/if}
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
</div>

{#if inspectingProjectId}
  <CurseForgeModInfoModal
    projectId={inspectingProjectId}
    on:close={() => (inspectingProjectId = null)}
  />
{/if}
