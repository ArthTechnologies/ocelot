<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import {
    kickPlayer,
    banPlayer,
    unbanPlayer,
    removeFromWhitelist,
  } from "$lib/scripts/req";
  import { X, LogOut, Ban, UserMinus, UserCheck, Loader } from "lucide-svelte";

  export let id: string;
  export let action: "kick" | "ban" | "unban" | "unwhitelist";
  // { name, displayName, uuid, bedrock, online }
  export let player: any;
  export let running = false;

  const dispatch = createEventDispatcher();

  let reason = "";
  let working = false;

  // Reasons are shown to the player on their own disconnect screen, which is
  // the whole point of collecting one — so only the two actions that actually
  // disconnect somebody ask for one.
  const copy = {
    kick: {
      icon: LogOut,
      accent: "text-warning",
      title: "Kick this player?",
      body: "They'll be disconnected right away, but nothing stops them joining straight back. Use a ban if you want them gone for good.",
      confirm: "Kick",
      button: "btn-warning",
      wantsReason: true,
      placeholder: "Stop breaking the spawn build",
    },
    ban: {
      icon: Ban,
      accent: "text-error",
      title: "Ban this player?",
      body: "They'll be disconnected and won't be able to rejoin until you unban them.",
      confirm: "Ban",
      button: "btn-error",
      wantsReason: true,
      placeholder: "Griefing",
    },
    unban: {
      icon: UserCheck,
      accent: "text-success",
      title: "Unban this player?",
      body: "They'll be able to join again the next time they try.",
      confirm: "Unban",
      button: "btn-success",
      wantsReason: false,
      placeholder: "",
    },
    unwhitelist: {
      icon: UserMinus,
      accent: "text-warning",
      title: "Remove from the whitelist?",
      body: "They won't be able to join again unless you add them back. If they're online right now, they'll be disconnected.",
      confirm: "Remove",
      button: "btn-warning",
      wantsReason: false,
      placeholder: "",
    },
  };

  $: current = copy[action];
  // A kick is an instruction to a live process — there's no file to record it
  // in — so it's the one action that simply can't happen on a stopped server.
  $: blocked = action === "kick" && !running;

  async function confirm() {
    if (working || blocked) return;
    working = true;
    let result: any = null;
    if (action === "kick") {
      result = await kickPlayer(id, player.name, reason);
    } else if (action === "ban") {
      result = await banPlayer(id, player.name, player.uuid, reason);
    } else if (action === "unban") {
      result = await unbanPlayer(id, player.name, player.uuid);
    } else if (action === "unwhitelist") {
      result = await removeFromWhitelist(id, player.name, player.uuid);
    }
    working = false;
    if (result) dispatch("done", action);
  }
</script>

<svelte:window on:keydown={(e) => e.key === "Escape" && dispatch("close")} />

<div
  class="fixed inset-0 z-[75] flex items-center justify-center p-4"
  style="background: rgba(0,0,0,0.75); backdrop-filter: blur(4px);"
  role="presentation"
  on:click|self={() => dispatch("close")}
>
  <div
    class="bg-base-100 border border-base-300/40 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
  >
    <div
      class="flex items-start justify-between gap-4 px-5 py-4 border-b border-base-300/50"
    >
      <h2 class="text-base font-bold font-ubuntu flex items-center gap-2">
        <svelte:component
          this={current.icon}
          size={17}
          class="{current.accent} shrink-0"
        />
        {current.title}
      </h2>
      <button
        class="btn btn-ghost btn-xs btn-circle shrink-0"
        on:click={() => dispatch("close")}
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>

    <div class="px-5 py-4 flex flex-col gap-3">
      <div
        class="flex items-center gap-3 rounded-xl bg-base-200/50 px-3 py-2.5 border border-base-300/40"
      >
        <div class="relative shrink-0">
          <img
            src={`https://mc-heads.net/avatar/${player.uuid || player.name}`}
            alt=""
            class="w-9 h-9 rounded-lg"
          />
          {#if player.bedrock}
            <img
              class="w-3.5 h-3.5 rounded absolute -bottom-1 -right-1 shadow-lg"
              src="/images/bedrock.webp"
              alt="Bedrock"
            />
          {/if}
        </div>
        <div class="min-w-0">
          <p class="font-mono text-sm truncate">
            {player.displayName || player.name}
          </p>
          <p class="text-[11px] text-base-content/45">
            {player.bedrock ? "Bedrock Edition" : "Java Edition"}
            {#if player.online}&middot; Online now{/if}
          </p>
        </div>
      </div>

      <p class="text-xs text-base-content/65 leading-relaxed">{current.body}</p>

      {#if current.wantsReason}
        <label class="flex flex-col gap-1.5">
          <span
            class="text-[11px] font-semibold text-base-content/55 uppercase tracking-wide"
          >
            Reason
            <span class="font-normal normal-case"
              >(shown to them on their screen)</span
            >
          </span>
          <input
            type="text"
            bind:value={reason}
            maxlength="100"
            placeholder={current.placeholder}
            class="input input-sm input-bordered bg-base-200/50 text-sm w-full"
          />
        </label>
      {/if}

      {#if blocked}
        <p class="text-xs text-warning">
          Your server is offline, so there's nobody to kick. Start it first, or
          ban them instead — that works either way.
        </p>
      {:else if action === "ban" && !running}
        <p class="text-[11px] text-base-content/50">
          Your server is offline, so the ban is written straight to its ban list
          and applies the next time it starts.
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
        class="btn btn-sm gap-2 {current.button}"
        disabled={working || blocked}
        on:click={confirm}
      >
        {#if working}
          <Loader size={14} class="animate-spin" />
        {/if}
        {current.confirm}
      </button>
    </div>
  </div>
</div>
