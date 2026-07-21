<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import { apiurl } from "$lib/scripts/req";
  import { Loader, AlertTriangle, HardDrive, Calendar, Users, X, Package } from "lucide-svelte";

  export let serverId: number;

  const dispatch = createEventDispatcher();

  let loading = true;
  let submitting = false;
  let error = "";
  let choice: "live" | "trashbin" | null = null;
  type WorldInfo = { name: string; software: string; version: string; worldSize: string; mods: number; plugins: number; lastModified: string | null; playerCount: number; warnings: string[] };
  let data: { live: WorldInfo; trashbin: WorldInfo } | null = null;

  onMount(async () => {
    document.body.style.overflow = "hidden";
    if (!browser) return;
    try {
      const res = await fetch(`${apiurl}support/bug-resolver/${serverId}`, {
        headers: {
          username: localStorage.getItem("accountEmail"),
          token: localStorage.getItem("token"),
        },
      });
      if (!res.ok) throw new Error((await res.json()).msg || "Failed to load");
      data = await res.json();
    } catch (e) {
      error = e.message || "Could not load server data.";
    } finally {
      loading = false;
    }
  });

  onDestroy(() => {
    document.body.style.overflow = "";
  });

  async function resolve() {
    if (!choice) return;
    submitting = true;
    error = "";
    try {
      const res = await fetch(`${apiurl}support/bug-resolver/${serverId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          username: localStorage.getItem("accountEmail"),
          token: localStorage.getItem("token"),
        },
        body: JSON.stringify({ choice }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.msg || "Failed to resolve");
      dispatch("resolved");
      window.location.reload();
    } catch (e) {
      error = e.message || "Something went wrong.";
      submitting = false;
    }
  }

  function formatDate(d: string | null) {
    if (!d) return "Unknown";
    const [y, m, day] = d.split("-");
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(day)).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric"
    });
  }

  const warningLabels: Record<string, string> = {
    missing_world: "World folder missing",
    missing_jar: "Server jar missing",
    missing_server_json: "No server config — may be corrupted"
  };
</script>

<!-- Backdrop -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center p-4"
  style="background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);"
  on:click|self={() => dispatch("close")}
>
  <div class="resolver-modal relative flex flex-col w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl">

    <!-- Header -->
    <div class="resolver-header flex items-center justify-between px-6 py-4">
      <div class="flex items-center gap-2.5">
        <div class="resolver-icon-wrap flex items-center justify-center rounded-lg">
          <AlertTriangle size={18} />
        </div>
        <div>
          <p class="font-poppins-bold text-base">Bug Resolver</p>
          <p class="resolver-sub text-xs">Server #{serverId} · two conflicting versions detected</p>
        </div>
      </div>
      <button class="resolver-close rounded-lg p-1.5" on:click={() => dispatch("close")}>
        <X size={18} />
      </button>
    </div>

    <!-- Body -->
    <div class="resolver-body px-6 pb-6 flex flex-col gap-5">

      {#if loading}
        <div class="flex items-center justify-center py-16">
          <Loader size={28} class="animate-spin resolver-muted" />
        </div>

      {:else if error && !data}
        <div class="resolver-error rounded-xl p-4 text-sm">{error}</div>

      {:else if data}
        <p class="resolver-muted text-sm -mb-1">
          Choose which version of this server to keep as the active one.
          The other will remain stored separately.
        </p>

        <!-- World cards -->
        <div class="flex flex-col sm:flex-row gap-3">
          {#each [
            { key: "live", label: "Current live version", world: data.live },
            { key: "trashbin", label: "Archived version", world: data.trashbin }
          ] as option}
            <label
              class="resolver-card flex-1 flex items-start gap-3 rounded-xl p-4 cursor-pointer transition-all"
              class:resolver-card-selected={choice === option.key}
            >
              <!-- Radio -->
              <div class="pt-0.5 flex-shrink-0">
                <input
                  type="radio"
                  name="world-choice"
                  value={option.key}
                  bind:group={choice}
                  class="resolver-radio"
                />
              </div>

              <!-- Content -->
              <div class="flex flex-col gap-2 min-w-0 w-full">
                <div>
                  <p class="font-poppins-bold text-sm truncate">{option.world.name}</p>
                  <p class="resolver-tag text-xs mt-0.5">{option.label}</p>
                </div>

                <p class="resolver-pill text-xs self-start px-2 py-0.5 rounded-full">
                  {option.world.software} {option.world.version}
                </p>

                <div class="resolver-stats grid grid-cols-1 gap-1 mt-1">
                  <div class="flex items-center gap-1.5 text-xs resolver-muted">
                    <HardDrive size={12} />
                    <span>{option.world.worldSize} world</span>
                  </div>
                  {#if option.world.mods > 0}
                    <div class="flex items-center gap-1.5 text-xs resolver-muted">
                      <Package size={12} />
                      <span>{option.world.mods} mods</span>
                    </div>
                  {/if}
                  {#if option.world.plugins > 0}
                    <div class="flex items-center gap-1.5 text-xs resolver-muted">
                      <Package size={12} />
                      <span>{option.world.plugins} plugins</span>
                    </div>
                  {/if}
                  <div class="flex items-center gap-1.5 text-xs resolver-muted">
                    <Calendar size={12} />
                    <span>Last modified {formatDate(option.world.lastModified)}</span>
                  </div>
                  <div class="flex items-center gap-1.5 text-xs resolver-muted">
                    <Users size={12} />
                    <span>{option.world.playerCount} player{option.world.playerCount !== 1 ? "s" : ""} joined</span>
                  </div>
                  {#each (option.world.warnings ?? []) as w}
                    <div class="flex items-center gap-1.5 text-xs resolver-warning">
                      <AlertTriangle size={11} />
                      <span>{warningLabels[w] ?? w}</span>
                    </div>
                  {/each}
                </div>
              </div>
            </label>
          {/each}
        </div>

        {#if error}
          <div class="resolver-error rounded-xl p-3 text-sm">{error}</div>
        {/if}

        <!-- Footer -->
        <div class="flex items-center justify-between gap-3 pt-1">
          <p class="resolver-muted text-xs max-w-xs">
            {#if choice === "live"}
              The archived version will be kept in storage untouched.
            {:else if choice === "trashbin"}
              The current live version will be moved to storage before restoring the archive.
            {:else}
              Select a version above to continue.
            {/if}
          </p>
          <button
            class="resolver-btn flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-poppins-bold transition-all"
            disabled={!choice || submitting}
            on:click={resolve}
          >
            {#if submitting}
              <Loader size={14} class="animate-spin" />
              Applying…
            {:else}
              Apply
            {/if}
          </button>
        </div>
      {/if}

    </div>
  </div>
</div>

<style lang="scss">
  .resolver-modal {
    background: var(--resolver-bg, #1a1a24);
    border: 1px solid rgba(255,255,255,0.07);
  }

  .resolver-header {
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.025);
  }

  .resolver-icon-wrap {
    width: 2rem;
    height: 2rem;
    background: rgba(245,158,11,0.15);
    color: #f59e0b;
  }

  .resolver-sub { color: rgba(255,255,255,0.4); }

  .resolver-close {
    background: transparent;
    color: rgba(255,255,255,0.4);
    border: none;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
    &:hover {
      background: rgba(255,255,255,0.07);
      color: rgba(255,255,255,0.8);
    }
  }

  .resolver-body { background: transparent; }

  .resolver-muted { color: rgba(255,255,255,0.45); }

  .resolver-card {
    background: rgba(255,255,255,0.04);
    border: 1.5px solid rgba(255,255,255,0.07);
    &:hover { border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.06); }
  }

  .resolver-card-selected {
    border-color: #6366f1 !important;
    background: rgba(99,102,241,0.08) !important;
  }

  .resolver-radio {
    appearance: none;
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.25);
    background: transparent;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    position: relative;
    flex-shrink: 0;

    &:checked {
      border-color: #6366f1;
      background: #6366f1;
      box-shadow: inset 0 0 0 3px #1a1a24;
    }
  }

  .resolver-tag { color: rgba(255,255,255,0.35); }

  .resolver-pill {
    background: rgba(255,255,255,0.07);
    color: rgba(255,255,255,0.55);
    border: 1px solid rgba(255,255,255,0.08);
  }

  .resolver-warning { color: #f59e0b; }

  .resolver-error {
    background: rgba(239,68,68,0.1);
    border: 1px solid rgba(239,68,68,0.25);
    color: #f87171;
  }

  .resolver-btn {
    background: #6366f1;
    color: #fff;
    border: none;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    &:hover:not(:disabled) { background: #4f46e5; }
    &:disabled { opacity: 0.4; cursor: not-allowed; }
  }

  @media (prefers-color-scheme: light) {
    .resolver-modal { background: #fff; border-color: rgba(0,0,0,0.08); }
    .resolver-header { border-color: rgba(0,0,0,0.07); background: rgba(0,0,0,0.02); }
    .resolver-sub, .resolver-muted, .resolver-tag { color: rgba(0,0,0,0.45); }
    .resolver-close { color: rgba(0,0,0,0.4); &:hover { background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.8); } }
    .resolver-card { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.08); &:hover { background: rgba(0,0,0,0.05); border-color: rgba(0,0,0,0.15); } }
    .resolver-card-selected { background: rgba(99,102,241,0.06) !important; }
    .resolver-pill { background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.5); border-color: rgba(0,0,0,0.08); }
    .resolver-radio:checked { box-shadow: inset 0 0 0 3px #fff; }
  }

  :root[data-theme="light"] {
    .resolver-modal { background: #fff; border-color: rgba(0,0,0,0.08); }
    .resolver-header { border-color: rgba(0,0,0,0.07); background: rgba(0,0,0,0.02); }
    .resolver-sub, .resolver-muted, .resolver-tag { color: rgba(0,0,0,0.45); }
    .resolver-close { color: rgba(0,0,0,0.4); }
    .resolver-card { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.08); }
    .resolver-card-selected { background: rgba(99,102,241,0.06) !important; }
    .resolver-pill { background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.5); border-color: rgba(0,0,0,0.08); }
    .resolver-radio:checked { box-shadow: inset 0 0 0 3px #fff; }
  }
</style>
