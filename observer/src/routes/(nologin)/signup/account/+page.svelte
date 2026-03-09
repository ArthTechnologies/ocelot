<script>
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import EmailSigninNew from "$lib/components/ui/EmailSigninNew.svelte";
  import { env } from '$env/dynamic/public';

  import { t } from "$lib/scripts/i18n";
  import { getSettings } from "$lib/scripts/req";
  import { MapPin, User, ShoppingCart } from "lucide-svelte";

  let address;
  let plan = undefined;
  getSettings();

  if (browser) {
    plan = document.location.search.split("plan=")[1];
    address = window.location.host;
    if (window.location.protocol == "https:") {
      address = "https://" + address;
    } else {
      address = "http://" + address;
    }
  }

  function discord() {
    setTimeout(() => {
      goto("https://discord.com/api/oauth2/authorize?client_id=1025856388297150475&redirect_uri="+address+"/auth/discord&response_type=token&scope=email+identify");
    }, 100);
  }

  function googleSignup() {
    setTimeout(() => {
      const clientId = env.PUBLIC_GOOGLE_OAUTH_ID;
      const redirectUri = address + "/auth/google";
      const scope = "email profile";
      const responseType = "code";
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=${responseType}&scope=${encodeURIComponent(scope)}&access_type=online`;
      goto(googleAuthUrl);
    }, 100);
  }
</script>

<div class="bg-[url('/images/hostingbg3.png')] bg-cover hero min-h-screen relative overflow-hidden">
  <div class="absolute inset-0 bg-gradient-to-br from-slate-950/60 via-slate-900/60 to-slate-800/60 z-0"></div>

  <div class="relative z-10 w-full max-w-2xl mx-auto px-4 py-12 md:py-0">
    <div class="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden">
      <div class="bg-gradient-to-r from-orange-500/18 via-red-500/18 to-orange-500/18 border-b border-slate-700/50 px-4 md:px-8 py-6 md:py-8">
        <!-- Progress Steps - Hidden on mobile, shown on desktop -->
        <div class="hidden md:flex justify-center gap-8 mb-8">
          <div class="flex flex-col items-center gap-2 opacity-50">
            <div class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
              <MapPin size={20} class="text-slate-400" />
            </div>
            <span class="text-xs font-semibold text-slate-400">Location</span>
          </div>
          <div class="w-12 h-0.5 bg-slate-700 self-center"></div>
          <div class="flex flex-col items-center gap-2">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/50">
              <User size={20} class="text-white" />
            </div>
            <span class="text-xs font-semibold text-orange-400">Account</span>
          </div>
          <div class="w-12 h-0.5 bg-gradient-to-r from-orange-500/50 to-slate-700 self-center"></div>
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
            <User size={16} class="text-white" />
          </div>
          <span class="text-xs font-semibold text-orange-400">Step 2 of 3</span>
        </div>

        <h1 class="text-2xl md:text-4xl font-bold text-center text-white mb-2">{$t("auth.signup.h")}</h1>
        <p class="text-center text-slate-400 text-xs md:text-sm">Create your account to continue</p>
      </div>

      <div class="p-5 md:p-6">
        <div class="space-y-3 mb-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              on:click={discord}
              class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600/50 hover:bg-slate-700 hover:border-orange-500/50 transition-all text-white font-semibold text-sm"
            >
              <img alt="discord logo" style="width:1.2rem" src="/discord.svg" />
              Discord
            </button>
            <button
              on:click={googleSignup}
              class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600/50 hover:bg-slate-700 hover:border-orange-500/50 transition-all text-white font-semibold text-sm"
            >
              <img alt="google logo" style="width:1.2rem" src="/google.png" />
              Google
            </button>
          </div>
        </div>

        <div class="py-2.5 flex items-center gap-3">
          <div class="flex-1 border-t border-slate-700/50"></div>
          <span class="text-xs text-slate-400 whitespace-nowrap">Or use password</span>
          <div class="flex-1 border-t border-slate-700/50"></div>
        </div>

        <div class="mt-2.5">
          <EmailSigninNew sign="up" />
        </div>

        <p class="text-center text-xs text-slate-400 mt-4">
          {@html $t("auth.loginLink")}
        </p>
      </div>
    </div>
  </div>
</div>

<style lang="postcss">
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
</style>
