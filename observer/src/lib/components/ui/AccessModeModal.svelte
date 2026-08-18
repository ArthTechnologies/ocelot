<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { setAccessMode } from "$lib/scripts/req";
  import {
    X,
    ShieldCheck,
    Globe,
    Check,
    Loader,
    AlertTriangle,
    Users,
  } from "lucide-svelte";

  export let id: string;
  export let mode: "whitelist" | "blacklist" = "blacklist";
  export let running = false;
  export let whitelistCount = 0;

  const dispatch = createEventDispatcher();

  // The modal is a *choice*, not a live toggle — picking a card previews it and
  // the Apply button commits, so nobody locks their friends out of a running
  // server with one stray click.
  let choice: "whitelist" | "blacklist" = mode;
  let saving = false;

  $: changed = choice !== mode;

  async function apply() {
    if (!changed || saving) return;
    saving = true;
    const result = await setAccessMode(id, choice);
    saving = false;
    if (result) dispatch("changed", choice);
  }

  const options = [
    {
      key: "blacklist" as const,
      title: "Whitelist Off",
      tagline: "Anyone can join, except the people you ban.",
      icon: Globe,
      // Tailwind only ships classes it can see as literal strings, so the
      // accent colours are spelled out per option rather than interpolated.
      ring: "border-base-content/60 bg-base-content/5",
      chip: "bg-base-content/10 text-base-content/85",
      tick: "text-base-content/85",
      points: [
        "Your server is open to every player who has the address.",
        "You remove troublemakers after the fact, by kicking or banning them.",
        "Best for public servers, or a server you're still handing the address out for.",
      ],
    },
    {
      key: "whitelist" as const,
      title: "Whitelist On",
      tagline: "Nobody can join, except the people you add.",
      icon: ShieldCheck,
      ring: "border-success bg-success/5",
      chip: "bg-success/15 text-success",
      tick: "text-success",
      points: [
        "Only players on your whitelist can connect. Everyone else is turned away.",
        "You add people ahead of time, by name — they don't need to have joined before.",
        "Best for a server for friends, or one you'd rather nobody stumbled into.",
      ],
    },
  ];
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
        <h2 class="text-base font-bold font-ubuntu flex items-center gap-2">
          <Users size={17} class="text-primary shrink-0" />
          Who can join this server?
        </h2>
        <p class="text-xs text-base-content/60 mt-1 max-w-lg">
          Every Minecraft server works one of two ways. Pick the one that fits
          how you're running yours — you can switch back at any time.
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

    <div class="overflow-y-auto px-5 py-4 flex-1 flex flex-col gap-3">
      {#each options as option (option.key)}
        <button
          class="text-left rounded-xl border-2 p-4 transition-all {choice ===
          option.key
            ? option.ring
            : 'border-base-300/50 hover:border-base-300 bg-base-200/30'}"
          on:click={() => (choice = option.key)}
        >
          <div class="flex items-start gap-3">
            <div
              class="rounded-lg p-2 shrink-0 {choice === option.key
                ? option.chip
                : 'bg-base-300/50 text-base-content/40'}"
            >
              <svelte:component this={option.icon} size={20} />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-bold font-ubuntu text-sm">{option.title}</span>
                {#if mode === option.key}
                  <span class="badge badge-xs badge-ghost">Current</span>
                {/if}
                {#if choice === option.key}
                  <Check size={14} class="{option.tick} ml-auto shrink-0" />
                {/if}
              </div>
              <p class="text-xs text-base-content/70 mt-0.5">{option.tagline}</p>
              <ul class="mt-2 flex flex-col gap-1">
                {#each option.points as point}
                  <li
                    class="text-[11px] leading-relaxed text-base-content/55 flex gap-1.5"
                  >
                    <span class="text-base-content/30">&bull;</span>
                    <span>{point}</span>
                  </li>
                {/each}
              </ul>
            </div>
          </div>
        </button>
      {/each}

      <!-- The two directions of this switch have very different consequences,
           so the warning is specific to the one actually being made rather
           than a generic "are you sure". -->
      {#if changed && choice === "whitelist"}
        <div
          class="rounded-xl bg-warning/10 border border-warning/25 px-3 py-2.5 flex gap-2"
        >
          <AlertTriangle size={14} class="text-warning shrink-0 mt-0.5" />
          <p class="text-[11px] leading-relaxed text-base-content/75">
            {#if whitelistCount === 0}
              Your whitelist is empty. Turning this on will disconnect everyone
              who's playing and stop anyone from joining until you add them.
            {:else}
              Anyone online who isn't one of the {whitelistCount} whitelisted {whitelistCount ===
              1
                ? "player"
                : "players"} will be disconnected.
            {/if}
          </p>
        </div>
      {/if}

      {#if changed && choice === "blacklist"}
        <div
          class="rounded-xl bg-info/10 border border-info/25 px-3 py-2.5 flex gap-2"
        >
          <Globe size={14} class="text-info shrink-0 mt-0.5" />
          <p class="text-[11px] leading-relaxed text-base-content/75">
            Your server becomes open to anyone with the address. Your whitelist
            is kept, just ignored, so you can switch back without redoing it.
            Banned players stay banned.
          </p>
        </div>
      {/if}

      {#if changed && !running}
        <p class="text-[11px] text-base-content/50 flex gap-1.5 px-1">
          <span class="text-base-content/30">&bull;</span>
          <span>Your server is offline, so this takes effect the next time it starts.</span>
        </p>
      {/if}
    </div>

    <div
      class="flex items-center justify-end gap-2 px-5 py-3 border-t border-base-300/50 bg-base-200/30"
    >
      <button class="btn btn-ghost btn-sm" on:click={() => dispatch("close")}>
        Cancel
      </button>
      <button
        class="btn btn-primary btn-sm gap-2"
        disabled={!changed || saving}
        on:click={apply}
      >
        {#if saving}
          <Loader size={14} class="animate-spin" />
        {/if}
        {changed
          ? choice === "whitelist"
            ? "Turn the whitelist on"
            : "Turn the whitelist off"
          : "No changes"}
      </button>
    </div>
  </div>
</div>
