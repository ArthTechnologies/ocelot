<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from "svelte";
  import { fly } from "svelte/transition";
  import { CheckCircle2, Undo2, X } from "lucide-svelte";

  export let name = "";
  export let destination = "/";

  const dispatch = createEventDispatcher();
  let timer: ReturnType<typeof setTimeout>;

  // Long enough to actually reach for undo, short enough not to linger.
  onMount(() => {
    timer = setTimeout(() => dispatch("dismiss"), 8000);
  });

  onDestroy(() => clearTimeout(timer));
</script>

<div
  transition:fly={{ y: 16, duration: 200 }}
  class="fixed bottom-4 right-4 z-[1000] max-w-[calc(100vw-2rem)] flex items-center gap-3 bg-neutral bg-opacity-95 backdrop-blur rounded-xl shadow-xl px-4 py-3"
  role="status"
>
  <CheckCircle2 class="w-5 h-5 shrink-0 text-success" />
  <p class="text-sm min-w-0">
    Moved <b class="font-semibold">{name}</b> to
    <code class="bg-base-300 px-1 rounded">{destination}</code>
  </p>
  <button class="btn btn-xs btn-ghost gap-1 shrink-0" on:click={() => dispatch("undo")}>
    <Undo2 class="w-3.5 h-3.5" />
    Undo
  </button>
  <button
    class="btn btn-xs btn-circle btn-ghost shrink-0"
    aria-label="Dismiss"
    on:click={() => dispatch("dismiss")}
  >
    <X class="w-3.5 h-3.5" />
  </button>
</div>
