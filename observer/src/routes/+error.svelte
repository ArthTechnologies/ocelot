<script lang="ts">
    import SignedOutNav from "$lib/components/layout/SignedOutNav.svelte";
    import { page } from "$app/stores";

    // This page used to read "404 Not Found" for every error, so a component
    // that threw at render time looked like a missing route. Report what
    // actually happened instead.
    $: status = $page.status;
    $: isMissing = status === 404;
    $: message = $page.error?.message;
    // Supplied by the handleError hooks (see hooks.server.ts / hooks.client.ts)
    // so this works in production builds too, not just dev.
    $: stack = $page.error?.stack;

    let showStack = false;

    function copyStack() {
      navigator.clipboard?.writeText(`${status} ${message}\n\n${stack ?? ""}`);
    }
</script>

<div>
  <SignedOutNav />
  <slot />
  <div class="hero min-h-screen">
    <div class="hero-content text-center">
      <div class="max-w-md">
        {#if isMissing}
          <h1 class="text-5xl font-bold">404 Not Found</h1>
          <p class="py-6">
            This page doesn't exist! If you think this is an error, open an issue
            at <a
              href="https://codeberg.org/diamonc/observer/issues/new"
              class="link link-primary">codeberg.</a
            >
          </p>
        {:else}
          <h1 class="text-5xl font-bold">Something went wrong</h1>
          <p class="pt-6 pb-2">
            This page failed to load{status ? ` (error ${status})` : ""}.
          </p>
          {#if message}
            <p class="pb-4 text-sm opacity-70 break-words">{message}</p>
          {:else}
            <p class="pb-4 text-sm opacity-70">
              Check the browser console and the server terminal for details.
            </p>
          {/if}

          {#if stack}
            <div class="pb-6 flex flex-col items-center gap-2">
              <div class="flex gap-2">
                <button
                  class="btn btn-xs btn-neutral"
                  on:click={() => (showStack = !showStack)}
                >
                  {showStack ? "Hide" : "Show"} details
                </button>
                <button class="btn btn-xs btn-neutral" on:click={copyStack}>
                  Copy
                </button>
              </div>
              {#if showStack}
                <pre
                  class="text-left text-xs bg-base-300 rounded-lg p-3 max-h-64 overflow-auto w-full whitespace-pre-wrap break-words">{stack}</pre>
              {/if}
            </div>
          {/if}
        {/if}
        <button class="btn btn-primary"
          ><a href="/">Go back to Servers</a></button
        >
      </div>
    </div>
  </div>

</div>
