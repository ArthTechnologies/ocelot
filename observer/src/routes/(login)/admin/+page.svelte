<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Cpu,
    HardDrive,
    TrendingUp,
    Users,
    Server,
    DollarSign,
    Zap,
    BarChart3,
    Download
  } from 'lucide-svelte';
  import { fileSizeShort } from '$lib/scripts/utils';
  import { getAdminDashboard } from '$lib/scripts/req';

  let accounts = [];
  let latestSnapshot: any = null;
  let totalSubscriptions = 0;
  let estimatedMRR = 0;
  let loading = true;
  let error: string | null = null;
  let totalServers = 0;
  let totalPlayers = 0;
  let totalSlots = 0;

  onMount(async () => {
    try {
      const data = await getAdminDashboard();
      if (data?.error) {
        error = data.error;
      } else if (data) {
        latestSnapshot = data.snapshot || {};
        accounts = data.accounts || [];
        totalSubscriptions = data.totalSubscriptions || 0;
        estimatedMRR = data.estimatedMRR || 0;

        // Calculate capacity info
        totalServers = accounts.reduce((sum, acc) => sum + acc.servers.length, 0);
        totalPlayers = accounts.reduce((sum, acc) =>
          sum + acc.servers.reduce((serverSum, server) => serverSum + (server.players || 0), 0), 0);
        totalSlots = 32; // Total server slots capacity

        error = null;
      } else {
        error = "Failed to load dashboard: No data returned from server";
      }
    } catch (err) {
      console.error("Failed to load admin dashboard:", err);
      error = `Failed to load dashboard: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      loading = false;
    }
  });

  $: currentMemoryPercent = latestSnapshot?.memory ?
    Math.round((latestSnapshot.memory.used / latestSnapshot.memory.total) * 100) : 0;

  $: slotMapping = (() => {
    // Get all servers with their account info and create a map by slot number
    // Slot number is derived from server ID minus location offset (ID % 100)
    const slots = {};
    for (const account of accounts) {
      for (const server of account.servers) {
        const slotNum = server.id % 100; // Get slot from last 2 digits of ID
        if (slotNum > 0 && slotNum <= 32) {
          slots[slotNum] = { serverId: server.id, server, account };
        }
      }
    }
    return slots;
  })();

  const downloadAsJSON = () => {
    const data = {
      timestamp: new Date().toISOString(),
      snapshot: latestSnapshot,
      accounts,
      totals: {
        subscriptions: totalSubscriptions,
        mrr: estimatedMRR,
        servers: totalServers,
        players: totalPlayers,
        slots: totalSlots
      }
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-dashboard-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    return status === 'active' ? 'bg-green-500/20 text-green-300' : 'bg-base-300 text-base-content/60';
  };

  const getPlanColor = (plan: string) => {
    // All plans get monochrome, primary plan gets orange accent
    return 'bg-base-300 text-base-content';
  };
</script>

<div class="min-h-screen bg-gradient-to-br from-base-200 via-base-200 to-base-300">
  <!-- Header -->
  <div class="p-8 border-b border-base-300/50 bg-gradient-to-r from-base-100/5 to-transparent backdrop-blur-sm">
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-5xl font-bold text-base-content mb-2 tracking-tight">Admin Dashboard</h1>
        <p class="text-base-content/50 text-sm tracking-wide uppercase letter-spacing">System monitoring and account management</p>
      </div>
      <button
        on:click={downloadAsJSON}
        class="btn btn-ghost btn-sm text-primary hover:bg-primary/10"
        title="Download dashboard data as JSON"
      >
        <Download class="w-5 h-5 mr-1.5" />
        <span>Export</span>
      </button>
    </div>
  </div>

  <div class="p-8 max-w-7xl mx-auto">
    <!-- Error Alert -->
    {#if error}
      <div class="alert alert-error mb-8 bg-error/10 border border-error/30 rounded-xl shadow-lg" role="alert">
        <div class="flex items-start gap-4">
          <div class="text-error text-xl">⚠</div>
          <div>
            <h3 class="font-bold text-error mb-1">Dashboard Error</h3>
            <p class="text-error/80 text-sm">{error}</p>
            <p class="text-error/60 text-xs mt-2">Check backend connectivity and verify admin access</p>
          </div>
        </div>
      </div>
    {/if}

    <!-- Loading State -->
    {#if loading}
      <div class="card bg-base-100 shadow-2xl mb-8 border border-base-300/30">
        <div class="card-body">
          <div class="flex items-center gap-4">
            <span class="loading loading-spinner loading-lg text-primary"></span>
            <p class="text-base-content/60">Loading dashboard data...</p>
          </div>
        </div>
      </div>
    {/if}

    <!-- System Snapshots Section -->
    <div class="card bg-base-100 shadow-2xl mb-8 border border-base-300/30 hover:shadow-lg transition-shadow duration-300">
      <div class="card-body">
        <h2 class="card-title text-2xl mb-6 flex items-center gap-3 text-base-content">
          <div class="p-2 bg-primary/10 rounded-lg">
            <Cpu class="w-6 h-6 text-primary" />
          </div>
          System Performance
        </h2>

        {#if latestSnapshot}
          <div class="flex flex-col md:flex-row gap-6 mb-8">
            <!-- Overall CPU -->
            <div class="stat bg-gradient-to-br from-base-200/40 to-base-300/20 rounded-xl p-5 border border-base-300/30 hover:border-base-300/60 transition-colors flex-grow" style="flex-basis: 25%;">
              <div class="stat-title text-xs font-semibold uppercase text-base-content/60 tracking-wider">Overall CPU Usage</div>
              <div class="stat-value text-3xl text-primary font-bold mt-2">{latestSnapshot.cpuUsage}%</div>
              <div class="stat-desc text-xs text-base-content/50">Current load</div>
            </div>

            <!-- Memory -->
            <div class="stat bg-gradient-to-br from-base-200/40 to-base-300/20 rounded-xl p-5 border border-base-300/30 hover:border-base-300/60 transition-colors flex-grow" style="flex-basis: 30%;">
              <div class="stat-title text-xs font-semibold uppercase text-base-content/60 tracking-wider">Memory Usage</div>
              <div class="stat-value text-2xl text-base-content font-bold mt-2">
                {fileSizeShort(latestSnapshot.memory.used * 1000000)} <span class="text-base-content/40">/</span> {fileSizeShort(latestSnapshot.memory.total * 1000000)}
              </div>
              <div class="stat-desc text-xs text-base-content/50">{currentMemoryPercent}% utilized</div>
            </div>

            <!-- CPU Model -->
            <div class="stat bg-gradient-to-br from-base-200/40 to-base-300/20 rounded-xl p-5 border border-base-300/30 hover:border-base-300/60 transition-colors flex-grow" style="flex-basis: 45%;">
              <div class="stat-title text-xs font-semibold uppercase text-base-content/60 tracking-wider">Processor</div>
              <div class="stat-value text-lg line-clamp-2 mt-2 text-base-content font-semibold">{latestSnapshot.cpuName}</div>
            </div>
          </div>

          <!-- Per-Core CPU Usage -->
          <div class="mb-2">
            <h3 class="text-xs font-bold uppercase text-base-content/60 tracking-wider mb-4">Per-Core CPU Usage</h3>
            <div class="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-16 gap-2.5">
              {#each latestSnapshot.threads as core}
                <div class="bg-base-200 hover:bg-base-200/80 rounded-lg p-4 text-center border border-base-300 hover:border-base-300/80 transition-all group">
                  <div class="text-xs font-semibold text-base-content/50 mb-1.5 font-mono tracking-wide">{core.id}</div>
                  <div class="text-lg font-bold text-base-content">{core.cpuUsage}%</div>
                  <div class="h-2 bg-base-300 rounded-full mt-3 overflow-hidden shadow-inner">
                    <div
                      class="h-full bg-primary transition-all duration-500 group-hover:shadow-lg group-hover:shadow-primary/20 rounded-full"
                      style="width: {core.cpuUsage}%"
                    ></div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Subscription & Capacity Overview -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <!-- Estimated MRR (Left) -->
      <div class="card bg-gradient-to-br from-base-100 to-base-200/50 shadow-xl border border-base-300/40 hover:shadow-2xl hover:border-base-300/60 transition-all duration-300">
        <div class="card-body py-4 px-5">
          <h2 class="card-title text-lg flex items-center gap-3">
            <div class="p-2 bg-info/10 rounded-lg">
              <DollarSign class="w-5 h-5 text-info" />
            </div>
            Estimated MRR
          </h2>
          <div class="text-4xl font-bold text-info mt-3">${estimatedMRR.toFixed(2)}</div>
          <p class="text-base-content/50 text-xs mt-1">Monthly recurring revenue</p>
        </div>
      </div>

      <!-- Active Subscriptions (Middle) -->
      <div class="card bg-gradient-to-br from-base-100 to-base-200/50 shadow-xl border border-base-300/40 hover:shadow-2xl hover:border-base-300/60 transition-all duration-300">
        <div class="card-body py-4 px-5">
          <h2 class="card-title text-sm flex items-center gap-3">
            <div class="p-2 bg-info/10 rounded-lg">
              <Users class="w-4 h-4 text-info" />
            </div>
            <span class="text-sm">Active</span>
          </h2>
          <div class="text-3xl font-bold text-base-content mt-2">{totalSubscriptions}</div>
          <p class="text-base-content/50 text-xs mt-1">{accounts.length} accounts</p>
        </div>
      </div>

      <!-- Capacity Info (Right) -->
      <div class="card bg-gradient-to-br from-base-100 to-base-200/50 shadow-xl border border-base-300/40 hover:shadow-2xl hover:border-base-300/60 transition-all duration-300">
        <div class="card-body py-4 px-5">
          <h2 class="card-title text-sm flex items-center gap-3">
            <div class="p-2 bg-primary/10 rounded-lg">
              <Server class="w-4 h-4 text-primary" />
            </div>
            <span class="text-sm">Capacity</span>
          </h2>
          <div class="flex gap-2 mt-2">
            <div class="stat bg-base-200/40 rounded-lg p-3 border border-base-300/40 flex-1 text-center">
              <div class="stat-value text-xl text-primary">{totalServers}</div>
              <div class="stat-desc text-xs text-base-content/60">Servers</div>
            </div>
            <div class="stat bg-base-200/40 rounded-lg p-3 border border-base-300/40 flex-1 text-center">
              <div class="stat-value text-xl text-primary">{totalPlayers}</div>
              <div class="stat-desc text-xs text-base-content/60">Players</div>
            </div>
            <div class="stat bg-base-200/40 rounded-lg p-3 border border-base-300/40 flex-1 text-center">
              <div class="stat-value text-xl text-primary">{totalSlots}</div>
              <div class="stat-desc text-xs text-base-content/60">Slots</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Accounts List -->
    <div class="mb-8">
      <!-- Slot Visualization -->
      <div class="mb-6 p-4 bg-base-100 rounded-xl border border-base-300/30">
        <p class="text-xs font-bold uppercase text-base-content/50 tracking-wider mb-3">Server Slots ({totalServers} / {totalSlots})</p>
        <div class="flex flex-wrap gap-1">
          {#each Array(32) as _, slotIndex}
            {@const slotNum = slotIndex + 1}
            {@const slotData = slotMapping[slotNum]}
            {#if slotData}
              <button
                on:click={() => document.getElementById(`account-${slotData.account.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                class="w-6 h-6 rounded-md bg-primary text-primary-content text-xs font-bold hover:bg-primary-focus transition-all cursor-pointer flex items-center justify-center"
                title="Slot #{slotNum} - {slotData.server.name} ({slotData.account.name})"
              >
                {slotNum}
              </button>
            {:else}
              <div class="w-6 h-6 rounded-md bg-base-300 border border-base-300/50"></div>
            {/if}
          {/each}
        </div>
      </div>

      <h2 class="text-2xl font-bold mb-6 flex items-center gap-3">
        <div class="p-2 bg-base-300 rounded-lg">
          <Users class="w-6 h-6 text-base-content/60" />
        </div>
        Accounts
      </h2>

      <div class="space-y-4">
        {#each accounts as account (account.id)}
          <div id="account-{account.id}" class="bg-base-100 rounded-xl p-5 border border-base-300/50 hover:border-primary/30 hover:shadow-xl transition-all duration-300 shadow-lg">
              <!-- Account Header -->
              <div class="mb-3">
                <div class="flex items-baseline gap-2 mb-1">
                  <h3 class="text-lg font-semibold">{account.name}</h3>
                  <span class="text-sm text-base-content/60">{account.email}</span>
                </div>
              </div>

              <div class="grid gap-3 mb-3">
                <!-- Servers Row -->
                {#if account.servers.length > 0}
                  <div>
                    <p class="text-xs font-bold uppercase text-base-content/50 tracking-wider mb-3">Servers ({account.servers.length})</p>
                    <div class="flex flex-wrap gap-3">
                      {#each account.servers as server}
                        <div class="bg-base-200 rounded-lg px-3.5 py-2.5 flex items-center gap-2.5 border border-base-300 hover:border-base-300/80 hover:bg-base-200/80 transition-all group">
                          <Server class="w-4 h-4 text-base-content/60" />
                          <div>
                            <div class="font-mono text-sm font-semibold">{server.name}</div>
                            <div class="text-xs text-base-content/60">
                              Slot #{server.id} • {server.software} {server.version}
                            </div>
                          </div>
                          {#if server.players > 0}
                            <div class="ml-2 text-xs font-semibold text-base-content/70 bg-base-300 rounded px-2 py-0.5">
                              {server.players} players
                            </div>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  </div>
                {:else}
                  <div class="text-sm text-base-content/60 italic">No servers</div>
                {/if}

                <!-- Subscriptions Row -->
                {#if account.subscriptions.length > 0}
                  <div>
                    <p class="text-xs font-bold uppercase text-base-content/50 tracking-wider mb-3">Subscriptions ({account.subscriptions.length})</p>
                    <div class="flex flex-wrap gap-3">
                      {#each account.subscriptions as sub}
                        <div class="flex items-center gap-2.5 bg-base-200/40 rounded-lg px-3 py-1.5 border border-base-300/60 hover:border-base-300/80 transition-colors">
                          <span class="text-xs font-semibold {getPlanColor(sub.plan)} rounded px-2.5 py-1">
                            {sub.plan}
                          </span>
                          <span class="text-xs font-semibold {getStatusColor(sub.status)} rounded px-2.5 py-1">
                            {sub.status}
                          </span>
                          <span class="text-xs font-bold text-base-content/70 ml-1">${sub.price}/mo</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {:else}
                  <div class="text-sm text-base-content/60 italic">No active subscriptions</div>
                {/if}
              </div>

              <!-- Account Footer -->
              <div class="pt-2 border-t border-base-300">
                <span class="text-xs text-base-content/50 font-mono">{account.accountId}</span>
              </div>
            </div>
        {/each}
      </div>
    </div>

    <!-- Footer Info -->
    <div class="mt-12 text-center text-xs text-base-content/40 font-medium tracking-wide">
      <p>✦ Snapshot data updates every 60 seconds • Account data is live ✦</p>
    </div>
  </div>
</div>

<style lang="postcss">
  :global(.stat) {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  :global(.stat-title) {
    font-size: 0.75rem;
    opacity: 0.7;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  :global(.stat-value) {
    line-height: 1.2;
  }

  :global(.stat-desc) {
    opacity: 0.6;
  }
</style>
