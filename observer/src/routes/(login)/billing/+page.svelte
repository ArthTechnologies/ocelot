<script lang="ts">
  import { apiurl, customerPortalLink } from "$lib/scripts/req";
  import { t, locale, locales } from "$lib/scripts/i18n";
  import { browser } from "$app/environment";
  import {
    ClipboardList,
    MessagesSquare,
    CreditCard,
    Server,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Clock,
    ExternalLink,
    Zap,
    Receipt,
    ArrowUpCircle,
    ArrowDownCircle,
    Ban,
    Loader2,
    ShieldAlert,
    Wrench,
    Plus,
    CalendarDays,
    X,
  } from "lucide-svelte";
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

  function loadBilling() {
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
  }

  if (browser) {
    accountId = localStorage.getItem("accountId");
    servers = JSON.parse(localStorage.getItem("servers"));
    address = localStorage.getItem("address");

    loadBilling();

    email = localStorage.getItem("accountEmail");
    console.log(email);
  }

  function subscribe() {
    if (browser) {
      localStorage.setItem("subscribed", "true");
    }
  }

  let showFixIssueModal = false;
  let selectedIssue: 'planUpgrade' | 'paymentRecovered' | null = null;
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
    showFixIssueModal = true;

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

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        // Validate response structure
        if (!data || !data.subscriptions || !data.servers) {
          throw new Error("Invalid response format from API");
        }

        // Process plans
        const planCounts: Record<string, number> = {};
        data.subscriptions.forEach((sub: any) => {
          if (sub.name) {
            planCounts[sub.name] = (planCounts[sub.name] || 0) + 1;
          }
        });

        modalPlans = Object.entries(planCounts).map(([name, count]) => ({
          name,
          count,
          displayName: `${count}x ${name.charAt(0).toUpperCase() + name.slice(1)} Plan`
        }));

        // Process servers - include all servers to show pending status
        modalServers = data.servers
          .filter((server: any) => server.id !== undefined && server.id !== null)
          .map((server: any) => {
            const isPending = server.plan === "not created yet";
            return {
              id: server.id,
              software: server.software || "Unknown",
              version: server.version || "Unknown",
              currentPlan: server.plan,
              isPending
            };
          });

        if (modalServers.length === 0) {
          throw new Error("No valid servers available");
        }
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      modalError = `Failed to load data: ${errorMsg}`;
      console.error("openFixIssueModal error:", e);
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
          if (data.duplicateAccount) {
            modalError = `It looks like your subscription is on a different account. Try signing out and logging in with "${data.loginMethod}" instead.`;
          } else {
            modalError = data.message || "Failed to process your request";
          }
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

  // ---- Cancel subscription ----
  let showCancelModal = false;
  let cancelTarget: any = null;
  let cancelSubmitting = false;
  let cancelError = "";

  function canCancel(subscription: any) {
    return (
      (subscription.status === "active" ||
        subscription.status === "trialing" ||
        subscription.status === "past_due") &&
      !subscription.canceled_at
    );
  }

  function openCancelModal(subscription: any) {
    cancelTarget = subscription;
    cancelError = "";
    showCancelModal = true;
  }

  function closeCancelModal() {
    if (cancelSubmitting) return;
    showCancelModal = false;
    cancelTarget = null;
    cancelError = "";
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    cancelSubmitting = true;
    cancelError = "";

    try {
      const response = await fetch(apiurl + "info/billing/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          username: localStorage.getItem("accountEmail"),
          token: localStorage.getItem("token"),
        },
        body: JSON.stringify({ subscriptionId: cancelTarget.id }),
      });

      const data = await response.json();

      if (response.ok && data.status === "canceled") {
        alert("Subscription successfully canceled.", "success");
        showCancelModal = false;
        cancelTarget = null;
        invoiceHistory = {};
        upcomingInvoices = {};
        loadBilling();
      } else {
        cancelError = data.msg || "We couldn't cancel this subscription. Please contact support.";
      }
    } catch (e) {
      cancelError = "We couldn't cancel this subscription. Please contact support.";
      console.error(e);
    }

    cancelSubmitting = false;
  }

  // ---- Upgrade / downgrade plan (UI only — backend not wired up yet) ----
  const planTiers = [
    { id: "basic", name: "Basic", price: 5.99, ram: "4GB RAM" },
    { id: "plus", name: "Plus", price: 8.99, ram: "6GB RAM" },
    { id: "premium", name: "Premium", price: 11.99, ram: "8GB RAM" },
  ];

  let showPlanModal = false;
  let planModalMode: "upgrade" | "downgrade" = "upgrade";
  let planModalTarget: any = null;
  let selectedNewPlan = "";
  let planSubmitting = false;
  let planModalError = "";

  function tierIndex(subscription: any) {
    return planTiers.findIndex((t) => subscription.name?.toLowerCase().includes(t.id));
  }

  $: planModalOptions = planModalTarget
    ? planModalMode === "upgrade"
      ? planTiers.slice(tierIndex(planModalTarget) + 1)
      : tierIndex(planModalTarget) > 0
      ? planTiers.slice(0, tierIndex(planModalTarget)).reverse()
      : []
    : [];

  $: currentTier = planModalTarget ? planTiers[tierIndex(planModalTarget)] : null;

  function openPlanModal(subscription: any, mode: "upgrade" | "downgrade") {
    planModalTarget = subscription;
    planModalMode = mode;
    selectedNewPlan = "";
    planModalError = "";
    showPlanModal = true;
  }

  function closePlanModal() {
    if (planSubmitting) return;
    showPlanModal = false;
    planModalTarget = null;
    selectedNewPlan = "";
    planModalError = "";
  }

  async function confirmPlanChange() {
    if (!selectedNewPlan || !planModalTarget) return;
    planSubmitting = true;
    planModalError = "";

    try {
      const response = await fetch(apiurl + "info/billing/changePlan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          username: localStorage.getItem("accountEmail"),
          token: localStorage.getItem("token"),
        },
        body: JSON.stringify({
          subscriptionId: planModalTarget.id,
          newPlan: selectedNewPlan,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert(
          `Plan ${planModalMode === "upgrade" ? "upgraded" : "downgraded"} to ${data.plan.charAt(0).toUpperCase() + data.plan.slice(1)}.`,
          "success"
        );
        showPlanModal = false;
        planModalTarget = null;
        invoiceHistory = {};
        upcomingInvoices = {};
        loadBilling();
      } else {
        planModalError = data.msg || "We couldn't change your plan. Please contact support.";
      }
    } catch (e) {
      planModalError = "We couldn't change your plan. Please contact support.";
      console.error(e);
    }

    planSubmitting = false;
  }

  function priceDelta(tier: { price: number }) {
    if (!currentTier) return "";
    const delta = tier.price - currentTier.price;
    const sign = delta >= 0 ? "+" : "−";
    return `${sign}$${Math.abs(delta).toFixed(2)}/mo`;
  }

  function getStatusPill(status: string) {
    switch (status) {
      case 'active':
        return 'pill-ember';
      case 'trialing':
        return 'pill-blue';
      case 'canceled':
        return 'pill-gray';
      case 'past_due':
      case 'unpaid':
        return 'pill-red';
      case 'incomplete':
        return 'pill-amber';
      default:
        return 'pill-gray';
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'active':
        return CheckCircle2;
      case 'trialing':
        return Clock;
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

  // Subscription filter
  let subscriptionFilter = "active";
  let invoiceHistory: Record<string, any[]> = {};
  let upcomingInvoices: Record<string, any> = {};
  let failureReasons: Record<string, string> = {};

  async function fetchUpcomingInvoice(subscriptionId: string) {
    try {
      const response = await fetch(apiurl + "info/billing/upcomingInvoice?subscriptionId=" + subscriptionId, {
        method: "GET",
        headers: {
          username: localStorage.getItem("accountEmail"),
          token: localStorage.getItem("token"),
        },
      });
      const data = await response.json();
      upcomingInvoices[subscriptionId] = response.ok ? data.invoice : null;
    } catch (e) {
      console.error("Failed to fetch upcoming invoice:", e);
      upcomingInvoices[subscriptionId] = null;
    }
  }

  // Sort all subscriptions chronologically (oldest first)
  $: sortedSubscriptions = [...subs.subscriptions]
    .filter(sub => {
      if (subscriptionFilter === "active") {
        return sub.status === "active" || sub.status === "trialing";
      }
      return true;
    })
    .sort((a, b) => a.created - b.created);

  $: activeCount = subs.subscriptions.filter(
    (s) => s.status === "active" || s.status === "trialing"
  ).length;
  $: memberSince = subs.subscriptions.length
    ? Math.min(...subs.subscriptions.map((s) => s.created))
    : null;

  async function fetchInvoiceHistory(subscriptionId: string) {
    try {
      const response = await fetch(apiurl + "info/billing/invoiceHistory?subscriptionId=" + subscriptionId, {
        method: "GET",
        headers: {
          username: localStorage.getItem("accountEmail"),
          token: localStorage.getItem("token"),
        },
      });
      const data = await response.json();
      invoiceHistory[subscriptionId] = data.invoices || [];

      // For non-paid invoices, fetch payment intent to get failure reason
      for (let invoice of data.invoices || []) {
        if (invoice.status !== 'paid' && invoice.payment_intent) {
          fetchPaymentIntentReason(invoice.payment_intent);
        }
      }

      return data.invoices || [];
    } catch (e) {
      console.error("Failed to fetch invoice history:", e);
      invoiceHistory[subscriptionId] = [];
      return [];
    }
  }

  async function fetchPaymentIntentReason(paymentIntentId: string) {
    try {
      const response = await fetch(apiurl + "info/billing/paymentIntentReason?paymentIntentId=" + paymentIntentId, {
        method: "GET",
        headers: {
          username: localStorage.getItem("accountEmail"),
          token: localStorage.getItem("token"),
        },
      });
      const data = await response.json();
      if (data.reason) {
        failureReasons[paymentIntentId] = data.reason;
      }
    } catch (e) {
      console.error("Failed to fetch payment intent reason:", e);
    }
  }

  email = email.replace("@", "%40");
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="ember-page">
  <div
    class="ember-bg -inset-x-4 -top-4 -bottom-12 sm:-inset-x-6 sm:-top-6 sm:-bottom-6 md:-inset-x-8 md:-top-8 md:-bottom-8 lg:-top-16"
    aria-hidden="true"
  ></div>
  <div class="ember-inner mx-auto max-w-[72rem] px-4 sm:px-8 py-6 lg:py-8">

    <!-- Hero -->
    <header class="rise flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
      <div>
        <h1 class="display-title">
          {$t("bill.title")}
        </h1>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        {#if customerPortalLink != ""}
          <a
            id="manage"
            target="_blank"
            rel="noopener noreferrer"
            href="{customerPortalLink}?prefilled_email={email}"
            class="ghost-btn"
          >
            <ExternalLink size="16" />
            {$t("button.manage")}
          </a>
        {/if}
        <a id="subscribe" href="/signup/subscribe" class="glow-cta" on:click={subscribe}>
          <CreditCard size="17" />
          {#if subs.subscriptions.length === 0}
            {$t("button.subscribe")}
          {:else}
            {$t("button.newsubscribe")}
          {/if}
        </a>
      </div>
    </header>

    <!-- Stats strip -->
    <div class="rise rise-1 grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
      <div class="stat-tile">
        <div class="stat-icon stat-icon-ember"><Zap size="17" /></div>
        <div>
          <p class="stat-num">{activeCount}</p>
          <p class="stat-label">Active {activeCount === 1 ? "plan" : "plans"}</p>
        </div>
      </div>
      <div class="stat-tile">
        <div class="stat-icon"><Server size="17" /></div>
        <div>
          <p class="stat-num">{servers ? servers.length : 0}</p>
          <p class="stat-label">{servers && servers.length === 1 ? "Server" : "Servers"}</p>
        </div>
      </div>
      <div class="stat-tile">
        <div class="stat-icon"><CalendarDays size="17" /></div>
        <div>
          <p class="stat-num stat-num-sm">{memberSince ? formatDate(memberSince) : "—"}</p>
          <p class="stat-label">Customer since</p>
        </div>
      </div>
    </div>

    <!-- Main grid -->
    <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">

      <!-- Subscriptions -->
      <section class="rise rise-2 lg:col-span-3 space-y-4">
        <div class="flex items-end justify-between gap-3">
          <div>
            <h2 class="section-title">Subscriptions</h2>
            <p class="muted text-sm mt-0.5">Your plans &amp; billing history</p>
          </div>
          <div class="seg">
            <button
              class:on={subscriptionFilter === "active"}
              on:click={() => (subscriptionFilter = "active")}>Active</button
            >
            <button
              class:on={subscriptionFilter === "all"}
              on:click={() => (subscriptionFilter = "all")}>All</button
            >
          </div>
        </div>

        {#await promise}
          <div class="space-y-4">
            {#each [1, 2] as _}
              <div class="panel p-5 animate-pulse">
                <div class="h-4 w-1/3 rounded skeleton-bar"></div>
                <div class="h-3 w-1/2 rounded skeleton-bar mt-3"></div>
                <div class="h-3 w-2/3 rounded skeleton-bar mt-2"></div>
              </div>
            {/each}
          </div>
        {:then}
          {#if sortedSubscriptions.length > 0}
            <div class="space-y-4">
              {#each sortedSubscriptions as subscription}
                <article
                  class="panel p-5 {subscription.status === 'active' || subscription.status === 'trialing'
                    ? 'ember-card'
                    : ''}"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h3 class="plan-name">
                        {subscription.name.charAt(0).toUpperCase() + subscription.name.slice(1)}
                        <span class="plan-name-dim">Plan</span>
                      </h3>
                      <p class="price-line mt-1">
                        <span class="price">{formatCurrency(subscription.price, subscription.currency)}</span>
                        <span class="price-per">/ {subscription.interval}</span>
                      </p>
                    </div>

                    {#if subscription.status === 'canceled' && invoiceHistory[subscription.id]?.[0] && invoiceHistory[subscription.id][0].status !== 'paid'}
                      <span class="pill pill-red">
                        <XCircle size="12" />
                        Expired
                      </span>
                    {:else}
                      <span class="pill {getStatusPill(subscription.status)}">
                        <svelte:component this={getStatusIcon(subscription.status)} size="12" />
                        {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                      </span>
                    {/if}
                  </div>

                  <div class="meta-line mt-3">
                    <Clock size="12" />
                    Started {formatDate(subscription.created)}
                    {#if subscription.status === 'trialing' && subscription.trial_end}
                      <span class="dot">·</span>
                      <span class="text-sky-300/90">Free trial ends {formatDate(subscription.trial_end)}</span>
                    {:else if subscription.canceled_at}
                      <span class="dot">·</span>
                      {subscription.status === 'active' ? 'Cancels' : 'Ended'} {formatDate(subscription.canceled_at)}
                    {/if}
                  </div>

                  <!-- Invoice history -->
                  <div class="mt-4 pt-4 invoice-divider">
                    <p class="invoice-heading">
                      <Receipt size="13" />
                      Recent invoices
                    </p>
                    {#if subscription.status === 'active' || subscription.status === 'trialing'}
                      {#if upcomingInvoices[subscription.id] === undefined}
                        <div class="h-7 rounded-lg skeleton-bar animate-pulse mt-2"></div>
                        {#await fetchUpcomingInvoice(subscription.id) then _}
                        {/await}
                      {:else if upcomingInvoices[subscription.id]}
                        <div class="invoice-row invoice-row-upcoming mt-2 text-xs">
                          <div class="flex items-center gap-2 min-w-0 flex-1">
                            <span class="invoice-amount">
                              {formatCurrency(upcomingInvoices[subscription.id].amount_due, upcomingInvoices[subscription.id].currency)}
                            </span>
                            <span class="pill pill-xs pill-ember whitespace-nowrap">upcoming</span>
                          </div>
                          <span class="muted whitespace-nowrap">
                            {formatDate(upcomingInvoices[subscription.id].date)}
                          </span>
                        </div>
                      {/if}
                    {/if}
                    {#if invoiceHistory[subscription.id] === undefined}
                      <div class="space-y-2 mt-2">
                        {#each [1, 2, 3] as _}
                          <div class="h-7 rounded-lg skeleton-bar animate-pulse"></div>
                        {/each}
                      </div>
                      {#await fetchInvoiceHistory(subscription.id) then _}
                      {/await}
                    {:else if invoiceHistory[subscription.id].length > 0}
                      <div class="space-y-1.5 mt-2 text-xs">
                        {#each invoiceHistory[subscription.id] as invoice}
                          <div class="invoice-row">
                            <div class="flex items-center gap-2 min-w-0 flex-1">
                              <span class="invoice-amount">
                                {formatCurrency(invoice.amount_paid, invoice.currency)}
                              </span>
                              {#if invoice.status === 'open' && invoice.attempt_count}
                                <span class="pill pill-xs pill-amber whitespace-nowrap">
                                  {invoice.attempt_count} failed {invoice.attempt_count === 1 ? 'attempt' : 'attempts'}
                                </span>
                              {:else}
                                <span
                                  class="pill pill-xs {invoice.status === 'paid'
                                    ? 'pill-green'
                                    : invoice.status === 'void' || invoice.status === 'uncollectible'
                                    ? 'pill-red'
                                    : 'pill-amber'} whitespace-nowrap"
                                >
                                  {invoice.status}
                                </span>
                              {/if}
                              {#if invoice.payment_intent && failureReasons[invoice.payment_intent]}
                                <span
                                  class="muted truncate max-w-xs"
                                  title={`Stripe: "${failureReasons[invoice.payment_intent]}"`}
                                >
                                  Stripe: "{failureReasons[invoice.payment_intent].substring(0, 100)}"
                                </span>
                              {/if}
                            </div>
                            <span class="muted whitespace-nowrap">
                              {formatDate((invoice.paid_at || invoice.created))}
                            </span>
                          </div>
                        {/each}
                      </div>
                    {:else}
                      <p class="muted text-xs mt-2">No invoice history</p>
                    {/if}
                  </div>

                  {#if canCancel(subscription)}
                    <div class="mt-4 flex flex-wrap justify-end gap-2">
                      <button
                        class="upgrade-btn"
                        on:click={() => openPlanModal(subscription, "upgrade")}
                      >
                        <ArrowUpCircle size="14" />
                        Upgrade plan
                      </button>
                      <button
                        class="downgrade-btn"
                        on:click={() => openPlanModal(subscription, "downgrade")}
                      >
                        <ArrowDownCircle size="14" />
                        Downgrade plan
                      </button>
                      <button class="danger-ghost" on:click={() => openCancelModal(subscription)}>
                        <Ban size="14" />
                        Cancel subscription
                      </button>
                    </div>
                  {/if}
                </article>
              {/each}
            </div>
          {:else}
            <div class="panel empty-state">
              <div class="empty-icon"><CreditCard size="22" /></div>
              <p class="empty-title">No subscriptions yet</p>
              <p class="muted text-sm mt-1">Subscribe to a plan to get started</p>
              <a href="/signup/subscribe" class="glow-cta mt-5" on:click={subscribe}>
                <Plus size="16" />
                {$t("button.subscribe")}
              </a>
            </div>
          {/if}
        {/await}
      </section>

      <!-- Servers -->
      <section class="rise rise-3 lg:col-span-2 space-y-4">
        <div>
          <h2 class="section-title">{$t("navbar.servers")}</h2>
          <p class="muted text-sm mt-0.5">Tied to your subscriptions</p>
        </div>

        <div class="panel p-4">
          {#if servers && servers.length > 0}
            <div class="space-y-2.5">
              {#each servers as server}
                {#if !server.isStandard && server.error?.code === 101}
                  <div class="server-row server-row-pending">
                    <div class="server-icon"><Server size="16" /></div>
                    <div class="min-w-0 flex-1">
                      <p class="server-address muted">{address}:{10000 + parseInt(server.id)}</p>
                      <p class="server-sub">Pending creation</p>
                    </div>
                    <span class="pill pill-xs pill-gray">Pending</span>
                  </div>
                {:else}
                  <div class="server-row">
                    <div class="server-icon server-icon-live"><Server size="16" /></div>
                    <div class="min-w-0 flex-1">
                      <p class="server-address">{address}:{10000 + parseInt(server.id)}</p>
                      <p class="server-sub">Server #{server.id}</p>
                    </div>
                    <span class="pill pill-xs pill-green">Active</span>
                  </div>
                {/if}
              {/each}
            </div>
          {:else}
            <div class="empty-state py-8">
              <div class="empty-icon"><Server size="22" /></div>
              <p class="empty-title">No servers yet</p>
              <p class="muted text-sm mt-1">Create a server after subscribing</p>
            </div>
          {/if}
        </div>

        <!-- Subscription tools -->
        <div class="panel p-4">
          <div class="flex items-center justify-between gap-3">
            <h3 class="tool-title">
              <Wrench size="15" />
              Subscription tools
            </h3>
            <button class="fix-btn" on:click={openFixIssueModal} disabled={!selectedIssue}>
              Fix issue
            </button>
          </div>
          <div class="space-y-1.5 mt-3">
            <label class="issue-option" class:picked={selectedIssue === 'planUpgrade'}>
              <input
                type="radio"
                name="subscription-issue"
                value="planUpgrade"
                bind:group={selectedIssue}
              />
              <span>Plan upgrade not applied</span>
            </label>
            <label class="issue-option" class:picked={selectedIssue === 'paymentRecovered'}>
              <input
                type="radio"
                name="subscription-issue"
                value="paymentRecovered"
                bind:group={selectedIssue}
              />
              <span>My server is expired but it shouldn't be</span>
            </label>
          </div>
        </div>
      </section>
    </div>

    <!-- Refunds -->
    <section class="rise rise-4 panel p-6 mt-8">
      <h2 class="section-title flex items-center gap-2.5">
        <span class="refund-icon"><MessagesSquare size="16" /></span>
        {$t("bill.refunds.title")}
      </h2>
      <ol class="mt-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        <li class="refund-step">
          <span class="step-num">1</span>
          <span>{$t("bill.refunds.1")}</span>
        </li>
        <li class="refund-step">
          <span class="step-num">2</span>
          <span>{$t("bill.refunds.2")}</span>
        </li>
        <li class="refund-step">
          <span class="step-num">3</span>
          <div class="flex flex-wrap items-center gap-2">
            <span>
              {$t("bill.refunds.3a")}
              <b>{$t("bill.refunds.3b")}</b>
              {$t("bill.refunds.3c")}
            </span>
            <button
              class="copy-btn"
              on:click={() => { navigator.clipboard.writeText(accountId); }}
            >
              <ClipboardList size="13" />
              {$t("button.copyToClipboard")}
            </button>
          </div>
        </li>
        <li class="refund-step">
          <span class="step-num">4</span>
          <span>{$t("bill.refunds.4")}</span>
        </li>
      </ol>
    </section>
  </div>
</div>

<!-- Cancel Subscription Modal -->
{#if showCancelModal && cancelTarget}
  <div class="m-overlay">
    <div class="m-backdrop" on:click={closeCancelModal} aria-hidden="true"></div>
    <div class="m-box m-box-sm" role="dialog" aria-modal="true">
      <button class="m-close" on:click={closeCancelModal} disabled={cancelSubmitting}>
        <X size="16" />
      </button>

      <div class="cancel-badge">
        <ShieldAlert size="22" />
      </div>
      <h3 class="m-title mt-4">Cancel this subscription?</h3>
      <p class="muted text-sm mt-2">
        You're about to cancel your
        <b class="text-ink">
          {cancelTarget.name.charAt(0).toUpperCase() + cancelTarget.name.slice(1)} Plan
        </b>
        ({formatCurrency(cancelTarget.price, cancelTarget.currency)} / {cancelTarget.interval}).
      </p>

      <div class="warn-box mt-4">
        <AlertCircle size="16" class="shrink-0 mt-0.5" />
        <span>
          Your server tied to this plan will stop working, and its data may be
          permanently deleted after 7 days.
        </span>
      </div>

      {#if cancelError}
        <div class="error-box mt-4">
          <XCircle size="15" class="shrink-0" />
          <span>{cancelError}</span>
        </div>
      {/if}

      <div class="flex justify-end gap-3 mt-6">
        <button class="ghost-btn" on:click={closeCancelModal} disabled={cancelSubmitting}>
          Keep plan
        </button>
        <button class="danger-btn" on:click={confirmCancel} disabled={cancelSubmitting}>
          {#if cancelSubmitting}
            <Loader2 size="15" class="animate-spin" />
            Cancelling…
          {:else}
            <Ban size="15" />
            Cancel subscription
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Upgrade / Downgrade Plan Modal -->
{#if showPlanModal && planModalTarget}
  <div class="m-overlay">
    <div class="m-backdrop" on:click={closePlanModal} aria-hidden="true"></div>
    <div class="m-box m-box-sm" role="dialog" aria-modal="true">
      <button class="m-close" on:click={closePlanModal} disabled={planSubmitting}>
        <X size="16" />
      </button>

      <div class="plan-modal-badge" class:downgrade={planModalMode === "downgrade"}>
        {#if planModalMode === "upgrade"}
          <ArrowUpCircle size="22" />
        {:else}
          <ArrowDownCircle size="22" />
        {/if}
      </div>
      <h3 class="m-title mt-4">
        {planModalMode === "upgrade" ? "Upgrade" : "Downgrade"} your plan
      </h3>
      <p class="muted text-sm mt-2">
        You're currently on the
        <b class="text-ink">{currentTier ? currentTier.name : planModalTarget.name} Plan</b>
        ({formatCurrency(planModalTarget.price, planModalTarget.currency)} / {planModalTarget.interval}).
      </p>

      {#if planModalOptions.length > 0}
        <div class="space-y-2.5 mt-5">
          {#each planModalOptions as tier}
            <button
              class="tier-option"
              class:selected={selectedNewPlan === tier.id}
              on:click={() => (selectedNewPlan = tier.id)}
            >
              <div class="tier-radio" aria-hidden="true"></div>
              <div class="flex-1 min-w-0 text-left">
                <p class="tier-name">{tier.name} Plan</p>
                <p class="tier-sub">{tier.ram}</p>
              </div>
              <div class="text-right">
                <p class="tier-price">${tier.price.toFixed(2)}<span class="tier-per">/mo</span></p>
                <p
                  class="tier-delta"
                  class:cheaper={tier.price < (currentTier ? currentTier.price : 0)}
                >
                  {priceDelta(tier)}
                </p>
              </div>
            </button>
          {/each}
        </div>

        {#if planModalMode === "downgrade"}
          <div class="warn-box mt-4">
            <AlertCircle size="16" class="shrink-0 mt-0.5" />
            <span>
              Downgrading reduces your server's resources. Make sure your world and
              player count fit the smaller plan.
            </span>
          </div>
        {/if}
      {:else}
        <div class="info-box mt-5">
          <AlertCircle size="15" class="shrink-0 mt-0.5" />
          <span>
            {#if planModalMode === "upgrade"}
              You're already on our highest plan — there's nothing to upgrade to.
            {:else}
              You're already on our smallest plan — there's nothing to downgrade to.
            {/if}
          </span>
        </div>
      {/if}

      {#if planModalError}
        <div class="error-box mt-4">
          <XCircle size="15" class="shrink-0" />
          <span>{planModalError}</span>
        </div>
      {/if}

      <div class="flex justify-end gap-3 mt-6">
        <button class="ghost-btn" on:click={closePlanModal} disabled={planSubmitting}>
          {planModalOptions.length > 0 ? "Never mind" : "Close"}
        </button>
        {#if planModalOptions.length > 0}
          <button
            class="glow-cta glow-cta-sm"
            on:click={confirmPlanChange}
            disabled={planSubmitting || !selectedNewPlan}
          >
            {#if planSubmitting}
              <Loader2 size="15" class="animate-spin" />
              Switching…
            {:else}
              Confirm {planModalMode}
            {/if}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Fix Issue Modal -->
{#if showFixIssueModal}
  <div class="m-overlay">
    <div class="m-backdrop" on:click={() => showFixIssueModal = false} aria-hidden="true"></div>
    <div class="m-box" role="dialog" aria-modal="true">
      <button class="m-close" on:click={() => showFixIssueModal = false} disabled={modalSubmitting}>
        <X size="16" />
      </button>

      <div class="mb-4">
        <h3 class="m-title">
          {selectedIssue === 'planUpgrade' ? 'Update Server Plans' : 'Recover Expired Server'}
        </h3>
        {#if selectedIssue === 'planUpgrade'}
          <p class="muted text-sm mt-1">Let's make sure your plans are allocated properly</p>
        {:else if selectedIssue === 'paymentRecovered'}
          <p class="muted text-sm mt-1">We'll help you restore your server after payment recovery</p>
        {/if}
      </div>

      {#if modalLoading}
        <div class="py-8 flex justify-center">
          <Loader2 size="28" class="animate-spin ember-text" />
        </div>
      {:else if modalError}
        <div class="error-box mb-4">
          <XCircle size="15" class="shrink-0" />
          <span>{modalError}</span>
        </div>
      {:else if selectedIssue === 'planUpgrade'}
        <div class="space-y-4">
          <!-- Assignment Interface -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[200px]">
            <!-- Servers (Left) -->
            <div>
              <p class="modal-col-heading">Your servers</p>
              <div class="space-y-2">
                {#each modalServers as server, idx}
                  <div class="modal-row">
                    {#if server.isPending}
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-mono muted truncate">{server.id}</p>
                        <p class="text-xs muted opacity-60">Pending creation</p>
                      </div>
                      <span class="pill pill-xs pill-gray">—</span>
                    {:else}
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-mono truncate">
                          Slot {server.id} - {server.software.charAt(0).toUpperCase() + server.software.slice(1)} {server.version}
                        </p>
                      </div>
                      <select
                        class="dark-select w-20"
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
              <p class="modal-col-heading">Plan assignments</p>
              <div class="space-y-2">
                {#each modalPlans as plan, letterIdx}
                  <div class="modal-row">
                    <span class="plan-letter">{String.fromCharCode(65 + letterIdx)}</span>
                    <div class="flex-1 min-w-0">
                      <p class="text-xs truncate">{plan.displayName}</p>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>

          <div class="info-box">
            <AlertCircle size="15" class="shrink-0" />
            <span>Server restart required to apply changes</span>
          </div>
        </div>
      {:else if selectedIssue === 'paymentRecovered'}
        <div class="space-y-4">
          {#if expiredServers.length > 0}
            <div>
              <label class="modal-col-heading block" for="expired-server-select">Select server to recover:</label>
              <select
                id="expired-server-select"
                class="dark-select w-full"
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
            <div class="warn-box">
              <AlertCircle size="15" class="shrink-0 mt-0.5" />
              <span>No expired servers found. All your servers are currently active.</span>
            </div>
          {/if}

          <div class="info-box">
            <AlertCircle size="15" class="shrink-0 mt-0.5" />
            <span>We'll check if your server can be recovered. If it's marked as expired but still exists, it will be restored automatically and you can use it immediately.</span>
          </div>
          <p class="muted text-sm">If your server was deleted past the grace period, you'll see a message with instructions on how to recover your data.</p>
        </div>
      {/if}

      <div class="flex justify-end gap-3 mt-6">
        <button
          class="ghost-btn"
          on:click={() => showFixIssueModal = false}
          disabled={modalSubmitting}
        >
          Cancel
        </button>
        {#if selectedIssue === 'planUpgrade'}
          <button
            class="glow-cta glow-cta-sm"
            on:click={submitPlanUpdates}
            disabled={modalSubmitting || modalServers.some(s => !s.isPending && !planAssignments[s.id])}
          >
            {#if modalSubmitting}
              <Loader2 size="15" class="animate-spin" />
              Updating…
            {:else}
              Apply changes
            {/if}
          </button>
        {:else}
          <button
            class="glow-cta glow-cta-sm"
            on:click={submitIssueRequest}
            disabled={modalSubmitting || (selectedIssue === 'paymentRecovered' && !selectedExpiredServerId)}
          >
            {#if modalSubmitting}
              <Loader2 size="15" class="animate-spin" />
              Submitting…
            {:else}
              Submit request
            {/if}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* ============ Ember console theme ============ */
  .ember-page,
  .m-overlay {
    --bg: #111725;
    --ember: #ff5a1f;
    --ember-deep: #e64817;
    --ember-soft: rgba(230, 72, 23, 0.14);
    --line: rgba(148, 163, 184, 0.13);
    --line-strong: rgba(148, 163, 184, 0.22);
    --ink: #eaeef5;
    --muted: #949db1;
    --panel-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.012));
    font-family: "Poppins", ui-sans-serif, system-ui, sans-serif;
  }

  .ember-page {
    position: relative;
    isolation: isolate;
    min-height: calc(100vh - 8rem);
    color: var(--ink);
  }
  .ember-bg {
    position: absolute;
    z-index: -1;
    pointer-events: none;
    background:
      radial-gradient(1100px 520px at 82% -12%, rgba(230, 72, 23, 0.16), transparent 62%),
      radial-gradient(800px 400px at -8% 24%, rgba(230, 72, 23, 0.05), transparent 60%),
      radial-gradient(900px 600px at 50% 115%, rgba(40, 52, 76, 0.5), transparent 65%),
      var(--bg);
  }
  .ember-bg::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
    background-size: 26px 26px;
    mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.25) 55%, transparent 90%);
    -webkit-mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.25) 55%, transparent 90%);
  }
  .ember-inner {
    position: relative;
    z-index: 1;
  }

  /* ============ Typography ============ */
  .display-title {
    font-family: "Poppins", ui-sans-serif, system-ui, sans-serif;
    font-weight: 700;
    font-size: clamp(2rem, 4.5vw, 3rem);
    line-height: 1.05;
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  .ember-text {
    background: linear-gradient(100deg, #ffb38a 0%, var(--ember) 45%, #ff8a4c 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .section-title {
    font-family: "Poppins", ui-sans-serif, system-ui, sans-serif;
    font-weight: 600;
    font-size: 1.15rem;
    color: var(--ink);
  }
  .muted {
    color: var(--muted);
  }
  .text-ink {
    color: var(--ink);
  }

  /* ============ Panels ============ */
  .panel {
    background: var(--panel-bg);
    border: 1px solid var(--line);
    border-radius: 1.1rem;
    box-shadow: 0 20px 45px -28px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.04);
    transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
  }
  .ember-card {
    border-color: rgba(230, 72, 23, 0.42);
    box-shadow:
      0 0 0 1px rgba(230, 72, 23, 0.1),
      0 12px 42px -14px rgba(230, 72, 23, 0.35),
      0 0 60px -18px rgba(230, 72, 23, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
  .ember-card:hover {
    border-color: rgba(230, 72, 23, 0.6);
    box-shadow:
      0 0 0 1px rgba(230, 72, 23, 0.18),
      0 14px 50px -12px rgba(230, 72, 23, 0.45),
      0 0 80px -16px rgba(230, 72, 23, 0.38),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    transform: translateY(-1px);
  }

  .skeleton-bar {
    background: rgba(148, 163, 184, 0.1);
  }

  /* ============ Buttons ============ */
  .glow-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.7rem 1.35rem;
    border-radius: 0.7rem;
    font-family: "Poppins", ui-sans-serif, system-ui, sans-serif;
    font-weight: 600;
    font-size: 0.9rem;
    color: #fff;
    background: linear-gradient(135deg, #ff7a3c, var(--ember-deep) 55%, #c93a0e);
    border: 1px solid rgba(255, 158, 110, 0.45);
    box-shadow:
      0 6px 26px -6px rgba(230, 72, 23, 0.65),
      0 0 55px -10px rgba(230, 72, 23, 0.55);
    cursor: pointer;
    transition: box-shadow 0.25s ease, transform 0.15s ease, filter 0.2s ease;
    animation: emberPulse 3.2s ease-in-out infinite;
  }
  .glow-cta:hover {
    transform: translateY(-1px);
    filter: brightness(1.07);
    box-shadow:
      0 8px 32px -6px rgba(230, 72, 23, 0.8),
      0 0 80px -8px rgba(230, 72, 23, 0.65);
    animation: none;
  }
  .glow-cta:active {
    transform: translateY(0);
  }
  .glow-cta:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    animation: none;
  }
  .glow-cta-sm {
    padding: 0.55rem 1.1rem;
    font-size: 0.85rem;
  }
  @keyframes emberPulse {
    0%, 100% {
      box-shadow:
        0 6px 26px -6px rgba(230, 72, 23, 0.65),
        0 0 55px -10px rgba(230, 72, 23, 0.55);
    }
    50% {
      box-shadow:
        0 6px 30px -6px rgba(230, 72, 23, 0.85),
        0 0 85px -8px rgba(230, 72, 23, 0.7);
    }
  }

  .ghost-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.65rem 1.15rem;
    border-radius: 0.7rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--ink);
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--line-strong);
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease;
  }
  .ghost-btn:hover {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(148, 163, 184, 0.35);
  }
  .ghost-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .upgrade-btn,
  .downgrade-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.85rem;
    border-radius: 0.55rem;
    font-size: 0.78rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
  }
  .upgrade-btn {
    color: #ffc9ae;
    background: var(--ember-soft);
    border: 1px solid rgba(230, 72, 23, 0.35);
  }
  .upgrade-btn:hover {
    background: rgba(230, 72, 23, 0.24);
    border-color: rgba(230, 72, 23, 0.55);
    box-shadow: 0 0 20px -6px rgba(230, 72, 23, 0.5);
  }
  .downgrade-btn {
    color: var(--muted);
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--line-strong);
  }
  .downgrade-btn:hover {
    color: var(--ink);
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(148, 163, 184, 0.35);
  }

  .danger-ghost {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.85rem;
    border-radius: 0.55rem;
    font-size: 0.78rem;
    font-weight: 500;
    color: #f8917c;
    background: rgba(239, 68, 68, 0.06);
    border: 1px solid rgba(239, 68, 68, 0.22);
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  }
  .danger-ghost:hover {
    background: rgba(239, 68, 68, 0.14);
    border-color: rgba(239, 68, 68, 0.45);
    color: #fca5a5;
  }

  .danger-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.6rem 1.15rem;
    border-radius: 0.7rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: #fff;
    background: linear-gradient(135deg, #f87171, #dc2626 60%);
    border: 1px solid rgba(252, 165, 165, 0.4);
    box-shadow: 0 6px 24px -8px rgba(220, 38, 38, 0.6);
    cursor: pointer;
    transition: filter 0.2s ease, transform 0.15s ease;
  }
  .danger-btn:hover {
    filter: brightness(1.08);
    transform: translateY(-1px);
  }
  .danger-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .fix-btn {
    padding: 0.4rem 0.95rem;
    border-radius: 0.55rem;
    font-family: "Poppins", ui-sans-serif, system-ui, sans-serif;
    font-size: 0.78rem;
    font-weight: 600;
    color: #ffd9c7;
    background: var(--ember-soft);
    border: 1px solid rgba(230, 72, 23, 0.35);
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .fix-btn:hover:not(:disabled) {
    background: rgba(230, 72, 23, 0.24);
    border-color: rgba(230, 72, 23, 0.55);
    box-shadow: 0 0 24px -6px rgba(230, 72, 23, 0.45);
  }
  .fix-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.65rem;
    border-radius: 0.45rem;
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--ink);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--line-strong);
    cursor: pointer;
    transition: background 0.2s ease;
  }
  .copy-btn:hover {
    background: rgba(255, 255, 255, 0.09);
  }

  /* ============ Stats ============ */
  .stat-tile {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 1rem 1.15rem;
    background: var(--panel-bg);
    border: 1px solid var(--line);
    border-radius: 0.95rem;
  }
  .stat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 0.7rem;
    color: var(--muted);
    background: rgba(148, 163, 184, 0.08);
    border: 1px solid var(--line);
    flex-shrink: 0;
  }
  .stat-icon-ember {
    color: var(--ember);
    background: var(--ember-soft);
    border-color: rgba(230, 72, 23, 0.3);
    box-shadow: 0 0 22px -6px rgba(230, 72, 23, 0.5);
  }
  .stat-num {
    font-family: "Poppins", ui-sans-serif, system-ui, sans-serif;
    font-weight: 700;
    font-size: 1.35rem;
    line-height: 1.1;
    color: var(--ink);
  }
  .stat-num-sm {
    font-size: 1.05rem;
  }
  .stat-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin-top: 0.15rem;
  }

  /* ============ Segmented filter ============ */
  .seg {
    display: inline-flex;
    padding: 0.2rem;
    gap: 0.2rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--line);
    border-radius: 0.6rem;
  }
  .seg button {
    padding: 0.3rem 0.85rem;
    border-radius: 0.42rem;
    font-size: 0.76rem;
    font-weight: 500;
    color: var(--muted);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  }
  .seg button.on {
    color: #ffd9c7;
    background: var(--ember-soft);
    box-shadow: inset 0 0 0 1px rgba(230, 72, 23, 0.35), 0 0 16px -6px rgba(230, 72, 23, 0.5);
  }

  /* ============ Subscription cards ============ */
  .plan-name {
    font-family: "Poppins", ui-sans-serif, system-ui, sans-serif;
    font-weight: 600;
    font-size: 1.1rem;
    color: var(--ink);
  }
  .plan-name-dim {
    color: var(--muted);
    font-weight: 500;
  }
  .price-line {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
  }
  .price {
    font-family: "Poppins", ui-sans-serif, system-ui, sans-serif;
    font-weight: 700;
    font-size: 1.45rem;
    color: var(--ember);
    text-shadow: 0 0 24px rgba(230, 72, 23, 0.4);
  }
  .price-per {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .meta-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .dot {
    opacity: 0.5;
  }
  .invoice-divider {
    border-top: 1px solid var(--line);
  }
  .invoice-heading {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .invoice-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.45rem 0.6rem;
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(148, 163, 184, 0.07);
  }
  .invoice-amount {
    font-weight: 600;
    white-space: nowrap;
    color: var(--ink);
  }
  .invoice-row-upcoming {
    border-style: dashed;
    border-color: rgba(230, 72, 23, 0.35);
    background: rgba(230, 72, 23, 0.05);
  }

  /* ============ Pills ============ */
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.28rem 0.65rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    white-space: nowrap;
    border: 1px solid transparent;
  }
  .pill-xs {
    padding: 0.14rem 0.5rem;
    font-size: 0.64rem;
  }
  .pill-ember {
    color: #ffc9ae;
    background: var(--ember-soft);
    border-color: rgba(230, 72, 23, 0.4);
    box-shadow: 0 0 18px -4px rgba(230, 72, 23, 0.55);
  }
  .pill-green {
    color: #86efac;
    background: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.3);
  }
  .pill-blue {
    color: #93c5fd;
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.3);
  }
  .pill-red {
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
  }
  .pill-amber {
    color: #fcd34d;
    background: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.3);
  }
  .pill-gray {
    color: var(--muted);
    background: rgba(148, 163, 184, 0.08);
    border-color: rgba(148, 163, 184, 0.2);
  }

  /* ============ Servers ============ */
  .server-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.7rem 0.8rem;
    border-radius: 0.75rem;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(148, 163, 184, 0.08);
    transition: border-color 0.2s ease, background 0.2s ease;
  }
  .server-row:hover {
    background: rgba(255, 255, 255, 0.045);
    border-color: rgba(148, 163, 184, 0.18);
  }
  .server-row-pending {
    opacity: 0.6;
  }
  .server-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.1rem;
    height: 2.1rem;
    border-radius: 0.6rem;
    color: var(--muted);
    background: rgba(148, 163, 184, 0.08);
    border: 1px solid var(--line);
    flex-shrink: 0;
  }
  .server-icon-live {
    color: #86efac;
    background: rgba(34, 197, 94, 0.08);
    border-color: rgba(34, 197, 94, 0.25);
  }
  .server-address {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .server-sub {
    font-size: 0.7rem;
    color: var(--muted);
    margin-top: 0.1rem;
  }

  /* ============ Tools ============ */
  .tool-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: "Poppins", ui-sans-serif, system-ui, sans-serif;
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--ink);
  }
  .issue-option {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.55rem 0.7rem;
    border-radius: 0.6rem;
    font-size: 0.82rem;
    color: var(--muted);
    border: 1px solid transparent;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  }
  .issue-option:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  .issue-option.picked {
    color: var(--ink);
    background: var(--ember-soft);
    border-color: rgba(230, 72, 23, 0.3);
  }
  .issue-option input[type="radio"] {
    appearance: none;
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 999px;
    border: 1.5px solid rgba(148, 163, 184, 0.4);
    flex-shrink: 0;
    display: grid;
    place-content: center;
    cursor: pointer;
    transition: border-color 0.2s ease;
  }
  .issue-option input[type="radio"]::after {
    content: "";
    width: 0.42rem;
    height: 0.42rem;
    border-radius: 999px;
    background: var(--ember);
    box-shadow: 0 0 8px rgba(230, 72, 23, 0.8);
    transform: scale(0);
    transition: transform 0.15s ease;
  }
  .issue-option input[type="radio"]:checked {
    border-color: var(--ember);
  }
  .issue-option input[type="radio"]:checked::after {
    transform: scale(1);
  }

  /* ============ Refunds ============ */
  .refund-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 0.55rem;
    color: var(--ember);
    background: var(--ember-soft);
    border: 1px solid rgba(230, 72, 23, 0.3);
  }
  .refund-step {
    display: flex;
    align-items: flex-start;
    gap: 0.8rem;
    font-size: 0.875rem;
    color: var(--ink);
  }
  .step-num {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.45rem;
    font-family: "Poppins", ui-sans-serif, system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--ember);
    background: var(--ember-soft);
    border: 1px solid rgba(230, 72, 23, 0.3);
    flex-shrink: 0;
  }

  /* ============ Empty states ============ */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 2.5rem 1.5rem;
  }
  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    border-radius: 0.85rem;
    color: var(--muted);
    background: rgba(148, 163, 184, 0.07);
    border: 1px solid var(--line);
    margin-bottom: 0.85rem;
  }
  .empty-title {
    font-family: "Poppins", ui-sans-serif, system-ui, sans-serif;
    font-weight: 600;
    color: var(--ink);
  }

  /* ============ Modals ============ */
  .m-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .m-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(9, 13, 21, 0.75);
    backdrop-filter: blur(6px);
  }
  .m-box {
    position: relative;
    width: 100%;
    max-width: 44rem;
    max-height: 85vh;
    overflow-y: auto;
    padding: 1.75rem;
    border-radius: 1.1rem;
    color: var(--ink, #e9edf4);
    background:
      radial-gradient(600px 200px at 80% -20%, rgba(230, 72, 23, 0.12), transparent 60%),
      linear-gradient(180deg, #1b2333, #151b29);
    border: 1px solid rgba(148, 163, 184, 0.16);
    box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.9), 0 0 60px -30px rgba(230, 72, 23, 0.35);
    animation: modalIn 0.22s ease-out;
  }
  .m-box-sm {
    max-width: 27rem;
  }
  @keyframes modalIn {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  .m-title {
    font-family: "Poppins", ui-sans-serif, system-ui, sans-serif;
    font-weight: 600;
    font-size: 1.15rem;
    color: var(--ink, #e9edf4);
  }
  .m-close {
    position: absolute;
    top: 0.85rem;
    right: 0.85rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 0.5rem;
    color: #8b94a7;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(148, 163, 184, 0.15);
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease;
  }
  .m-close:hover {
    background: rgba(255, 255, 255, 0.09);
    color: #e9edf4;
  }
  .cancel-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    border-radius: 0.85rem;
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    box-shadow: 0 0 30px -8px rgba(239, 68, 68, 0.5);
  }
  .plan-modal-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    border-radius: 0.85rem;
    color: #ffc9ae;
    background: rgba(230, 72, 23, 0.14);
    border: 1px solid rgba(230, 72, 23, 0.35);
    box-shadow: 0 0 30px -8px rgba(230, 72, 23, 0.5);
  }
  .plan-modal-badge.downgrade {
    color: #93c5fd;
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.3);
    box-shadow: 0 0 30px -8px rgba(59, 130, 246, 0.4);
  }
  .tier-option {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    width: 100%;
    padding: 0.8rem 0.95rem;
    border-radius: 0.8rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(148, 163, 184, 0.14);
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  }
  .tier-option:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(148, 163, 184, 0.28);
  }
  .tier-option.selected {
    background: rgba(230, 72, 23, 0.1);
    border-color: rgba(230, 72, 23, 0.55);
    box-shadow: 0 0 26px -8px rgba(230, 72, 23, 0.5);
  }
  .tier-radio {
    width: 1rem;
    height: 1rem;
    border-radius: 999px;
    border: 1.5px solid rgba(148, 163, 184, 0.4);
    flex-shrink: 0;
    display: grid;
    place-content: center;
    transition: border-color 0.2s ease;
  }
  .tier-radio::after {
    content: "";
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 999px;
    background: var(--ember, #ff5a1f);
    box-shadow: 0 0 8px rgba(230, 72, 23, 0.8);
    transform: scale(0);
    transition: transform 0.15s ease;
  }
  .tier-option.selected .tier-radio {
    border-color: var(--ember, #ff5a1f);
  }
  .tier-option.selected .tier-radio::after {
    transform: scale(1);
  }
  .tier-name {
    font-family: "Poppins", ui-sans-serif, system-ui, sans-serif;
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--ink, #eaeef5);
  }
  .tier-sub {
    font-size: 0.72rem;
    color: var(--muted, #949db1);
    margin-top: 0.1rem;
  }
  .tier-price {
    font-family: "Poppins", ui-sans-serif, system-ui, sans-serif;
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--ink, #eaeef5);
    white-space: nowrap;
  }
  .tier-per {
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--muted, #949db1);
  }
  .tier-delta {
    font-size: 0.7rem;
    font-weight: 600;
    color: #ffc9ae;
    white-space: nowrap;
    margin-top: 0.1rem;
  }
  .tier-delta.cheaper {
    color: #86efac;
  }

  .modal-col-heading {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #8b94a7;
    margin-bottom: 0.6rem;
  }
  .modal-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.65rem;
    border-radius: 0.6rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(148, 163, 184, 0.09);
  }
  .plan-letter {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 0.5rem;
    font-family: "Poppins", ui-sans-serif, system-ui, sans-serif;
    font-weight: 700;
    font-size: 0.85rem;
    color: #ffc9ae;
    background: rgba(230, 72, 23, 0.14);
    border: 1px solid rgba(230, 72, 23, 0.35);
    flex-shrink: 0;
  }
  .dark-select {
    padding: 0.4rem 0.6rem;
    border-radius: 0.5rem;
    font-size: 0.8rem;
    color: #e9edf4;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(148, 163, 184, 0.22);
    cursor: pointer;
    transition: border-color 0.2s ease;
  }
  .dark-select:focus {
    outline: none;
    border-color: rgba(230, 72, 23, 0.55);
    box-shadow: 0 0 0 2px rgba(230, 72, 23, 0.18);
  }
  .dark-select option {
    background: #1b2333;
    color: #eaeef5;
  }
  .dark-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ============ Info / warning / error boxes ============ */
  .warn-box,
  .info-box,
  .error-box {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.75rem 0.9rem;
    border-radius: 0.7rem;
    font-size: 0.82rem;
    line-height: 1.45;
  }
  .warn-box {
    color: #fcd34d;
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.28);
  }
  .info-box {
    color: #93c5fd;
    background: rgba(59, 130, 246, 0.07);
    border: 1px solid rgba(59, 130, 246, 0.25);
  }
  .error-box {
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.28);
  }

  /* ============ Entry animation ============ */
  .rise {
    animation: riseIn 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .rise-1 { animation-delay: 0.07s; }
  .rise-2 { animation-delay: 0.14s; }
  .rise-3 { animation-delay: 0.21s; }
  .rise-4 { animation-delay: 0.28s; }
  @keyframes riseIn {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .rise,
    .glow-cta,
    .m-box {
      animation: none;
    }
  }
</style>
