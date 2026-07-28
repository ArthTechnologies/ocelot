<script lang="ts">
  import { CornerDownRight, FolderClosed, Search, X } from "lucide-svelte";
  import {
    displayPath,
    fileTree,
    listFolders,
    moveBlockedReason,
    moveTarget,
    parentOf,
    treeRoot,
  } from "$lib/scripts/fileMoves";
  import type { FolderOption } from "$lib/scripts/fileMoves";

  let query = "";
  let selected: string | null = null;

  // Opening the dialog for a different entry starts it clean.
  let openedFor = "";
  $: if ($moveTarget && $moveTarget.path !== openedFor) {
    openedFor = $moveTarget.path;
    query = "";
    selected = null;
  }

  $: folders = listFolders($fileTree, $treeRoot);
  $: currentFolder = $moveTarget ? parentOf($moveTarget.path) : "";

  // Match on the readable path too, so "plug" finds /plugins.
  $: visible = query.trim()
    ? folders.filter((f) =>
        (f.name + " " + displayPath(f.path, $treeRoot))
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      )
    : folders;

  $: canConfirm =
    selected !== null && moveBlockedReason($moveTarget, selected) === null;

  function close() {
    moveTarget.set(null);
  }

  function choose(folder: FolderOption) {
    if (moveBlockedReason($moveTarget, folder.path)) return;
    selected = folder.path;
  }

  function confirm() {
    if (!canConfirm || selected === null || !$moveTarget) return;
    document.dispatchEvent(
      new CustomEvent("moveEntry", {
        detail: { from: $moveTarget.path, to: selected },
      })
    );
    close();
  }

  // Built as a string rather than class: directives because Tailwind variant
  // names contain a colon, which the class: directive syntax can't express.
  function rowClass(blocked: boolean, isSelected: boolean) {
    const base =
      "w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors";
    if (blocked) return base + " opacity-40 cursor-not-allowed";
    if (isSelected) return base + " bg-primary text-primary-content";
    return base + " hover:bg-base-300";
  }
</script>

{#if $moveTarget}
  <div class="modal modal-open" style="margin:0rem;">
    <div class="modal-box bg-opacity-95 backdrop-blur relative max-w-lg">
      <button
        class="btn btn-neutral btn-sm btn-circle absolute right-2 top-2"
        on:click={close}>✕</button
      >

      <h3 class="text-lg font-bold">Move {$moveTarget.name}</h3>
      <p class="text-sm opacity-60 mb-3">
        Currently in <code class="bg-base-300 px-1 rounded"
          >{displayPath(currentFolder, $treeRoot) || "/"}</code
        >
      </p>

      <div class="relative mb-2">
        <div
          class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
        >
          <Search class="h-4 w-4 text-gray-400" />
        </div>
        <input
          type="text"
          bind:value={query}
          placeholder="Search folders…"
          class="input input-bordered input-sm w-full pl-9 pr-9 bg-base-100"
        />
        {#if query}
          <button
            class="absolute inset-y-0 right-0 pr-3 flex items-center"
            on:click={() => (query = "")}
          >
            <X class="h-4 w-4 text-gray-400 hover:text-gray-200" />
          </button>
        {/if}
      </div>

      <div
        class="bg-base-100 rounded-lg max-h-64 overflow-y-auto p-1 mb-3 border border-base-content/10"
      >
        {#each visible as folder (folder.path)}
          {@const reason = moveBlockedReason($moveTarget, folder.path)}
          <button
            class={rowClass(reason !== null, selected === folder.path)}
            style="padding-left: {0.5 + folder.depth * 0.85}rem"
            disabled={reason !== null}
            title={reason || displayPath(folder.path, $treeRoot)}
            on:click={() => choose(folder)}
          >
            <FolderClosed class="shrink-0 w-4 h-4" />
            <span class="truncate">{folder.name}</span>
            {#if reason === "Already in this folder."}
              <span class="ml-auto text-xs opacity-70 shrink-0">current</span>
            {/if}
          </button>
        {:else}
          <p class="text-sm opacity-60 px-2 py-3">No folders match "{query}".</p>
        {/each}
      </div>

      {#if selected}
        <div class="flex items-center gap-2 text-sm mb-3 min-w-0">
          <CornerDownRight class="w-4 h-4 shrink-0 opacity-60" />
          <code class="bg-base-300 px-1 rounded truncate"
            >{displayPath(selected, $treeRoot) === "/"
              ? ""
              : displayPath(selected, $treeRoot)}/{$moveTarget.name}</code
          >
        </div>
      {/if}

      <div class="flex gap-2 items-center">
        <button
          class="btn btn-success btn-sm"
          class:btn-disabled={!canConfirm}
          on:click={confirm}
        >
          Move
        </button>
        <button class="btn btn-ghost btn-sm" on:click={close}>Cancel</button>
      </div>
    </div>
  </div>
{/if}
