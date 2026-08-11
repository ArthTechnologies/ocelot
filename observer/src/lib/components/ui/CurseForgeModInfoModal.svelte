<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { getCurseForgeModInfo } from "$lib/scripts/req";
  import { X, ExternalLink, AlertTriangle } from "lucide-svelte";

  export let projectId: string | number;

  const dispatch = createEventDispatcher();

  let loading = true;
  let mod: any = null;
  let error = "";

  onMount(async () => {
    const data = await getCurseForgeModInfo(projectId);
    if (data && data.name) {
      mod = data;
    } else {
      error = "Couldn't load info for this mod - it may have been removed from CurseForge.";
    }
    loading = false;
  });
</script>

<svelte:window on:keydown={(e) => e.key === "Escape" && dispatch("close")} />

<div
  class="fixed inset-0 z-[70] flex items-center justify-center p-4"
  style="background: rgba(0,0,0,0.75); backdrop-filter: blur(4px);"
  role="presentation"
  on:click|self={() => dispatch("close")}
  on:keydown={(e) => e.key === "Escape" && dispatch("close")}
>
  <div class="bg-base-100 border border-base-300/40 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
    <div class="flex items-center justify-between px-5 py-3 border-b border-base-300/50">
      <h2 class="text-sm font-bold">CurseForge Mod</h2>
      <button class="btn btn-ghost btn-xs btn-circle" on:click={() => dispatch("close")} aria-label="Close">
        <X size={16} />
      </button>
    </div>

    <div class="p-5">
      {#if loading}
        <div class="flex items-center gap-3 text-base-content/60 text-sm py-4">
          <span class="loading loading-spinner loading-sm text-primary"></span>
          Looking up mod {projectId}…
        </div>
      {:else if error}
        <div class="flex items-start gap-2 text-warning text-sm">
          <AlertTriangle size={16} class="shrink-0 mt-0.5" />
          <div>
            {error}
            <p class="text-base-content/40 text-xs mt-1">Project ID: {projectId}</p>
          </div>
        </div>
      {:else}
        <div class="flex items-center gap-3 mb-3">
          {#if mod.logo?.thumbnailUrl}
            <img src={mod.logo.thumbnailUrl} alt="" class="w-12 h-12 rounded-lg shrink-0 object-cover" />
          {/if}
          <div class="min-w-0">
            <p class="font-semibold truncate">{mod.name}</p>
            {#if mod.authors?.[0]?.name}
              <p class="text-xs text-base-content/50 truncate">by {mod.authors[0].name}</p>
            {/if}
          </div>
        </div>
        {#if mod.summary}
          <p class="text-sm text-base-content/70 mb-3">{mod.summary}</p>
        {/if}
        <div class="flex items-center justify-between text-xs text-base-content/40">
          <span>Project ID: {projectId}</span>
          {#if mod.links?.websiteUrl}
            <a
              href={mod.links.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="link link-primary flex items-center gap-1"
            >
              View on CurseForge <ExternalLink size={11} />
            </a>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
