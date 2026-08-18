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
    UserMinus,
    UserPlus,
    ChevronRight,
    Loader,
    Settings2,
    DoorClosed,
  } from "lucide-svelte";

  export let id: string | number;

  let playersOnline: any[] = [];
  let playersOffline: any[] = [];
  let loadingStates: Record<string, boolean> = {};
  let headCache = new Set<string>(); // Tracks cached player heads

  // Everything about who may join comes from /access, which reads the server's
  // own files — so a whitelist change made in the console shows up here too.
  let access: any = null;
  let bansOpen = false;
  let attemptsOpen = false;
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

  $: isEmpty =
    onlineRows.length === 0 && offlineRows.length === 0 && neverJoined.length === 0;

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

  // The log prints a time of day on the *server's* clock, which under Docker
  // is usually UTC while the browser is not — so the time is shown exactly as
  // the server wrote it and only the date is reconstructed, by counting back
  // from the log file's mtime. Converting the time would shift every entry by
  // the offset between the two clocks.
  function attemptWhen(entry: any) {
    if (!entry?.lastAttemptTime) return "";
    const anchor = new Date(entry.logUpdated);
    if (isNaN(anchor.getTime())) return entry.lastAttemptTime;
    anchor.setDate(anchor.getDate() - (entry.lastAttemptDaysAgo || 0));
    const day = anchor.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    return day + ", " + entry.lastAttemptTime;
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

<div class="bg-base-300 w-full shadow-xl rounded-xl px-4 py-3 neutralGradientStroke">
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

  <ul class="flex flex-col gap-1.5">
    {#each onlineRows as player (player.uuid)}
      <li
        class="group text-gray-200 bg-base-100 w-full p-2 px-2.5 rounded-xl font-mono text-sm flex items-center gap-2"
      >
        <div class="relative shrink-0">
          {#if loadingStates[player.uuid]}
            <div class="w-6 h-6 bg-gray-600 rounded animate-pulse" />
          {/if}
          <img
            src={`https://mc-heads.net/avatar/${player.uuid}`}
            alt={player.displayName + "'s head"}
            class={`w-6 h-6 rounded ${loadingStates[player.uuid] ? "hidden" : "block"}`}
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

    {#each offlineRows as player (player.uuid)}
      <li
        class="group text-gray-400 bg-base-100 w-full p-2 px-2.5 rounded-xl font-mono text-sm flex items-center gap-2"
      >
        <div class="relative shrink-0">
          {#if loadingStates[player.uuid]}
            <div class="w-6 h-6 bg-gray-600 rounded animate-pulse" />
          {/if}
          <img
            src={`https://mc-heads.net/avatar/${player.uuid}`}
            alt={player.displayName + "'s head"}
            class={`w-6 h-6 grayscale opacity-75 rounded ${loadingStates[player.uuid] ? "hidden" : "block"}`}
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

    {#each neverJoined as player (player.uuid)}
      <li
        class="group text-gray-400 bg-base-100/60 w-full p-2 px-2.5 rounded-xl font-mono text-sm flex items-center gap-2 border border-dashed border-base-content/10"
      >
        <div class="relative shrink-0">
          <img
            src={`https://mc-heads.net/avatar/${player.uuid}`}
            alt=""
            class="w-6 h-6 grayscale opacity-50 rounded"
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

    {#if isEmpty}
      <li
        class="text-gray-400 bg-base-100 w-full p-2 px-2.5 rounded-xl font-mono text-sm flex items-center"
      >
        {mode === "whitelist"
          ? "Nobody is whitelisted yet."
          : "No players have joined yet."}
      </li>
    {/if}
  </ul>

  {#if mode === "whitelist" && attemptedRows.length > 0}
    <!-- The mirror of the banned list in the other mode: collapsed by default,
         because it's something you check when someone says "I can't get in",
         not something you watch. -->
    <div class="mt-3 pt-3 border-t border-base-content/10">
      <button
        class="w-full flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-base-content/45 hover:text-base-content/70 transition-colors"
        on:click={() => (attemptsOpen = !attemptsOpen)}
      >
        <ChevronRight
          size={13}
          class="transition-transform duration-200 {attemptsOpen ? 'rotate-90' : ''}"
        />
        <DoorClosed size={12} />
        Attempted joins
        <span class="badge badge-xs badge-ghost ml-0.5">{attemptedRows.length}</span>
      </button>

      {#if attemptsOpen}
        <ul class="flex flex-col gap-1.5 mt-2">
          {#each attemptedRows as player (player.name)}
            <li
              class="group bg-base-100 w-full p-2 px-2.5 rounded-xl flex items-center gap-2"
            >
              <div class="relative shrink-0">
                <img
                  src={`https://mc-heads.net/avatar/${player.uuid || player.name}`}
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
                  {player.displayName || player.name}
                </p>
                <p class="text-[10px] text-base-content/35 truncate">
                  {#if player.attempts > 0}
                    {player.attempts}
                    {player.attempts === 1 ? "attempt" : "attempts"}
                    {#if attemptWhen(player)}
                      &middot; last {attemptWhen(player)}
                    {/if}
                  {:else}
                    Has played here, but isn't whitelisted
                  {/if}
                </p>
              </div>
              <button
                class="btn btn-ghost btn-xs h-6 min-h-0 px-2 text-success opacity-0 group-hover:opacity-100 transition-opacity shrink-0 gap-1"
                disabled={addingUuid === (player.uuid || player.name)}
                on:click={() => letThemIn(player)}
              >
                {#if addingUuid === (player.uuid || player.name)}
                  <Loader size={12} class="animate-spin" />
                {:else}
                  <UserPlus size={12} />
                {/if}
                Allow
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  {#if mode === "whitelist"}
    <!-- Whitelist mode's job is letting people in, so the add form is the
         permanent fixture at the bottom rather than a collapsed section. -->
    <div class="mt-3 pt-3 border-t border-base-content/10">
      <p
        class="text-[11px] font-semibold uppercase tracking-wide text-base-content/45 mb-2 flex items-center gap-1.5"
      >
        <UserPlus size={12} />
        Add someone to the whitelist
      </p>

      {#if bedrockEnabled}
        <div class="flex gap-1 mb-2">
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

      <form class="flex gap-1.5" on:submit|preventDefault={submitAdd}>
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
    </div>
  {:else if bannedRows.length > 0}
    <!-- Collapsed by default: on a healthy server the ban list is something
         you check occasionally, not something you watch. -->
    <div class="mt-3 pt-3 border-t border-base-content/10">
      <button
        class="w-full flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-base-content/45 hover:text-base-content/70 transition-colors"
        on:click={() => (bansOpen = !bansOpen)}
      >
        <ChevronRight
          size={13}
          class="transition-transform duration-200 {bansOpen ? 'rotate-90' : ''}"
        />
        <Ban size={12} />
        Banned
        <span class="badge badge-xs badge-error badge-outline ml-0.5">
          {bannedRows.length}
        </span>
      </button>

      {#if bansOpen}
        <ul class="flex flex-col gap-1.5 mt-2">
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
                class="btn btn-ghost btn-xs h-6 min-h-0 px-2 text-success opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                on:click={() => act("unban", player)}
              >
                Unban
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

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
