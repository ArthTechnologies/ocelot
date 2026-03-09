<script>
    import { browser } from "$app/environment";
    import { t } from "$lib/scripts/i18n";
    import { MapPin, ShoppingCart, User, Zap, AlertCircle } from "lucide-svelte";

    let nodeInfo = [];
    let selectedNode = "";
    let pings = [];
    let btest = false;

    if (browser) {
      let rand = Math.random();
      btest = rand < 0.5;
      localStorage.setItem("btest", btest.toString());

      fetch('/api/nodeInfo')
        .then(r => r.json())
        .then(data => {
          nodeInfo = data;
          nodeInfo.forEach((node, i) => {
            pings[i] = "Pinging...";
            const start = performance.now();
            fetch(node[0], { method: "GET", mode: "no-cors" })
              .then(() => {
                pings[i] = Math.round(performance.now() - start) + "ms";
              })
              .catch(() => {
                pings[i] = "Offline";
              });
          });
        });
    }

    function prettyText(text) {
      return text.split("-").map((w, i) =>
        i === 0 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      ).join(" ");
    }

    function selectNode(nodeUrl) {
      if (!nodeUrl.endsWith("/")) nodeUrl += "/";
      localStorage.setItem("userNode", nodeUrl);
      const locationId = nodeUrl.split("https://")[1].split(".")[0];
      selectedNode = locationId;
    }
</script>
<div class="bg-[url('/images/hostingbg3.png')] bg-cover hero min-h-screen relative overflow-hidden">
  <div class="absolute inset-0 bg-gradient-to-br from-slate-950/60 via-slate-900/60 to-slate-800/60 z-0"></div>

  <div class="relative z-10 w-full max-w-2xl mx-auto px-4 py-12 md:py-0">
    <div class="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden">
      <div class="bg-gradient-to-r from-orange-500/18 via-red-500/18 to-orange-500/18 border-b border-slate-700/50 px-4 md:px-8 py-6 md:py-8">
        <!-- Progress Steps - Hidden on mobile, shown on desktop -->
        <div class="hidden md:flex justify-center gap-8 mb-8">
          <div class="flex flex-col items-center gap-2">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/50">
              <MapPin size={20} class="text-white" />
            </div>
            <span class="text-xs font-semibold text-orange-400">Location</span>
          </div>
          <div class="w-12 h-0.5 bg-gradient-to-r from-orange-500/50 to-slate-700 self-center"></div>
          <div class="flex flex-col items-center gap-2 opacity-50">
            <div class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
              <User size={20} class="text-slate-400" />
            </div>
            <span class="text-xs font-semibold text-slate-400">Account</span>
          </div>
          <div class="w-12 h-0.5 bg-slate-700 self-center"></div>
          <div class="flex flex-col items-center gap-2 opacity-50">
            <div class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
              <ShoppingCart size={20} class="text-slate-400" />
            </div>
            <span class="text-xs font-semibold text-slate-400">Plan</span>
          </div>
        </div>

        <!-- Mobile step indicator -->
        <div class="md:hidden flex items-center justify-center gap-3 mb-6">
          <div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <MapPin size={16} class="text-white" />
          </div>
          <span class="text-xs font-semibold text-orange-400">Step 1 of 3</span>
        </div>

        <h1 class="text-2xl md:text-4xl font-bold text-center text-white mb-2">Choose Your Region</h1>
        <p class="text-center text-slate-400 text-xs md:text-sm">Select a server location with the best performance for you</p>
      </div>

      <div class="p-6 md:p-8">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-6">
          {#each nodeInfo as node, i}
            {@const isAtCapacity = parseInt(node[1]) >= parseInt(node[2])}
            {@const isSelected = node[0].split("https://")[1].split(".")[0] === selectedNode}
            {@const locationName = prettyText(node[0].split("https://")[1].split(".")[0])}
            {@const isFull = parseInt(node[1]) >= parseInt(node[2])}

            <button
              on:click={() => selectNode(node[0])}
              disabled={isFull}
              class={`group relative p-3 rounded-lg border-2 transition-all overflow-hidden
                ${isSelected
                  ? 'border-orange-500 bg-gradient-to-br from-orange-500/25 to-orange-600/25 shadow-lg shadow-orange-500/25'
                  : isFull
                  ? 'border-slate-700 bg-slate-800/50 cursor-not-allowed opacity-50'
                  : 'border-slate-700 bg-slate-800/50 hover:border-orange-500/50 hover:bg-slate-800 hover:shadow-lg hover:shadow-orange-500/15'
              }`}
            >
              <div class="relative flex items-start justify-between gap-4">
                <div class="flex-1">
                  <div class="flex items-center gap-1 mb-1">
                    <h3 class="text-sm font-bold text-white">{locationName}</h3>
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    <div class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-slate-700/50 border border-slate-600/50">
                      <Zap size={12} class="text-yellow-400" />
                      <span class="font-semibold text-slate-300">{pings[i]}</span>
                    </div>
                    <div class="px-2 py-1 rounded text-xs font-semibold {isFull ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'}">
                      {isFull ? 'At Capacity' : 'Available'}
                    </div>
                  </div>
                </div>

                <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
                  {isSelected ? 'border-primary bg-primary' : isFull ? 'border-slate-600' : 'border-slate-600 group-hover:border-primary'}">
                  {#if isSelected}
                    <div class="w-2 h-2 rounded-full bg-white"></div>
                  {/if}
                </div>
              </div>
            </button>
          {/each}
        </div>

        <div class="space-y-4">
          {#if selectedNode}
            <div class="p-3 rounded-xl bg-gradient-to-r from-orange-500/25 to-red-600/25 border border-orange-500/35 flex items-center justify-between gap-3">
              <div>
                <p class="text-xs text-slate-400">Selected Region</p>
                <p class="text-sm font-bold text-white">{prettyText(selectedNode)}</p>
              </div>
              <a
                href="/signup/account"
                class="px-5 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-800 text-white font-semibold rounded-lg transition-all duration-300 shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 whitespace-nowrap text-sm"
              >
                Continue →
              </a>
            </div>
          {:else}
            <div class="p-5 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-between gap-4 opacity-50">
              <p class="text-sm text-slate-400">Choose a location to continue</p>
            </div>
          {/if}

          <p class="text-center text-xs text-slate-500">
            {@html $t("auth.loginLink")}
          </p>
        </div>
      </div>
    </div>
  </div>
</div>

<style lang="postcss">
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
</style>