<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy } from "svelte";
  import { apiurl, getAccess, addToWhitelist } from "$lib/scripts/req";
  import AccessModeModal from "$lib/components/ui/AccessModeModal.svelte";
  import PlayerActionModal from "$lib/components/ui/PlayerActionModal.svelte";
  import {
    ShieldCheck,
    Globe,
    LogOut,
    Ban,
    Hammer,
    UserMinus,
    UserPlus,
    Loader,
    Settings2,
    Check,
    X,
  } from "lucide-svelte";

  export let id: string | number;

  let playersOnline: any[] = [];
  let playersOffline: any[] = [];
  let loadingStates: Record<string, boolean> = {};
  let headCache = new Set<string>(); // Tracks cached player heads

  // Everything about who may join comes from /access, which reads the server's
  // own files — so a whitelist change made in the console shows up here too.
  let access: any = null;
  let addingUuid = "";
  let modeModalOpen = false;
  let pending: { action: any; player: any } | null = null;

  let addName = "";
  let addPlatform: "java" | "bedrock" = "java";
  let adding = false;

  $: mode = access?.mode ?? "blacklist";
  $: running = access?.running ?? false;
  $: bedrockPrefix = access?.bedrock?.prefix ?? ".";
  $: bedrockEnabled = access?.bedrock?.enabled ?? false;
  $: canAddBedrock = access?.bedrock?.floodgate ?? false;
  $: whitelist = access?.whitelist ?? [];
  $: banned = access?.banned ?? [];
  $: bannedUuids = new Set(banned.map((b: any) => b.uuid));

  // A Bedrock player reaches a Java server through Floodgate, which gives them
  // a prefixed name and a synthetic UUID that starts with a run of zeroes.
  // Either signal on its own is enough — a whitelist entry can carry one
  // without the other.
  function isBedrock(player: any) {
    if (typeof player?.uuid === "string" && player.uuid.startsWith("00000000-0000-0000-"))
      return true;
    return Boolean(bedrockPrefix) && String(player?.name || "").startsWith(bedrockPrefix);
  }

  // The prefix is plumbing the player never sees on their own screen, so it's
  // stripped everywhere the name is shown — but kept on `name`, which is what
  // every command and file entry has to use.
  function displayName(player: any) {
    const name = String(player?.name || "");
    if (bedrockPrefix && name.startsWith(bedrockPrefix)) return name.slice(bedrockPrefix.length);
    return name;
  }

  function decorate(player: any, online = false) {
    return {
      ...player,
      online,
      bedrock: isBedrock(player),
      displayName: displayName(player),
    };
  }

  // In whitelist mode the whitelist is the roster, so people who were added
  // but have never actually connected belong on the list — otherwise adding
  // someone appears to do nothing until they log in for the first time.
  $: neverJoined =
    mode === "whitelist"
      ? whitelist
          .filter(
            (entry: any) =>
              !playersOnline.some((p: any) => p.uuid === entry.uuid) &&
              !playersOffline.some((p: any) => p.uuid === entry.uuid)
          )
          .map((entry: any) => decorate(entry))
      : [];

  // Banned players get their own section below, so they don't also sit in the
  // main list looking like ordinary offline players.
  // While the whitelist is on, someone who isn't on it can't play — so they
  // belong in the collapsed "attempted joins" list below rather than sitting
  // in the roster looking like a regular member of the server.
  $: offlineRows = playersOffline
    .filter((p: any) => !bannedUuids.has(p.uuid))
    .filter((p: any) => mode !== "whitelist" || whitelistedUuids.has(p.uuid))
    .map((p: any) => decorate(p));
  $: onlineRows = playersOnline.map((p: any) => decorate(p, true));
  $: bannedRows = banned.map((b: any) => decorate(b));
  $: whitelistedUuids = new Set(whitelist.map((w: any) => w.uuid));
  // The log records names, not uuids, so a uuid-only check would keep showing
  // someone under "attempted joins" after you'd just let them in.
  $: whitelistedNames = new Set(
    whitelist.map((w: any) => String(w.name || "").toLowerCase())
  );

  // Two different kinds of "can't get in", kept in one section but labelled
  // apart on each row: what the server's log actually recorded turning away,
  // and anyone usercache knows who simply isn't on the list.
  $: attemptedRows =
    mode === "whitelist"
      ? (() => {
          const rows: any[] = [];
          const seen = new Set<string>();
          for (const entry of access?.attemptedJoins ?? []) {
            const key = String(entry.name || "").toLowerCase();
            if (whitelistedNames.has(key)) continue;
            if (entry.uuid && whitelistedUuids.has(entry.uuid)) continue;
            seen.add(key);
            rows.push(entry);
          }
          for (const player of playersOffline) {
            const key = String(player.name || "").toLowerCase();
            if (whitelistedUuids.has(player.uuid) || whitelistedNames.has(key)) continue;
            if (bannedUuids.has(player.uuid)) continue;
            if (seen.has(key)) continue;
            rows.push({ ...decorate(player), attempts: 0 });
          }
          return rows;
        })()
      : [];

  // Dismissing an attempt just clears it from view for this session - there's
  // no backend concept of "ignored", the log line that produced it is still
  // there on the next poll.
  let dismissedAttempts = new Set<string>();
  $: visibleAttempted = attemptedRows.filter(
    (p: any) => !dismissedAttempts.has(p.uuid || p.name)
  );
  function dismissAttempt(player: any) {
    dismissedAttempts.add(player.uuid || player.name);
    dismissedAttempts = dismissedAttempts;
  }

  // The alternating stripe reads as a list even before real rows exist - pad
  // the box out to a minimum row count with blank filler bars rather than
  // letting it collapse to nothing.
  const MIN_ROWS = 6;
  $: realRowCount =
    onlineRows.length + offlineRows.length + neverJoined.length + visibleAttempted.length;
  $: fillerRows = Math.max(0, MIN_ROWS - realRowCount);
  // Always single-column - splitting into two ever made the list harder to
  // scan than it helped.
  const columns = 1;

  let playerTimer: any;
  let accessTimer: any;
  if (browser) {
    fetchPlayers();
    refreshAccess();
    playerTimer = setInterval(fetchPlayers, 5000);
    // Access state changes only when somebody acts on it, so it's polled far
    // more slowly than the online list — every action below refreshes it
    // immediately anyway.
    accessTimer = setInterval(refreshAccess, 15000);
  }
  onDestroy(() => {
    clearInterval(playerTimer);
    clearInterval(accessTimer);
  });

  async function refreshAccess() {
    const data = await getAccess(String(id));
    if (data) access = data;
  }

  async function fetchPlayers() {
    try {
      const response = await fetch(apiurl + "server/" + id + "/players", {
        method: "GET",
        headers: {
          token: localStorage.getItem("token"),
          username: localStorage.getItem("accountEmail"),
        } as HeadersInit,
      });

      const data = await response.json();
      playersOnline = data.playersOnline || [];

      // Initialize only new players not in cache
      playersOnline.forEach((player: any) => {
        if (!(player.uuid in loadingStates)) {
          loadingStates[player.uuid] = !headCache.has(player.uuid);
        }
      });

      // Build offline players list - check against the new off array, not the old playersOffline
      let off: any[] = [];
      for (let i in data.allPlayers) {
        const player = data.allPlayers[i];
        // if the player is not online, add them to offline list
        if (!playersOnline.some((p: any) => p.uuid === player.uuid)) {
          // Check if player is already in the new off array (not the old playersOffline)
          if (!off.some((p: any) => p.uuid === player.uuid)) {
            off.push(player);
          }
        }
      }

      playersOffline = off;

      // Initialize loading states for offline players
      playersOffline.forEach((player: any) => {
        if (!(player.uuid in loadingStates)) {
          loadingStates[player.uuid] = !headCache.has(player.uuid);
        }
      });
    } catch (error) {
      console.error("Error fetching players:", error);
    }
  }

  function handleImageLoad(uuid: string) {
    headCache.add(uuid); // Add to cache
    loadingStates[uuid] = false;
    loadingStates = loadingStates; // Trigger reactivity
  }

  function act(action: any, player: any) {
    pending = { action, player };
  }

  async function actionDone() {
    // Removing someone from the whitelist puts them right back in
    // playersOffline-and-not-whitelisted, which is also how the attempted-
    // joins list is built - without this they'd immediately reappear there
    // asking to be added back.
    if (pending?.action === "unwhitelist" && pending.player) {
      dismissAttempt(pending.player);
    }
    pending = null;
    // The console command the backend issues is asynchronous — the server
    // needs a beat to write the list back out before a re-read sees it.
    setTimeout(refreshAccess, 600);
    await refreshAccess();
    fetchPlayers();
  }

  async function submitAdd() {
    const name = addName.trim();
    if (!name || adding) return;
    adding = true;
    const result = await addToWhitelist(
      String(id),
      name,
      canAddBedrock ? addPlatform : "java"
    );
    adding = false;
    if (result) {
      addName = "";
      refreshAccess();
    }
  }

  // The obvious thing to do about someone standing at the door. Passes the
  // uuid when the panel already knows it, which skips the name lookup and
  // works even when Mojang is unreachable.
  async function letThemIn(player: any) {
    if (addingUuid) return;
    addingUuid = player.uuid || player.name;
    const result = await addToWhitelist(
      String(id),
      player.name,
      player.bedrock ? "bedrock" : "auto",
      player.uuid || ""
    );
    addingUuid = "";
    if (result) refreshAccess();
  }

  // Minecraft stores ban timestamps as "yyyy-MM-dd HH:mm:ss Z", which Date
  // won't parse directly — the space before the offset has to go.
  function banDate(raw: any) {
    if (!raw) return "";
    const parsed = new Date(String(raw).replace(/ ([+-]\d{4})$/, "$1"));
    if (isNaN(parsed.getTime())) return "";
    return parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
</script>

<div class="player-list-root bg-base-300 w-full shadow-xl rounded-xl px-4 py-3 neutralGradientStroke flex flex-col">
  <div class="flex items-center justify-between gap-2 mb-3">
    <p class="font-bold font-ubuntu text-gray-100">Players</p>

    <!-- The mode badge is the button. Making the status itself clickable keeps
         the header from growing a second control nobody would look for. -->
    {#if access}
      <button
        class="group flex items-center gap-1.5 rounded-lg pl-2 pr-1.5 py-1 text-[11px] font-semibold transition-colors border {mode ===
        'whitelist'
          ? 'bg-success/10 border-success/30 text-success hover:bg-success/20'
          : 'bg-base-content/5 border-base-content/60 text-base-content/85 hover:bg-base-content/10'}"
        on:click={() => (modeModalOpen = true)}
        title="Change who can join this server"
      >
        {#if mode === "whitelist"}
          <ShieldCheck size={13} />
          Whitelist On
        {:else}
          <Globe size={13} />
          Whitelist Off
        {/if}
        <Settings2
          size={12}
          class="opacity-50 group-hover:opacity-100 transition-opacity"
        />
      </button>
    {/if}
  </div>

  <ul class="player-list-scroll grid grid-cols-1 content-start bg-base-100 rounded-t-lg overflow-hidden">
    {#each onlineRows as player, i (player.uuid)}
      <li
        class="group text-gray-200 {(Math.floor(i / columns) + (i % columns)) % 2 === 0 ? 'bg-base-100' : 'bg-base-200'} w-full h-8 shrink-0 px-2.5 font-mono text-sm flex items-center gap-2"
      >
        <div class="relative shrink-0">
          {#if loadingStates[player.uuid]}
            <div class="w-5 h-5 bg-gray-600 rounded animate-pulse" />
          {/if}
          <img
            src={`https://mc-heads.net/avatar/${player.uuid}`}
            alt={player.displayName + "'s head"}
            class={`w-5 h-5 rounded ${loadingStates[player.uuid] ? "hidden" : "block"}`}
            on:load={() => handleImageLoad(player.uuid)}
          />
          {#if player.bedrock}
            <img
              class="w-3 h-3 rounded absolute -bottom-1 -right-1 shadow-xl/30"
              src="/images/bedrock.webp"
              alt="Bedrock"
            />
          {/if}
        </div>
        <span class="truncate">{player.displayName}</span>
        <span class="ml-auto flex items-center gap-1 shrink-0">
          <span
            class="w-1.5 h-1.5 rounded-full bg-success mr-1 group-hover:hidden"
            title="Online"
          />
          <button
            class="hidden group-hover:flex btn btn-ghost btn-xs px-1.5 h-6 min-h-0 text-warning"
            on:click={() => act("kick", player)}
            title="Kick"
          >
            <LogOut size={13} />
          </button>
          {#if mode === "whitelist"}
            <button
              class="hidden group-hover:flex btn btn-ghost btn-xs px-1.5 h-6 min-h-0 text-error"
              on:click={() => act("unwhitelist", player)}
              title="Remove from whitelist"
              disabled={!whitelistedUuids.has(player.uuid)}
            >
              <UserMinus size={13} />
            </button>
          {:else}
            <button
              class="hidden group-hover:flex btn btn-ghost btn-xs px-1.5 h-6 min-h-0 text-error"
              on:click={() => act("ban", player)}
              title="Ban"
            >
              <Ban size={13} />
            </button>
          {/if}
        </span>
      </li>
    {/each}

    {#each offlineRows as player, i (player.uuid)}
      <li
        class="group text-gray-400 {(Math.floor(i / columns) + (i % columns)) % 2 === 0 ? 'bg-base-100' : 'bg-base-200'} w-full h-8 shrink-0 px-2.5 font-mono text-sm flex items-center gap-2"
      >
        <div class="relative shrink-0">
          {#if loadingStates[player.uuid]}
            <div class="w-5 h-5 bg-gray-600 rounded animate-pulse" />
          {/if}
          <img
            src={`https://mc-heads.net/avatar/${player.uuid}`}
            alt={player.displayName + "'s head"}
            class={`w-5 h-5 grayscale opacity-75 rounded ${loadingStates[player.uuid] ? "hidden" : "block"}`}
            on:load={() => handleImageLoad(player.uuid)}
          />
          {#if player.bedrock}
            <img
              class="w-3 h-3 rounded absolute -bottom-1 -right-1 opacity-75"
              src="/images/bedrock.webp"
              alt="Bedrock"
            />
          {/if}
        </div>
        <span class="truncate">{player.displayName}</span>
        <span class="ml-auto flex items-center gap-1 shrink-0">
          {#if mode === "whitelist"}
            <button
              class="hidden group-hover:flex btn btn-ghost btn-xs px-1.5 h-6 min-h-0 text-error"
              on:click={() => act("unwhitelist", player)}
              title="Remove from whitelist"
            >
              <UserMinus size={13} />
            </button>
          {:else}
            <button
              class="hidden group-hover:flex btn btn-ghost btn-xs px-1.5 h-6 min-h-0 text-error"
              on:click={() => act("ban", player)}
              title="Ban"
            >
              <Ban size={13} />
            </button>
          {/if}
        </span>
      </li>
    {/each}

    {#each neverJoined as player, i (player.uuid)}
      <li
        class="group text-gray-400 {(Math.floor(i / columns) + (i % columns)) % 2 === 0 ? 'bg-base-100/60' : 'bg-base-200/60'} w-full h-8 shrink-0 px-2.5 font-mono text-sm flex items-center gap-2 border border-dashed border-base-content/10"
      >
        <div class="relative shrink-0">
          <img
            src={`https://mc-heads.net/avatar/${player.uuid}`}
            alt=""
            class="w-5 h-5 grayscale opacity-50 rounded"
          />
          {#if player.bedrock}
            <img
              class="w-3 h-3 rounded absolute -bottom-1 -right-1 opacity-75"
              src="/images/bedrock.webp"
              alt="Bedrock"
            />
          {/if}
        </div>
        <span class="truncate">{player.displayName}</span>
        <span class="ml-auto flex items-center gap-1 shrink-0">
          <span class="text-[10px] text-base-content/35 font-sans pr-1 group-hover:hidden">
            never joined
          </span>
          <button
            class="hidden group-hover:flex btn btn-ghost btn-xs px-1.5 h-6 min-h-0 text-error"
            on:click={() => act("unwhitelist", player)}
            title="Remove from whitelist"
          >
            <UserMinus size={13} />
          </button>
        </span>
      </li>
    {/each}

    {#each visibleAttempted as player, i (player.uuid || player.name)}
      <li
        class="group text-gray-300 {(Math.floor((onlineRows.length + offlineRows.length + neverJoined.length + i) / columns) + ((onlineRows.length + offlineRows.length + neverJoined.length + i) % columns)) % 2 === 0 ? 'bg-base-100' : 'bg-base-200'} w-full h-8 shrink-0 px-2.5 font-mono text-sm flex items-center gap-2"
      >
        <span class="truncate">
          Add {player.name.length > 10 ? player.name.slice(0, 10) : player.name}?
        </span>
        <span class="ml-auto flex items-center gap-1 shrink-0">
          <button
            class="btn btn-ghost btn-xs h-6 min-h-0 px-1.5 text-success"
            disabled={addingUuid === (player.uuid || player.name)}
            on:click={() => letThemIn(player)}
            title="Allow"
          >
            {#if addingUuid === (player.uuid || player.name)}
              <Loader size={13} class="animate-spin" />
            {:else}
              <Check size={13} />
            {/if}
          </button>
          <button
            class="btn btn-ghost btn-xs h-6 min-h-0 px-1.5 text-error"
            on:click={() => dismissAttempt(player)}
            title="Dismiss"
          >
            <X size={13} />
          </button>
        </span>
      </li>
    {/each}

    {#each Array(fillerRows) as _, j}
      <li
        class="{(Math.floor((realRowCount + j) / columns) + ((realRowCount + j) % columns)) % 2 === 0 ? 'bg-base-100' : 'bg-base-200'} w-full h-8 shrink-0"
        aria-hidden="true"
      ></li>
    {/each}
  </ul>

  {#if mode === "whitelist"}
    <!-- Same panel format as the Banned trigger in the other mode: flush
         against the divider, capped at the bottom, buttons open modals
         instead of taking up permanent inline space. -->
    <div class="border-t border-base-content/10 bg-base-100 rounded-b-lg py-1 flex items-center justify-center gap-2">
      <button
        class="btn btn-ghost btn-xs gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
        on:click={() => document.getElementById("addPlayerModal").showModal()}
      >
        <UserPlus size={12} class="mr-1.5" />
        Add Player
      </button>
    </div>

    <dialog id="addPlayerModal" class="modal">
      <div class="modal-box">
        <h3 class="text-lg font-bold flex items-center gap-2">
          <UserPlus size={16} />
          Add someone to the whitelist
        </h3>

        {#if bedrockEnabled}
          <div class="flex gap-1 mt-4 mb-2">
            <button
              class="flex-1 text-[11px] font-semibold rounded-lg py-1.5 transition-colors border {addPlatform ===
              'java'
                ? 'bg-primary/15 border-primary/40 text-primary'
                : 'bg-base-100 border-base-content/10 text-base-content/50 hover:border-base-content/25'}"
              on:click={() => (addPlatform = "java")}
            >
              Java Edition
            </button>
            <button
              class="flex-1 text-[11px] font-semibold rounded-lg py-1.5 transition-colors border flex items-center justify-center gap-1.5 {addPlatform ===
              'bedrock'
                ? 'bg-primary/15 border-primary/40 text-primary'
                : 'bg-base-100 border-base-content/10 text-base-content/50 hover:border-base-content/25'} {canAddBedrock
                ? ''
                : 'opacity-40 cursor-not-allowed'}"
              disabled={!canAddBedrock}
              on:click={() => (addPlatform = "bedrock")}
            >
              <img src="/images/bedrock.webp" alt="" class="w-3 h-3 rounded" />
              Bedrock
            </button>
          </div>
        {/if}

        <form class="flex gap-1.5 mt-4" on:submit|preventDefault={submitAdd}>
          <input
            type="text"
            bind:value={addName}
            maxlength="32"
            placeholder={addPlatform === "bedrock" && bedrockEnabled
              ? "Xbox gamertag"
              : "Minecraft username"}
            class="input input-sm input-bordered bg-base-100 font-mono text-sm flex-1 min-w-0"
          />
          <button
            class="btn btn-primary btn-sm px-3"
            disabled={adding || !addName.trim()}
            type="submit"
          >
            {#if adding}
              <Loader size={14} class="animate-spin" />
            {:else}
              <UserPlus size={14} />
            {/if}
          </button>
        </form>

        <p class="text-[10px] text-base-content/40 mt-1.5 leading-relaxed">
          {#if addPlatform === "bedrock" && bedrockEnabled}
            Enter their Xbox gamertag exactly as it appears in game. Spaces become
            underscores, and they need to have joined a Bedrock server at least
            once before their account can be looked up.
          {:else}
            Enter their exact Minecraft username. They don't need to have joined
            this server before.
          {/if}
        </p>

        <div class="modal-action">
          <form method="dialog">
            <button class="btn">Close</button>
          </form>
        </div>
      </div>
    </dialog>
  {:else if bannedRows.length > 0}
    <!-- The list box above only rounds its top corners in this mode so this
         panel sits flush against the divider instead of leaving a gap -
         together they read as one card, capped at the bottom by this panel. -->
    <div class="border-t border-base-content/10 bg-base-100 rounded-b-lg py-1 flex items-center justify-center">
      <button
        class="btn btn-ghost btn-xs gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
        on:click={() => document.getElementById("bannedModal").showModal()}
      >
        <Hammer size={12} class="mr-1.5" />
        Open Ban List
      </button>
    </div>

    <dialog id="bannedModal" class="modal">
      <div class="modal-box">
        <h3 class="text-lg font-bold flex items-center gap-2">
          <Ban size={16} />
          Banned
        </h3>
        <ul class="flex flex-col gap-1.5 mt-4">
          {#each bannedRows as player (player.uuid)}
            <li
              class="group bg-base-100 w-full p-2 px-2.5 rounded-xl flex items-center gap-2"
            >
              <div class="relative shrink-0">
                <img
                  src={`https://mc-heads.net/avatar/${player.uuid}`}
                  alt=""
                  class="w-6 h-6 rounded grayscale opacity-60"
                />
                {#if player.bedrock}
                  <img
                    class="w-3 h-3 rounded absolute -bottom-1 -right-1 opacity-75"
                    src="/images/bedrock.webp"
                    alt="Bedrock"
                  />
                {/if}
              </div>
              <div class="min-w-0 flex-1">
                <p class="font-mono text-sm text-gray-400 truncate">
                  {player.displayName}
                </p>
                {#if player.reason || player.created}
                  <p class="text-[10px] text-base-content/35 truncate">
                    {player.reason || "No reason given"}
                    {#if banDate(player.created)}
                      &middot; {banDate(player.created)}
                    {/if}
                  </p>
                {/if}
              </div>
              <button
                class="btn btn-ghost btn-xs h-6 min-h-0 px-2 text-success shrink-0"
                on:click={() => act("unban", player)}
              >
                Unban
              </button>
            </li>
          {/each}
        </ul>
        <div class="modal-action">
          <form method="dialog">
            <button class="btn">Close</button>
          </form>
        </div>
      </div>
    </dialog>
  {/if}
</div>

<style>
  /* The parent page forces .player-list-root (the last card in the right
     column) to flex:1 on tall screens (see +page.svelte's .right-side-cards
     rule) so it can grow into the leftover vertical space. Without this, that
     extra height just sat blank below the online-players list - this makes
     the list itself the scrollable region that actually claims it, while the
     header and the banned/attempted-joins section below keep their natural
     size. */
  @media (min-height: 700px) and (min-width: 1024px) {
    .player-list-scroll {
      flex: 1 1 0%;
      min-height: 0;
      overflow-y: auto;
    }
  }
</style>

{#if modeModalOpen && access}
  <AccessModeModal
    id={String(id)}
    {mode}
    {running}
    whitelistCount={whitelist.length}
    on:close={() => (modeModalOpen = false)}
    on:changed={() => {
      modeModalOpen = false;
      refreshAccess();
      fetchPlayers();
    }}
  />
{/if}

{#if pending}
  <PlayerActionModal
    id={String(id)}
    action={pending.action}
    player={pending.player}
    {running}
    on:close={() => (pending = null)}
    on:done={actionDone}
  />
{/if}
