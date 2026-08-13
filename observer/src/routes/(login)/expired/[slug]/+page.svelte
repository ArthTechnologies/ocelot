<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { browser } from "$app/environment";
  import { apiurl } from "$lib/scripts/req";
  import { ArrowLeft, ArrowRight, Check, Loader2, X } from "lucide-svelte";
  import BugResolverModal from "$lib/components/ui/BugResolverModal.svelte";
  import RestoreAccessModal from "$lib/components/ui/RestoreAccessModal.svelte";

  $: serverId = $page.params.slug;

  let subscriptionActive = false;
  let subscriptionLoading = true;
  let lastPaymentDate: number | null = null;
  let showFindSlotModal = false;
  let findSlotLoading = false;
  let findSlotResult: { available: boolean; id: number | null } | null = null;
  let showBugResolver = false;
  let showRestoreModal = false;

  type Blocker = { code: string; message: string };
  type Plan = {
    serverId: string;
    kind: string;
    canRestore: boolean;
    blockers: Blocker[];
    warnings: Blocker[];
    slot?: {
      originalId: string;
      originalState: string;
      originalReason: string | null;
      targetId: string | null;
      needsNewSlot: boolean;
    };
    data?: { source: string; hasLive: boolean; hasArchive: boolean; archiveCount: number };
    subscription?: {
      checked: boolean;
      active: number;
      pastDue: number;
      freeServers: number;
      liveServers: number;
      required: number;
      sufficient: boolean;
    };
    activeJob?: { status: string } | null;
  };
  // The backend is the authority on whether a restore can go ahead — the page's
  // own three checks are only there to explain why.
  let plan: Plan | null = null;
  let planLoading = true;

  function blocker(code: string) {
    return plan?.blockers?.find((b) => b.code === code) ?? null;
  }
  $: subscriptionBlocker =
    blocker("no_subscription") || blocker("payment_pending") || blocker("insufficient_subscriptions");

  type WorldCopy = {
    worldSize: string;
    mods: number;
    plugins: number;
    lastModified: string | null;
    playerCount: number;
    warnings: string[];
  };
  let worldInfo: { hasLive: boolean; hasTrashbin: boolean; live: WorldCopy | null; trashbin: WorldCopy | null } | null = null;
  let worldLoading = true;

  type Step = {
    done: boolean;
    loading?: boolean;
    title: string;
    text: string;
    button: string | null;
    href?: string | null;
    disabled?: boolean;
    onClick?: () => void;
    meta?: string[];
  };

  function formatDate(timestamp: number) {
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function worldMeta(copy: WorldCopy) {
    const meta = [];
    if (copy.worldSize) meta.push(`${copy.worldSize} world`);
    if (copy.lastModified) meta.push(`Last modified ${copy.lastModified}`);
    if (copy.mods) meta.push(`${copy.mods} mods`);
    if (copy.plugins) meta.push(`${copy.plugins} plugins`);
    return meta;
  }

  function findNewSlot() {
    showFindSlotModal = true;
    findSlotLoading = true;
    findSlotResult = null;

    fetch(apiurl + "server/restore/available-slot", {
      method: "GET",
      headers: {
        username: localStorage.getItem("accountEmail"),
        token: localStorage.getItem("token"),
      },
    })
      .then((res) => res.json())
      .then((data) => {
        findSlotResult = data;
      })
      .finally(() => {
        findSlotLoading = false;
      });
  }

  onMount(() => {
    if (browser) {
      const headers = {
        username: localStorage.getItem("accountEmail"),
        token: localStorage.getItem("token"),
      };

      fetch(apiurl + "info/billing", { method: "GET", headers })
        .then((res) => res.json())
        .then(async (data) => {
          const subscriptions = data.subscriptions || [];
          subscriptionActive = subscriptions.some(
            (s) => s.status === "active" || s.status === "trialing"
          );

          if (!subscriptionActive && subscriptions.length) {
            const histories = await Promise.all(
              subscriptions.map((s) =>
                fetch(apiurl + "info/billing/invoiceHistory?subscriptionId=" + s.id, {
                  method: "GET",
                  headers,
                })
                  .then((res) => res.json())
                  .then((d) => d.invoices || [])
                  .catch(() => [])
              )
            );

            const paidInvoices = histories.flat().filter((invoice) => invoice.status === "paid");
            if (paidInvoices.length) {
              lastPaymentDate = Math.max(
                ...paidInvoices.map((invoice) => invoice.paid_at || invoice.created)
              );
            }
          }
        })
        .catch((e) => console.error("Failed to load subscription info:", e))
        .finally(() => {
          subscriptionLoading = false;
        });

      fetch(apiurl + "server/restore/" + serverId + "/plan", { method: "GET", headers })
        .then((res) => res.json())
        .then((data) => {
          plan = data;
          // A restore already running (another tab, or a reload mid-way) —
          // rejoin it rather than offering to start a second one.
          if (data?.activeJob) showRestoreModal = true;
        })
        .catch((e) => console.error("Failed to load restore plan:", e))
        .finally(() => {
          planLoading = false;
        });

      fetch(apiurl + "server/restore/world-info/" + serverId, { method: "GET", headers })
        .then((res) => res.json())
        .then((data) => {
          worldInfo = data;
        })
        .catch((e) => console.error("Failed to load world info:", e))
        .finally(() => {
          worldLoading = false;
        });
    }
  });

  $: worldStep = (worldLoading
    ? {
        done: false,
        loading: true,
        title: "World Data",
        text: "Checking your world data…",
        button: null,
      }
    : !worldInfo || (!worldInfo.hasLive && !worldInfo.hasTrashbin)
    ? {
        done: false,
        title: "World Data",
        text: "We couldn't locate any world data for this server.",
        button: null,
      }
    : worldInfo.hasLive && worldInfo.hasTrashbin
    ? {
        done: false,
        title: "World Data",
        text: "We found two separate copies of your world data. Choose which one to keep before we can restore access.",
        button: "Resolve conflict",
        onClick: () => (showBugResolver = true),
      }
    : worldInfo.hasLive
    ? {
        done: true,
        title: "World Data",
        text: "Your server's world data is safe and will carry over once access is restored.",
        button: null,
        meta: worldMeta(worldInfo.live),
      }
    : {
        done: true,
        title: "World Data",
        text: "Your world data was moved to temporary storage, but it's still safe and recoverable.",
        button: null,
        meta: worldMeta(worldInfo.trashbin),
      }) as Step;

  // Driven by the restore plan rather than raw panel capacity: what matters is
  // whether *this* server's own slot survived, not whether the node has room.
  $: slotStep = (planLoading
    ? {
        done: false,
        loading: true,
        title: "Slot",
        text: "Checking your server slot…",
        button: null,
      }
    : !plan || !plan.slot
    ? {
        done: false,
        title: "Slot",
        text: "We couldn't check the status of your server slot.",
        button: null,
      }
    : !plan.slot.needsNewSlot
    ? {
        done: true,
        title: "Slot",
        text:
          plan.slot.originalState === "ours"
            ? `Your server is still on its original slot (#${plan.slot.originalId}).`
            : `Your original slot (#${plan.slot.originalId}) is still free and will be reused.`,
        button: null,
      }
    : plan.slot.targetId
    ? {
        done: true,
        title: "Slot",
        text: `Your original slot (#${plan.slot.originalId}) was reassigned, so your server will be restored as #${plan.slot.targetId}. Its IP address will change.`,
        button: "Find new slot",
        onClick: findNewSlot,
      }
    : {
        done: false,
        title: "Slot",
        text: "Your slot is no longer available, and this location currently has no open slots either.",
        button: "Find new slot",
        onClick: findNewSlot,
      }) as Step;

  $: subscriptionDone = subscriptionActive && !subscriptionBlocker;

  $: steps = [
    {
      done: subscriptionDone,
      loading: subscriptionLoading || planLoading,
      title: "Subscription",
      text: subscriptionLoading || planLoading
        ? "Checking your subscription status…"
        : subscriptionBlocker
        ? subscriptionBlocker.message
        : subscriptionActive
        ? "You have an active subscription on this account."
        : `You currently have no active subscriptions.${
            lastPaymentDate
              ? ` Your final payment was on ${formatDate(lastPaymentDate)}.`
              : ""
          } Renew your plan to continue.`,
      button: subscriptionLoading || planLoading || subscriptionDone ? null : "Renew subscription",
      href: subscriptionLoading || planLoading || subscriptionDone ? null : "/billing",
    },
    slotStep,
    worldStep,
  ] as Step[];

  // Blockers the three steps above don't already explain in their own text.
  $: otherBlockers = (plan?.blockers ?? []).filter(
    (b) =>
      b.code !== "no_subscription" &&
      b.code !== "payment_pending" &&
      b.code !== "insufficient_subscriptions" &&
      b.code !== "no_slots" &&
      b.code !== "world_conflict" &&
      b.code !== "no_data"
  );
</script>

<div class="flex place-content-center text-neutral-content">
  <div class="flex flex-col grow items-center max-w-[40rem] mb-10 space-y-6">
    <a href="/dashboard" class="self-start flex items-center gap-1.5 text-sm font-semibold opacity-70 hover:opacity-100">
      <ArrowLeft size="16" />
      Back to dashboard
    </a>

    <div class="text-center">
      <h2 class="font-poppins-bold text-2xl md:text-3xl">Let's get your service restored</h2>
      <p class="text-sm opacity-70 mt-1">Server #{serverId}</p>
    </div>

    <div class="w-full flex flex-col">
      {#each steps as step, i}
        <div class="flex gap-4 items-stretch">
          <div class="flex flex-col items-center w-10 shrink-0">
            <div
              class="w-10 h-10 rounded-full flex justify-center items-center shrink-0 {step.loading
                ? 'bg-base-300 text-base-content/40'
                : step.done
                ? 'bg-success/10 text-success'
                : 'bg-error/10 text-error'}"
            >
              {#if step.loading}
                <Loader2 size="18" class="animate-spin" />
              {:else if step.done}
                <Check size="20" />
              {:else}
                <X size="20" />
              {/if}
            </div>
          </div>
          <div class="flex-1 bg-base-100 rounded-xl p-4 flex flex-col gap-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="font-poppins-bold text-sm">{step.title}</p>
                <p class="text-sm opacity-80 mt-0.5">{step.text}</p>
                {#if step.meta && step.meta.length}
                  <div class="flex flex-wrap gap-1.5 mt-2">
                    {#each step.meta as m}
                      <span class="text-xs px-2 py-0.5 rounded-full bg-base-300 opacity-80">{m}</span>
                    {/each}
                  </div>
                {/if}
              </div>
              {#if step.button}
                {#if step.href}
                  <a href={step.href} class="btn btn-secondary btn-sm shrink-0">
                    {step.button}
                    <ArrowRight size="16" />
                  </a>
                {:else}
                  <button
                    class="btn btn-sm shrink-0 {step.disabled ? 'btn-disabled' : 'btn-secondary'}"
                    disabled={step.disabled}
                    on:click={step.onClick}
                  >
                    {step.button}
                  </button>
                {/if}
              {/if}
            </div>
          </div>
        </div>

        <div class="flex gap-4">
          <div class="w-10 shrink-0 flex justify-center">
            <div class="w-0 h-6 border-l-2 border-dashed border-base-300"></div>
          </div>
          <div class="flex-1"></div>
        </div>
      {/each}

      <div class="flex gap-4">
        <div class="w-10 shrink-0"></div>
        <div class="flex-1 flex flex-col gap-2">
          <button
            class="btn w-full sm:w-auto {plan?.canRestore && !planLoading ? 'btn-primary' : 'btn-disabled'}"
            disabled={planLoading || !plan?.canRestore}
            on:click={() => (showRestoreModal = true)}
          >
            {#if planLoading}
              <Loader2 size="16" class="animate-spin" />
              Checking…
            {:else}
              Restore access
            {/if}
          </button>

          {#each otherBlockers as b}
            <p class="text-xs opacity-70">{b.message}</p>
          {/each}

          {#if plan?.canRestore}
            {#each plan.warnings ?? [] as w}
              <p class="text-xs opacity-70">{w.message}</p>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

{#if showRestoreModal}
  <!-- restoreWorld is left at its default: the world always comes back. The
       endpoint still accepts `false`, there just isn't a way to ask for it. -->
  <RestoreAccessModal {serverId} on:close={() => (showRestoreModal = false)} />
{/if}

{#if showBugResolver}
  <BugResolverModal
    serverId={parseInt(serverId)}
    on:close={() => (showBugResolver = false)}
    on:resolved={() => (showBugResolver = false)}
  />
{/if}

{#if showFindSlotModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    style="background: rgba(0,0,0,0.6);"
    on:click|self={() => (showFindSlotModal = false)}
  >
    <div
      class="bg-base-100 text-neutral-content rounded-2xl p-8 max-w-sm w-full flex flex-col items-center text-center gap-3"
    >
      {#if findSlotLoading}
        <Loader2 size="32" class="animate-spin opacity-70" />
        <p class="font-poppins-bold text-base mt-1">Searching for an available slot…</p>
        <p class="text-sm opacity-70">
          We're looking for the best open slot on this location for your server. This won't take
          long.
        </p>
      {:else if findSlotResult?.available}
        <div class="bg-success/10 text-success w-14 h-14 rounded-full flex items-center justify-center">
          <Check size="28" />
        </div>
        <p class="font-poppins-bold text-base mt-1">Found an open slot</p>
        <p class="text-sm opacity-70">
          Slot #{findSlotResult.id} is available on this location and can be assigned to your
          server.
        </p>
      {:else}
        <div class="bg-error/10 text-error w-14 h-14 rounded-full flex items-center justify-center">
          <X size="28" />
        </div>
        <p class="font-poppins-bold text-base mt-1">No open slots right now</p>
        <p class="text-sm opacity-70">This location is currently full. Please check back later.</p>
      {/if}
      <button class="btn btn-neutral btn-sm mt-2" on:click={() => (showFindSlotModal = false)}>
        Close
      </button>
    </div>
  </div>
{/if}
