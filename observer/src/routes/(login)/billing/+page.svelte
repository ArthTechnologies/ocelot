<script lang="ts">
  import { apiurl, customerPortalLink } from "$lib/scripts/req";
  import { t, locale, locales } from "$lib/scripts/i18n";
  import { browser } from "$app/environment";
  import { ClipboardList, MessagesSquare, CreditCard, Server, CheckCircle, XCircle, AlertCircle, Clock, ExternalLink, Zap } from "lucide-svelte";
  import { alert } from "$lib/scripts/utils";

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

  let showFixIssueModal = false;
  let selectedIssue: 'planUpgrade' | 'resubscribedSlot' | 'paymentRecovered' | null = null;
  let modalPlans = [];
  let modalServers = [];
  let planAssignments: Record<string, string> = {};
  let modalLoading = false;
  let modalError = '';
  let modalSubmitting = false;
  let expiredServers = [];
  let selectedExpiredServerId = '';

  async function loadExpiredServers() {
    try {
      const response = await fetch(apiurl + "support/listExpiredServers", {
        method: "GET",
        headers: {
          username: localStorage.getItem("accountEmail"),
          token: localStorage.getItem("token"),
        },
      });

      const data = await response.json();

      if (data.success) {
        expiredServers = data.expiredServers || [];
        // Auto-select first expired server if available
        if (expiredServers.length > 0) {
          selectedExpiredServerId = expiredServers[0].id;
        }
      } else {
        modalError = "Failed to load expired servers";
      }
    } catch (e) {
      modalError = "Failed to load expired servers";
      console.error(e);
    }
  }

  async function openFixIssueModal() {
    modalLoading = true;
    modalError = '';
    planAssignments = {};
    expiredServers = [];
    selectedExpiredServerId = '';

    try {
      // If paymentRecovered is selected, load expired servers
      if (selectedIssue === 'paymentRecovered') {
        await loadExpiredServers();
      } else {
        // For other issues, load current plans and servers
        const response = await fetch(apiurl + "info/billing", {
          method: "GET",
          headers: {
            username: localStorage.getItem("accountEmail"),
            token: localStorage.getItem("token"),
          },
        });

        const data = await response.json();

        // Process plans
        const planCounts: Record<string, number> = {};
        data.subscriptions.forEach((sub: any) => {
          planCounts[sub.name] = (planCounts[sub.name] || 0) + 1;
        });

        modalPlans = Object.entries(planCounts).map(([name, count]) => ({
          name,
          count,
          displayName: `${count}x ${name.charAt(0).toUpperCase() + name.slice(1)} Plan`
        }));

        // Process servers - include all servers to show pending status
        modalServers = data.servers.map((server: any) => {
          const isPending = server.plan === "not created yet";
          return {
            id: server.id,
            software: server.software,
            version: server.version,
            currentPlan: server.plan,
            isPending
          };
        });
      }

      showFixIssueModal = true;
    } catch (e) {
      modalError = "Failed to load data";
      console.error(e);
    }

    modalLoading = false;
  }

  async function submitPlanUpdates() {
    modalSubmitting = true;

    try {
      const response = await fetch(apiurl + "info/updatePlans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          username: localStorage.getItem("accountEmail"),
          token: localStorage.getItem("token"),
        },
        body: JSON.stringify({ planAssignments }),
      });

      const data = await response.json();

      if (data.updated && data.updated.length > 0) {
        alert(`Updated ${data.updated.length} server(s). Server restart required to apply changes.`, "success");
        showFixIssueModal = false;
      } else if (data.errors && data.errors.length > 0) {
        modalError = "Some servers failed to update: " + data.errors.join(", ");
      } else {
        alert("No changes were made", "info");
      }
    } catch (e) {
      modalError = "Failed to update plans";
      console.error(e);
    }

    modalSubmitting = false;
  }

  async function submitIssueRequest() {
    modalSubmitting = true;
    modalError = '';

    try {
      // Handle different issue types
      if (selectedIssue === 'resubscribedSlot') {
        // For re-subscribed slot issue, show a generic message
        alert("Your request has been submitted to our support team. We'll review your account and reassign your server slot as soon as possible.", "success");
        showFixIssueModal = false;
        selectedIssue = null;
        modalSubmitting = false;
        return;
      }

      if (selectedIssue === 'paymentRecovered') {
        // Validate that a server is selected
        if (!selectedExpiredServerId) {
          modalError = "Please select a server to recover";
          modalSubmitting = false;
          return;
        }

        // For payment recovery, call the server recovery endpoint
        const response = await fetch(apiurl + "support/serverRecovery", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            username: localStorage.getItem("accountEmail"),
            token: localStorage.getItem("token"),
          },
          body: JSON.stringify({
            accountId: accountId,
            targetServerId: selectedExpiredServerId
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          modalError = data.message || "Failed to process your request";
          modalSubmitting = false;
          return;
        }

        if (data.success) {
          if (data.recovered === false) {
            // Slot freed but server gone
            alert(data.message, "warning");
          } else {
            // Server restored
            alert(`Great! ${data.message} Your server "${data.serverName}" is ready to use.`, "success");
          }
          showFixIssueModal = false;
          selectedIssue = null;
        } else {
          modalError = data.message || "An error occurred";
        }
      }
    } catch (e) {
      modalError = "Failed to process your request";
      console.error(e);
    }

    modalSubmitting = false;
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

    <!-- Subscription Tools -->
    <div class="card bg-base-100 shadow-lg">
      <div class="card-body p-4">
        <div class="flex items-center justify-between">
          <h2 class="card-title flex items-center gap-2 text-base">
            <Zap size="18" class="text-info" />
            Subscription Tools
          </h2>
          <button
            class="btn btn-sm btn-primary"
            on:click={openFixIssueModal}
            disabled={!selectedIssue}
          >
            Fix Issue
          </button>
        </div>
        <div class="space-y-2 mt-3">
          <label class="flex items-center gap-3 p-2 rounded hover:bg-base-200/50 transition cursor-pointer">
            <input
              type="radio"
              name="subscription-issue"
              class="radio radio-sm"
              value="planUpgrade"
              bind:group={selectedIssue}
            />
            <span class="text-sm">Plan upgrade not applied</span>
          </label>
          <label class="flex items-center gap-3 p-2 rounded hover:bg-base-200/50 transition cursor-pointer">
            <input
              type="radio"
              name="subscription-issue"
              class="radio radio-sm"
              value="resubscribedSlot"
              bind:group={selectedIssue}
            />
            <span class="text-sm">Re-subscribed, can't use server slot</span>
          </label>
          <label class="flex items-center gap-3 p-2 rounded hover:bg-base-200/50 transition cursor-pointer">
            <input
              type="radio"
              name="subscription-issue"
              class="radio radio-sm"
              value="paymentRecovered"
              bind:group={selectedIssue}
            />
            <span class="text-sm">My server expired due to payment issues, and I have resolved them</span>
          </label>
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

<!-- Fix Issue Modal -->
{#if showFixIssueModal}
  <div class="modal modal-open">
    <div class="modal-box max-w-3xl max-h-[80vh] overflow-y-auto">
      <div class="mb-4">
        <h3 class="font-bold text-lg">
          {selectedIssue === 'planUpgrade' ? 'Update Server Plans' : selectedIssue === 'resubscribedSlot' ? 'Reassign Server Slot' : 'Recover Expired Server'}
        </h3>
        {#if selectedIssue === 'planUpgrade'}
          <p class="text-sm text-gray-400 mt-1">Let's make sure your plans are allocated properly</p>
        {:else if selectedIssue === 'paymentRecovered'}
          <p class="text-sm text-gray-400 mt-1">We'll help you restore your server after payment recovery</p>
        {/if}
      </div>

      {#if modalLoading}
        <div class="py-6 text-center">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      {:else if modalError}
        <div class="alert alert-error mb-4">
          <span>{modalError}</span>
        </div>
      {:else if selectedIssue === 'planUpgrade'}
        <div class="space-y-4">
          <!-- Assignment Interface -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[200px]">
            <!-- Servers (Left) -->
            <div>
              <p class="text-sm font-semibold text-gray-400 mb-3">Your Servers:</p>
              <div class="space-y-2">
                {#each modalServers as server, idx}
                  <div class="flex items-center gap-2 p-2 bg-base-200/30 rounded">
                    {#if server.isPending}
                      <div class="flex-1">
                        <p class="text-xs text-gray-500 font-mono">{server.id}</p>
                        <p class="text-xs text-gray-600">Pending creation</p>
                      </div>
                      <div class="badge badge-ghost badge-sm">—</div>
                    {:else}
                      <div class="flex-1">
                        <p class="text-xs font-mono text-gray-300">Slot {server.id} - {server.software.charAt(0).toUpperCase() + server.software.slice(1)} {server.version}</p>
                      </div>
                      <select
                        class="select select-sm select-bordered w-20"
                        bind:value={planAssignments[server.id]}
                        disabled={server.isPending}
                      >
                        <option value="" disabled selected>—</option>
                        {#each modalPlans as plan, letterIdx}
                          <option value={plan.name}>
                            {String.fromCharCode(65 + letterIdx)}
                          </option>
                        {/each}
                      </select>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>

            <!-- Plans (Right) -->
            <div>
              <p class="text-sm font-semibold text-gray-400 mb-3">Plan Assignments:</p>
              <div class="space-y-2">
                {#each modalPlans as plan, letterIdx}
                  <div class="flex items-center gap-2 p-2 bg-base-200/30 rounded">
                    <div class="badge badge-lg badge-primary w-10 flex justify-center">
                      {String.fromCharCode(65 + letterIdx)}
                    </div>
                    <div class="flex-1">
                      <p class="text-xs text-gray-300">{plan.displayName}</p>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>

          <!-- Notice -->
          <div class="alert alert-info text-sm">
            <span>Server restart required to apply changes</span>
          </div>
        </div>
      {:else if selectedIssue === 'resubscribedSlot'}
        <div class="space-y-4">
          <div class="alert alert-info">
            <p class="text-sm">Our support team will review your account and reassign your server slot so you can start using your server again.</p>
          </div>
          <p class="text-sm text-gray-400">You'll receive an email update once your slot has been reassigned.</p>
        </div>
      {:else if selectedIssue === 'paymentRecovered'}
        <div class="space-y-4">
          {#if expiredServers.length > 0}
            <div>
              <label class="block text-sm font-semibold text-gray-400 mb-2">Select server to recover:</label>
              <select
                class="select select-bordered w-full"
                bind:value={selectedExpiredServerId}
              >
                <option value="">-- Choose a server --</option>
                {#each expiredServers as server}
                  <option value={server.id}>
                    Slot {server.id} - {server.software.charAt(0).toUpperCase() + server.software.slice(1)} {server.version}
                  </option>
                {/each}
              </select>
            </div>
          {:else}
            <div class="alert alert-warning">
              <p class="text-sm">No expired servers found. All your servers are currently active.</p>
            </div>
          {/if}

          <div class="alert alert-info">
            <p class="text-sm">We'll check if your server can be recovered. If it's marked as expired but still exists, it will be restored automatically and you can use it immediately.</p>
          </div>
          <p class="text-sm text-gray-400">If your server was deleted past the grace period, you'll see a message with instructions on how to recover your data.</p>
        </div>
      {/if}

      <div class="modal-action mt-6">
        <button
          class="btn btn-ghost"
          on:click={() => showFixIssueModal = false}
          disabled={modalSubmitting}
        >
          Cancel
        </button>
        {#if selectedIssue === 'planUpgrade'}
          <button
            class="btn btn-primary"
            on:click={submitPlanUpdates}
            disabled={modalSubmitting || modalServers.some(s => !s.isPending && !planAssignments[s.id])}
          >
            {modalSubmitting ? 'Updating...' : 'Apply Changes'}
          </button>
        {:else}
          <button
            class="btn btn-primary"
            on:click={submitIssueRequest}
            disabled={modalSubmitting || (selectedIssue === 'paymentRecovered' && !selectedExpiredServerId)}
          >
            {modalSubmitting ? 'Submitting...' : 'Submit Request'}
          </button>
        {/if}
      </div>
    </div>
    <div class="modal-backdrop" on:click={() => showFixIssueModal = false}></div>
  </div>
{/if}
