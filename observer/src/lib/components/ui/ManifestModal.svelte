<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { getModpackCheckManifest } from "$lib/scripts/req";
  import { X, AlertTriangle, Copy, Check } from "lucide-svelte";

  export let serverId: number;

  const dispatch = createEventDispatcher();

  let loading = true;
  let error = "";
  let source = "";
  let text = ""; // pretty-printed manifest JSON, or the raw body if it wasn't valid JSON
  let truncated = false;
  let copied = false;

  onMount(async () => {
    const data = await getModpackCheckManifest(serverId);
    if (!data) {
      error = "Couldn't reach the server to look up the manifest.";
    } else if (!data.available) {
      error = "No manifest for this install - either it hasn't been written yet, or this is a server pack with no manifest of its own.";
    } else {
      source = data.source;
      truncated = !!data.truncated;
      text = data.manifest !== undefined ? JSON.stringify(data.manifest, null, 2) : data.raw || "";
    }
    loading = false;
  });

  function copyText() {
    navigator.clipboard.writeText(text).then(() => {
      copied = true;
      setTimeout(() => (copied = false), 1500);
    });
  }
</script>

<svelte:window on:keydown={(e) => e.key === "Escape" && dispatch("close")} />

<div
  class="fixed inset-0 z-[70] flex items-center justify-center p-4"
  style="background: rgba(0,0,0,0.75); backdrop-filter: blur(4px);"
  role="presentation"
  on:click|self={() => dispatch("close")}
  on:keydown={(e) => e.key === "Escape" && dispatch("close")}
>
  <div class="bg-base-100 border border-base-300/40 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
    <div class="flex items-center justify-between px-5 py-3 border-b border-base-300/50 shrink-0">
      <div class="min-w-0">
        <h2 class="text-sm font-bold">Manifest</h2>
        {#if source}
          <p class="text-xs text-base-content/50 truncate">{source} · server {serverId}</p>
        {/if}
      </div>
      <div class="flex items-center gap-1 shrink-0">
        {#if text}
          <button class="btn btn-ghost btn-xs gap-1.5" on:click={copyText} title="Copy JSON">
            {#if copied}
              <Check size={13} class="text-success" /> Copied
            {:else}
              <Copy size={13} /> Copy
            {/if}
          </button>
        {/if}
        <button class="btn btn-ghost btn-xs btn-circle" on:click={() => dispatch("close")} aria-label="Close">
          <X size={16} />
        </button>
      </div>
    </div>

    <div class="p-5 overflow-y-auto min-h-0">
      {#if loading}
        <div class="flex items-center gap-3 text-base-content/60 text-sm py-4">
          <span class="loading loading-spinner loading-sm text-primary"></span>
          Loading manifest…
        </div>
      {:else if error}
        <div class="flex items-start gap-2 text-warning text-sm">
          <AlertTriangle size={16} class="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      {:else}
        {#if truncated}
          <div class="alert alert-warning bg-warning/10 border border-warning/30 text-xs mb-3">
            This manifest is over 2MB - showing the first 2MB only.
          </div>
        {/if}
        <pre class="bg-base-300/50 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap break-words">{text}</pre>
      {/if}
    </div>
  </div>
</div>
