<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { uploadManualMods } from "$lib/scripts/req";
  import {
    X,
    Download,
    UploadCloud,
    Check,
    AlertTriangle,
    Loader,
  } from "lucide-svelte";

  export let id: number;
  export let mods: any[] = [];

  const dispatch = createEventDispatcher();

  let staged: File[] = [];
  let dragging = false;
  let submitting = false;
  let error = "";

  // CurseForge file names are stable, so a staged jar can be matched back to
  // the mod it satisfies. Normalised the same way the panel matches mods
  // elsewhere, since browsers and mirrors like to rewrite - and _ and case.
  const normalize = (name: string) =>
    (name || "").toLowerCase().replace(/[-_\s]/g, "");

  // Takes the staged files as an argument rather than closing over `staged`:
  // Svelte only re-runs a reactive statement when a variable referenced in the
  // statement itself changes, so a hidden `staged` read inside this function
  // left matchedFiles/outstanding stale after every drop - exact-name matches
  // showed as not matching.
  function matchFor(mod: any, files: File[]): File | undefined {
    const target = normalize(mod.fileName);
    if (!target) return undefined;
    return files.find((f) => normalize(f.name) === target);
  }

  // A file that doesn't line up with anything on the list still gets uploaded —
  // the file name may just have been rewritten on the way down — but it's
  // called out so a wrong download isn't mistaken for a finished one.
  $: matchedFiles = new Set(
    mods.map((m) => matchFor(m, staged)).filter(Boolean) as File[]
  );
  $: unmatched = staged.filter((f) => !matchedFiles.has(f));
  $: outstanding = mods.filter((m) => !matchFor(m, staged));

  function addFiles(list: FileList | null) {
    if (!list) return;
    error = "";
    const incoming = Array.from(list);
    const bad = incoming.find((f) => !f.name.toLowerCase().endsWith(".jar"));
    if (bad) {
      error = `"${bad.name}" isn't a .jar file. Mods have to be the jar you get from CurseForge.`;
      return;
    }
    // Re-picking a file replaces it rather than uploading it twice.
    const names = new Set(incoming.map((f) => f.name));
    staged = [...staged.filter((f) => !names.has(f.name)), ...incoming];
  }

  function removeFile(file: File) {
    staged = staged.filter((f) => f !== file);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    addFiles(event.dataTransfer?.files || null);
  }

  async function done() {
    if (submitting) return;
    submitting = true;
    error = "";
    const result = await uploadManualMods(String(id), staged);
    submitting = false;
    if (!result) {
      error = "Those mods couldn't be uploaded. Try again in a moment.";
      return;
    }
    dispatch("done");
  }
</script>

<svelte:window on:keydown={(e) => e.key === "Escape" && dispatch("close")} />

<div
  class="fixed inset-0 z-[70] flex items-center justify-center p-4"
  style="background: rgba(0,0,0,0.75); backdrop-filter: blur(4px);"
  role="presentation"
  on:click|self={() => dispatch("close")}
>
  <div
    class="bg-base-100 border border-base-300/40 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
  >
    <div
      class="flex items-start justify-between gap-4 px-5 py-4 border-b border-base-300/50"
    >
      <div>
        <h2 class="text-base font-bold flex items-center gap-2">
          <AlertTriangle size={17} class="text-warning shrink-0" />
          Some mods have to be downloaded by hand
        </h2>
        <p class="text-xs text-base-content/60 mt-1 max-w-lg">
          The authors of {mods.length}
          {mods.length === 1 ? "mod" : "mods"} in this modpack don't allow other sites
          to download them, so we can't fetch them for you. Grab them from CurseForge
          below and drop them in. Your server will start as soon as you're done.
        </p>
      </div>
      <button
        class="btn btn-ghost btn-xs btn-circle shrink-0"
        on:click={() => dispatch("close")}
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>

    <div class="overflow-y-auto px-5 py-4 flex-1">
      <label
        class="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 cursor-pointer transition-colors {dragging
          ? 'border-primary bg-primary/5'
          : 'border-base-300/60 hover:border-base-300'}"
        on:dragover|preventDefault={() => (dragging = true)}
        on:dragleave={() => (dragging = false)}
        on:drop={onDrop}
      >
        <UploadCloud size={22} class="text-base-content/40" />
        <span class="text-sm text-base-content/70"
          >Drop the jars here, or click to pick them</span
        >
        <input
          type="file"
          accept=".jar"
          multiple
          class="hidden"
          on:change={(e) => addFiles(e.currentTarget.files)}
        />
      </label>

      {#if staged.length > 0}
        <div class="mt-3 flex flex-wrap gap-1.5">
          {#each staged as file (file.name)}
            <button
              class="badge badge-sm gap-1 {matchedFiles.has(file)
                ? 'badge-success'
                : 'badge-ghost'}"
              on:click={() => removeFile(file)}
              title="Remove"
            >
              {file.name}
              <X size={11} />
            </button>
          {/each}
        </div>
      {/if}

      {#if unmatched.length > 0}
        <p class="mt-2 text-xs text-warning flex items-start gap-1.5">
          <AlertTriangle size={13} class="shrink-0 mt-0.5" />
          <span>
            {unmatched.length}
            {unmatched.length === 1 ? "file doesn't" : "files don't"} match any mod
            on this list. They'll still be installed, but check you downloaded the
            right version.
          </span>
        </p>
      {/if}

      {#if error}
        <p class="mt-2 text-xs text-error">{error}</p>
      {/if}

      <ul class="mt-4 flex flex-col gap-2">
        {#each mods as mod (mod.projectId + "-" + mod.fileId)}
          {@const match = matchFor(mod, staged)}
          <li
            class="flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors {match
              ? 'border-success/40 bg-success/5'
              : 'border-base-300/50'}"
          >
            {#if mod.logoUrl}
              <img
                src={mod.logoUrl}
                alt=""
                class="w-9 h-9 rounded-lg shrink-0 object-cover"
              />
            {:else}
              <div class="w-9 h-9 rounded-lg shrink-0 bg-base-300/50"></div>
            {/if}

            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold truncate">{mod.name}</p>
              <p class="text-xs text-base-content/50 truncate">
                {mod.fileName || "Project " + mod.projectId}
              </p>
            </div>

            {#if match}
              <span
                class="text-xs text-success flex items-center gap-1 shrink-0 font-medium"
              >
                <Check size={14} /> Ready
              </span>
            {:else if mod.downloadUrl}
              <a
                href={mod.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="btn btn-xs btn-primary gap-1 shrink-0"
              >
                <Download size={13} /> Download
              </a>
            {:else}
              <span class="text-xs text-base-content/40 shrink-0"
                >No link available</span
              >
            {/if}
          </li>
        {/each}
      </ul>
    </div>

    <div
      class="flex items-center justify-between gap-3 px-5 py-3 border-t border-base-300/50"
    >
      <p class="text-xs text-base-content/50">
        {#if outstanding.length === 0}
          All {mods.length} accounted for.
        {:else}
          {outstanding.length} still missing.
        {/if}
      </p>
      <div class="flex items-center gap-2">
        <button class="btn btn-ghost btn-sm" on:click={() => dispatch("close")}>
          Later
        </button>
        <button class="btn btn-primary btn-sm gap-2" disabled={submitting} on:click={done}>
          {#if submitting}
            <Loader size={14} class="animate-spin" />
            Uploading…
          {:else}
            Done, start server
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>
