<script lang="ts">
  import { apiurl, customerPortalLink } from "$lib/scripts/req";
  import { t, locale, locales } from "$lib/scripts/i18n";
  import { browser } from "$app/environment";
  import { ClipboardList, MessagesSquare, CreditCard, Server, CheckCircle, XCircle, AlertCircle, Clock, ExternalLink } from "lucide-svelte";

  let servers = [];
  var email: string = "";
  let promise = null;
  let accountId;
  var subs = {
    subscriptions: [],
    servers: [],
  };
  let address;

  if (browser) {
    accountId = localStorage.getItem("accountId");
    servers = JSON.parse(localStorage.getItem("servers"));
    address = localStorage.getItem("address");

    promise = fetch(apiurl + "info/billing", {
      method: "GET",
      headers: {
        username: localStorage.getItem("accountEmail"),
        token: localStorage.getItem("token"),
      },
    })
      .then((res) => res.json())
      .then((json) => {
        console.log(json);
        subs = json;
      });

    email = localStorage.getItem("accountEmail");
    console.log(email);
  }

  function subscribe() {
    if (browser) {
      localStorage.setItem("subscribed", "true");
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'active':
        return 'badge-success';
      case 'canceled':
        return 'badge-warning';
      case 'past_due':
        return 'badge-error';
      case 'unpaid':
        return 'badge-error';
      case 'incomplete':
        return 'badge-warning';
      default:
        return 'badge-ghost';
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'active':
        return CheckCircle;
      case 'canceled':
        return XCircle;
      case 'past_due':
      case 'unpaid':
        return AlertCircle;
      default:
        return Clock;
    }
  }

  function formatDate(timestamp: number) {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function formatCurrency(amount: number, currency: string) {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount);
  }

  // Sort all subscriptions chronologically (oldest first)
  $: sortedSubscriptions = [...subs.subscriptions].sort((a, b) => a.created - b.created);

  email = email.replace("@", "%40");
</script>

