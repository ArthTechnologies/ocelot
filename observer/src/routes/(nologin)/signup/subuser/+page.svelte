<script>
  // Hidden, link-only signup page for sub-user accounts (accounts meant to be
  // added to someone else's server via allowAccount, not to buy a plan).
  // Deliberately not linked from anywhere - reachable only by direct URL.
  import { browser } from "$app/environment";
  import { t } from "$lib/scripts/i18n";
  import { signupEmail, getSettings } from "$lib/scripts/req";
  import { Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle2, Copy, Check } from "lucide-svelte";
  import { Turnstile } from "svelte-turnstile";

  let pwdVisible = "password";
  let signupError = "";
  let submitting = false;
  let created = false;
  let createdAccountId = "";
  let copied = false;

  let cloudflareVerify = true;
  let cloudflareVerifyKey = "";
  let cloudflareVerifyToken = "";
  let checkingIfCloudflareVerify = true;
  let lang = "us";

  if (browser) {
    getSettings();
    let intervalId = setInterval(() => {
      if (localStorage.getItem("enableCloudflareVerify") != undefined) {
        cloudflareVerify = JSON.parse(localStorage.getItem("enableCloudflareVerify"));
        cloudflareVerifyKey = localStorage.getItem("cloudflareVerifySiteKey");
        checkingIfCloudflareVerify = false;
        clearInterval(intervalId);
      }
    }, 50);
    lang = navigator.language;
    if (localStorage.getItem("lang") != null) {
      lang = localStorage.getItem("lang");
    }
  }

  function cloudflareVerifyCallback(event) {
    setTimeout(() => {
      cloudflareVerifyToken = event.detail.token;
    }, 600);
  }

  function pwdVisibility() {
    pwdVisible = pwdVisible === "password" ? "text" : "password";
  }

  function submit() {
    signupError = "";
    const email = document.getElementById("email").value;
    const pwd = document.getElementById("pwd").value;
    const confPwd = document.getElementById("confPwd").value;

    if (pwd.length < 7) {
      signupError = $t("alert.passwordIsTooShort");
      return;
    }
    if (pwd !== confPwd) {
      signupError = $t("alert.passwordsDontMatch");
      return;
    }

    submitting = true;
    signupEmail(email, pwd, cloudflareVerifyToken).then((x) => {
      submitting = false;
      if (x === true) {
        created = true;
        createdAccountId = localStorage.getItem("accountId") || "";
      } else if (typeof x !== "string") {
        signupError = "Something went wrong. Please try again.";
      } else {
        signupError = x;
      }
    });
  }

  function copyAccountId() {
    navigator.clipboard.writeText(createdAccountId);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<div class="bg-[url('/images/hostingbg3.png')] bg-cover hero min-h-screen relative overflow-hidden">
  <div class="absolute inset-0 bg-gradient-to-br from-slate-950/60 via-slate-900/60 to-slate-800/60 z-0"></div>

  <div class="relative z-10 w-full max-w-md mx-auto px-4 py-12 md:py-0">
    <div class="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden">
      <div class="bg-gradient-to-r from-orange-500/18 via-red-500/18 to-orange-500/18 border-b border-slate-700/50 px-4 md:px-8 py-6 md:py-8">
        <h1 class="text-2xl md:text-3xl font-bold text-center text-white mb-2">Create sub-user account</h1>
        <p class="text-center text-slate-400 text-xs md:text-sm">
          This creates a plain account with no plan or checkout. Share the account ID below with a
          server owner so they can grant it access.
        </p>
      </div>

      <div class="p-5 md:p-6">
        {#if created}
          <div class="flex flex-col items-center text-center space-y-4">
            <CheckCircle2 size={40} class="text-green-400" />
            <p class="text-white font-semibold">Account created</p>
            <p class="text-slate-400 text-sm">
              Give this account ID to the server owner - they can add it under their server's
              Settings to grant access.
            </p>
            <div class="w-full flex items-center gap-2">
              <code class="flex-1 px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white text-sm break-all text-left">
                {createdAccountId}
              </code>
              <button
                on:click={copyAccountId}
                class="btn btn-sm btn-square bg-slate-700/50 border border-slate-600/50 hover:bg-slate-700"
                title="Copy account ID"
              >
                {#if copied}
                  <Check size={16} class="text-green-400" />
                {:else}
                  <Copy size={16} class="text-slate-300" />
                {/if}
              </button>
            </div>
            <a href="/" class="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-800 text-white font-semibold rounded-lg transition-all duration-300 shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 text-sm flex items-center gap-2 w-fit">
              Continue to dashboard<ArrowRight size={16} />
            </a>
          </div>
        {:else}
          <div class="flex flex-col items-start space-y-2.5">
            <input
              id="email"
              type="text"
              placeholder={$t("auth.email")}
              class="w-full px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-orange-500/50 focus:bg-slate-700 transition-all"
            />
            <div class="w-full flex space-x-2">
              <input
                type={pwdVisible}
                id="pwd"
                placeholder={$t("auth.password")}
                class="w-full px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-orange-500/50 focus:bg-slate-700 transition-all"
              />
              <button on:click={pwdVisibility} class="px-2 py-2 text-slate-400 hover:text-slate-200 transition-colors">
                {#if pwdVisible === "password"}
                  <Eye size={20} />
                {:else}
                  <EyeOff size={20} />
                {/if}
              </button>
            </div>
            <input
              type="password"
              id="confPwd"
              placeholder={$t("auth.confirmPassword")}
              class="w-full px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-orange-500/50 focus:bg-slate-700 transition-all"
            />

            {#if signupError}
              <div
                role="alert"
                class="w-full flex gap-2 items-start px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-200 text-xs text-left"
              >
                <span class="shrink-0 mt-0.5"><AlertCircle size={16} /></span>
                <span>{signupError}</span>
              </div>
            {/if}

            <div class="space-y-2 flex flex-col md:items-start md:w-full">
              <div class="w-[100%] h-[65px] flex justify-start origin-top-left scale-90">
                {#if !checkingIfCloudflareVerify && cloudflareVerify}
                  <Turnstile
                    on:turnstile-callback={cloudflareVerifyCallback}
                    language={lang}
                    siteKey={cloudflareVerifyKey}
                  />
                {/if}
              </div>
              <button
                on:click={submit}
                disabled={submitting}
                class="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-800 disabled:opacity-60 text-white font-semibold rounded-lg transition-all duration-300 shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 text-sm flex items-center gap-2 w-fit"
                >{submitting ? "Creating..." : "Create account"}<ArrowRight size={16} />
              </button>
            </div>
          </div>

          <p class="text-center text-xs text-slate-400 mt-4">
            {@html $t("auth.loginLink")}
          </p>
        {/if}
      </div>
    </div>
  </div>
</div>

<style lang="postcss">
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
</style>
