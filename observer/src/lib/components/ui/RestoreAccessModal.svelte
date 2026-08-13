<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import { apiurl } from "$lib/scripts/req";
  import { Loader, Check, X, AlertTriangle, Minus, RotateCcw, ArrowRight } from "lucide-svelte";

  export let serverId: string;
  export let restoreWorld: boolean = true;

  const dispatch = createEventDispatcher();

  type Step = {
    key: string;
    label: string;
    status: "pending" | "running" | "done" | "skipped" | "failed" | "cancelled";
    detail: string | null;
  };
  type Warning = { code: string; message: string };
  type Result = {
    serverId: string;
    previousServerId: string;
    movedSlot: boolean;
    serverName: string;
    software: string;
    version: string;
    worldKept: boolean;
  };

  let status: "starting" | "running" | "done" | "failed" = "starting";
  let steps: Step[] = [];
  let warnings: Warning[] = [];
  let result: Result | null = null;
  let error = "";
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function headers() {
    return {
      "Content-Type": "application/json",
      username: localStorage.getItem("accountEmail"),
      token: localStorage.getItem("token"),
    };
  }

  function apply(data: any) {
    if (Array.isArray(data.steps)) steps = data.steps;
    if (Array.isArray(data.warnings)) warnings = data.warnings;
    if (data.result) result = data.result;
    if (data.status === "done" || data.status === "failed") {
      status = data.status;
      if (data.status === "failed") error = data.error || "The restore didn't complete.";
      dispatch(data.status === "done" ? "restored" : "failed");
    } else {
      status = "running";
    }
  }

  async function poll() {
    if (stopped) return;
    try {
      const res = await fetch(`${apiurl}server/restore/${serverId}/progress`, {
        headers: headers(),
      });
      if (res.ok) apply(await res.json());
    } catch (e) {
      // A dropped poll isn't a failed restore — the job runs server-side and
      // the next tick picks the state back up.
    }
    if (!stopped && status === "running") pollTimer = setTimeout(poll, 900);
  }

  async function start() {
    try {
      const res = await fetch(`${apiurl}server/restore/${serverId}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ restoreWorld }),
      });
      const json = await res.json();
      if (!res.ok) {
        status = "failed";
        error = json.msg || "We couldn't start the restore.";
        dispatch("failed");
        return;
      }
      apply(json);
      if (status === "running") poll();
    } catch (e) {
      status = "failed";
      error = "We couldn't reach the server. Please try again.";
      dispatch("failed");
    }
  }

  onMount(() => {
    document.body.style.overflow = "hidden";
    if (browser) start();
  });

  onDestroy(() => {
    stopped = true;
    if (pollTimer) clearTimeout(pollTimer);
    document.body.style.overflow = "";
  });

  // Closing mid-restore would only hide a job that keeps running server-side,
  // and the user would have no way back to it.
  $: closeable = status === "done" || status === "failed";

  function goToServer() {
    window.location.href = "/dashboard";
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center p-4"
  style="background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);"
  on:click|self={() => closeable && dispatch("close")}
>
  <div class="restore-modal relative flex flex-col w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl">

    <div class="restore-header flex items-center justify-between px-6 py-4">
      <div class="flex items-center gap-2.5">
        <div
          class="restore-icon-wrap flex items-center justify-center rounded-lg"
          class:restore-icon-success={status === "done"}
          class:restore-icon-error={status === "failed"}
        >
          {#if status === "done"}
            <Check size={18} />
          {:else if status === "failed"}
            <AlertTriangle size={18} />
          {:else}
            <RotateCcw size={18} />
          {/if}
        </div>
        <div>
          <p class="font-poppins-bold text-base">
            {#if status === "done"}
              Server restored
            {:else if status === "failed"}
              Restore didn't finish
            {:else}
              Restoring your server
            {/if}
          </p>
          <p class="restore-sub text-xs">Server #{serverId}</p>
        </div>
      </div>
      {#if closeable}
        <button class="restore-close rounded-lg p-1.5" on:click={() => dispatch("close")}>
          <X size={18} />
        </button>
      {/if}
    </div>

    <div class="restore-body px-6 py-5 flex flex-col gap-4">

      {#if status === "starting"}
        <div class="flex items-center justify-center py-10">
          <Loader size={28} class="animate-spin restore-muted" />
        </div>
      {:else}
        <ul class="flex flex-col gap-2.5">
          {#each steps as step (step.key)}
            <li class="flex items-start gap-3">
              <div
                class="restore-step-icon flex items-center justify-center rounded-full shrink-0"
                class:restore-step-active={step.status === "running"}
                class:restore-step-done={step.status === "done"}
                class:restore-step-skipped={step.status === "skipped"}
                class:restore-step-failed={step.status === "failed"}
              >
                {#if step.status === "running"}
                  <Loader size={12} class="animate-spin" />
                {:else if step.status === "done"}
                  <Check size={12} />
                {:else if step.status === "skipped"}
                  <Minus size={12} />
                {:else if step.status === "failed"}
                  <X size={12} />
                {:else}
                  <span class="restore-dot"></span>
                {/if}
              </div>
              <div class="min-w-0">
                <p
                  class="text-sm leading-tight"
                  class:restore-muted={step.status === "pending" || step.status === "cancelled"}
                >
                  {step.label}
                </p>
                {#if step.detail}
                  <p class="restore-detail text-xs mt-0.5">{step.detail}</p>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}

      {#if status === "failed" && error}
        <div class="restore-error rounded-xl p-3 text-sm">{error}</div>
      {/if}

      {#if warnings.length}
        <div class="flex flex-col gap-2">
          {#each warnings as warning}
            <div class="restore-warning rounded-xl p-3 text-xs flex items-start gap-2">
              <AlertTriangle size={13} class="mt-0.5 shrink-0" />
              <span>{warning.message}</span>
            </div>
          {/each}
        </div>
      {/if}

      {#if status === "done" && result}
        <div class="restore-success rounded-xl p-4 flex flex-col gap-1">
          <p class="font-poppins-bold text-sm">{result.serverName} is back</p>
          <p class="text-xs restore-muted">
            {result.software} {result.version} ·
            {#if result.movedSlot}
              now running as server #{result.serverId}
            {:else}
              server #{result.serverId}
            {/if}
          </p>
          {#if !result.worldKept}
            <p class="text-xs restore-muted">
              Your previous world was moved to storage - you'll start on a fresh one.
            </p>
          {/if}
        </div>
      {/if}

      <div class="flex items-center justify-between gap-3 pt-1">
        <p class="restore-muted text-xs max-w-[16rem]">
          {#if status === "done"}
            You can start your server from the dashboard.
          {:else if status === "failed"}
            Nothing was lost - your data is still in storage.
          {:else}
            This usually takes a few seconds. Please don't close this window.
          {/if}
        </p>
        {#if status === "done"}
          <button class="restore-btn flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-poppins-bold" on:click={goToServer}>
            Go to my server
            <ArrowRight size={15} />
          </button>
        {:else if status === "failed"}
          <button class="restore-btn flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-poppins-bold" on:click={() => dispatch("close")}>
            Close
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>

<style lang="scss">
  .restore-modal {
    background: var(--restore-bg, #1a1a24);
    border: 1px solid rgba(255, 255, 255, 0.07);
  }

  .restore-header {
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.025);
  }

  .restore-icon-wrap {
    width: 2rem;
    height: 2rem;
    background: rgba(99, 102, 241, 0.15);
    color: #6366f1;
  }

  .restore-icon-success {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
  }

  .restore-icon-error {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }

  .restore-sub { color: rgba(255, 255, 255, 0.4); }
  .restore-muted { color: rgba(255, 255, 255, 0.45); }
  .restore-detail { color: rgba(255, 255, 255, 0.35); }

  .restore-close {
    background: transparent;
    color: rgba(255, 255, 255, 0.4);
    border: none;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
    &:hover {
      background: rgba(255, 255, 255, 0.07);
      color: rgba(255, 255, 255, 0.8);
    }
  }

  .restore-step-icon {
    width: 1.25rem;
    height: 1.25rem;
    margin-top: 0.1rem;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.35);
    transition: background 0.2s, color 0.2s;
  }

  .restore-dot {
    width: 0.3rem;
    height: 0.3rem;
    border-radius: 50%;
    background: currentColor;
  }

  .restore-step-active {
    background: rgba(99, 102, 241, 0.18);
    color: #818cf8;
  }

  .restore-step-done {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
  }

  .restore-step-skipped {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.4);
  }

  .restore-step-failed {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }

  .restore-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.25);
    color: #f87171;
  }

  .restore-warning {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.22);
    color: #f59e0b;
  }

  .restore-success {
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(34, 197, 94, 0.2);
  }

  .restore-btn {
    background: #6366f1;
    color: #fff;
    border: none;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 0.15s;
    &:hover:not(:disabled) { background: #4f46e5; }
    &:disabled { opacity: 0.4; cursor: not-allowed; }
  }

  @media (prefers-color-scheme: light) {
    .restore-modal { background: #fff; border-color: rgba(0, 0, 0, 0.08); }
    .restore-header { border-color: rgba(0, 0, 0, 0.07); background: rgba(0, 0, 0, 0.02); }
    .restore-sub, .restore-muted { color: rgba(0, 0, 0, 0.45); }
    .restore-detail { color: rgba(0, 0, 0, 0.38); }
    .restore-close { color: rgba(0, 0, 0, 0.4); &:hover { background: rgba(0, 0, 0, 0.06); color: rgba(0, 0, 0, 0.8); } }
    .restore-step-icon { background: rgba(0, 0, 0, 0.05); color: rgba(0, 0, 0, 0.35); }
    .restore-step-skipped { background: rgba(0, 0, 0, 0.05); color: rgba(0, 0, 0, 0.4); }
  }

  :root[data-theme="light"] {
    .restore-modal { background: #fff; border-color: rgba(0, 0, 0, 0.08); }
    .restore-header { border-color: rgba(0, 0, 0, 0.07); background: rgba(0, 0, 0, 0.02); }
    .restore-sub, .restore-muted { color: rgba(0, 0, 0, 0.45); }
    .restore-detail { color: rgba(0, 0, 0, 0.38); }
    .restore-close { color: rgba(0, 0, 0, 0.4); }
    .restore-step-icon { background: rgba(0, 0, 0, 0.05); color: rgba(0, 0, 0, 0.35); }
    .restore-step-skipped { background: rgba(0, 0, 0, 0.05); color: rgba(0, 0, 0, 0.4); }
  }
</style>