<div class="flex place-content-center px-4 py-8">
  <div class="flex flex-col grow max-w-[65rem] space-y-8">
    <!-- Header -->
    <div class="text-center">
      <h1 class="text-3xl font-bold flex items-center justify-center gap-3">
        <CreditCard size="32" class="text-primary" />
        {$t("bill.title")}
      </h1>
      <p class="text-base-content/60 mt-2">Manage your subscriptions and billing</p>
    </div>

    <!-- Action Buttons -->
    <div class="flex flex-wrap justify-center gap-3">
      {#if customerPortalLink != ""}
        <a
          id="manage"
          target="_blank"
          rel="noopener noreferrer"
          href="{customerPortalLink}?prefilled_email={email}"
          class="btn btn-neutral gap-2"
        >
          <ExternalLink size="18" class="mr-1.5" />
          {$t("button.manage")}
        </a>
      {/if}
      <a
        id="subscribe"
        href="/signup/subscribe"
        class="btn btn-success gap-2"
        on:click={subscribe}
      >
        <CreditCard size="18" class="mr-1.5" />
        {#if subs.subscriptions.length === 0}
          {$t("button.subscribe")}
        {:else}
          {$t("button.newsubscribe")}
        {/if}
      </a>
    </div>

    <!-- Two Column Layout: Subscriptions (Left) | Servers (Right) -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Left Column: Subscriptions -->
      <div class="space-y-4">
        <div>
          <h2 class="text-lg font-semibold">Subscriptions</h2>
          <p class="text-sm text-gray-400">Your billing history</p>
        </div>

        <div class="bg-base-200 rounded-lg p-4">
          {#await promise}
            <div class="space-y-3">
              {#each [1, 2] as _}
                <div class="bg-base-300 rounded-lg p-3 animate-pulse">
                  <div class="h-4 bg-base-200 rounded w-1/3"></div>
                  <div class="h-3 bg-base-200 rounded w-1/2 mt-2"></div>
                </div>
              {/each}
            </div>
          {:then}
            {#if sortedSubscriptions.length > 0}
              <div class="space-y-3">
                {#each sortedSubscriptions as subscription}
                  <div class="bg-base-300 rounded-lg p-3 hover:bg-base-300/80 transition">
                    <div class="flex items-start justify-between">
                      <div>
                        <p class="font-semibold">
                          {subscription.name.charAt(0).toUpperCase() + subscription.name.slice(1)} Plan
                        </p>
                        <p class="text-sm {subscription.status === 'active' ? 'text-primary' : 'text-gray-400'} font-medium mt-0.5">
                          {formatCurrency(subscription.price, subscription.currency)}
                          <span class="font-normal text-gray-400">/ {subscription.interval}</span>
                        </p>
                      </div>
                      <span class="badge badge-sm {getStatusColor(subscription.status)}">
                        {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                      </span>
                    </div>
                    <div class="text-xs text-gray-400 mt-2">
                      Started {formatDate(subscription.created)}
                      {#if subscription.canceled_at}
                        <span class="mx-1">·</span>
                        {subscription.status === 'active' ? 'Cancels' : 'Ended'} {formatDate(subscription.canceled_at)}
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="text-center py-6">
                <CreditCard size="32" class="text-gray-500 mx-auto mb-2" />
                <p class="font-medium text-gray-400">No subscriptions yet</p>
                <p class="text-xs text-gray-500 mt-1">Subscribe to a plan to get started</p>
              </div>
            {/if}
          {/await}
        </div>
      </div>

      <!-- Right Column: Servers -->
      <div class="space-y-4">
        <div>
          <h2 class="text-lg font-semibold">{$t("navbar.servers")}</h2>
          <p class="text-sm text-gray-400">Your active servers</p>
        </div>

        <div class="bg-base-200 rounded-lg p-4">
          {#if servers && servers.length > 0}
            <div class="space-y-3">
              {#each servers as server}
                {#if JSON.stringify(server).includes(":not created yet")}
                  <div class="flex items-center justify-between p-3 bg-base-300/50 rounded-lg">
                    <div class="flex items-center gap-3">
                      <Server size="18" class="text-gray-500" />
                      <div>
                        <p class="font-medium text-gray-400">{address}:{10000 + parseInt(server.split(":")[0])}</p>
                        <p class="text-xs text-gray-500">Pending creation</p>
                      </div>
                    </div>
                    <span class="badge badge-sm badge-ghost">Pending</span>
                  </div>
                {:else}
                  <div class="flex items-center justify-between p-3 bg-base-300 rounded-lg hover:bg-base-300/80 transition">
                    <div class="flex items-center gap-3">
                      <Server size="18" class="text-info" />
                      <div>
                        <p class="font-medium">{address}:{10000 + parseInt(server.id)}</p>
                        <p class="text-xs text-gray-400">Server #{server.id}</p>
                      </div>
                    </div>
                    <span class="badge badge-sm badge-info badge-outline">Active</span>
                  </div>
                {/if}
              {/each}
            </div>
          {:else}
            <div class="text-center py-6">
              <Server size="32" class="text-gray-500 mx-auto mb-2" />
              <p class="font-medium text-gray-400">No servers yet</p>
              <p class="text-xs text-gray-500 mt-1">Create a server after subscribing</p>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Refunds Info Card -->
    <div class="card bg-base-100 shadow-lg">
      <div class="card-body">
        <h2 class="card-title flex items-center gap-2">
          <MessagesSquare size="22" class="text-warning" />
          {$t("bill.refunds.title")}
        </h2>
        <ul class="space-y-3 mt-4">
          <li class="flex items-start gap-3">
            <span class="badge badge-sm badge-primary mt-1">1</span>
            <span>{$t("bill.refunds.1")}</span>
          </li>
          <li class="flex items-start gap-3">
            <span class="badge badge-sm badge-primary mt-1">2</span>
            <span>{$t("bill.refunds.2")}</span>
          </li>
          <li class="flex items-start gap-3">
            <span class="badge badge-sm badge-primary mt-1">3</span>
            <div class="flex flex-wrap items-center gap-2">
              <span>
                {$t("bill.refunds.3a")}
                <b>{$t("bill.refunds.3b")}</b>
                {$t("bill.refunds.3c")}
              </span>
              <button
                class="btn btn-xs btn-outline btn-neutral gap-1"
                on:click={() => { navigator.clipboard.writeText(accountId); }}
              >
                <ClipboardList size="14" />
                {$t("button.copyToClipboard")}
              </button>
            </div>
          </li>
          <li class="flex items-start gap-3">
            <span class="badge badge-sm badge-primary mt-1">4</span>
            <span>{$t("bill.refunds.4")}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</div>
