<script>
  import { onMount } from "svelte";
  import {  refreshApiUrl, signupEmail } from "$lib/scripts/req";
  import { loginEmail } from "$lib/scripts/req";
  import { t, locale, locales } from "$lib/scripts/i18n";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { fade } from "svelte/transition";
  import { Eye, EyeOff, ArrowRight } from "lucide-svelte";

  import { alert } from "$lib/scripts/utils";
  import { Turnstile } from "svelte-turnstile";

  let visible = false;

  let goodPwd = true;
  let matchPwd = true;
  let cloudflareVerified = false;
  let cloudflareVerifyToken = "";
  let cloudflareVerify = true;
  let cloudflareVerifyKey = "";
  let checkingIfCloudflareVerify = true;
  export let sign = "up";
  let pwdVisible = "password";
  let lang = "us";
  let plan = undefined;
  function pwdVisibility() {
    if (pwdVisible == "password") {
      pwdVisible = "text";
    } else {
      pwdVisible = "password";
    }
  }

  if (browser) {
    refreshApiUrl();
    if (localStorage.getItem("plan") == "plus") {
      plan = "plus";
    } else if (localStorage.getItem("plan") == "premium") {
      plan = "premium";
    } else if (localStorage.getItem("plan") == "basic") {
      plan = "basic";
    } 
    let intervalId = setInterval(() => {
      if (localStorage.getItem("enableCloudflareVerify") != undefined) {
        cloudflareVerify = JSON.parse(
          localStorage.getItem("enableCloudflareVerify")
        );
        cloudflareVerifyKey = localStorage.getItem("cloudflareVerifySiteKey");
        checkingIfCloudflareVerify = false;
        clearInterval(intervalId);
      }
    }, 50);

    lang = navigator.language;
    if (localStorage.getItem("lang") != null) {
      lang = localStorage.getItem("lang");
    }
    document.addEventListener("keyup", function (event) {
      if (event.keyCode === 13) {
        submit();
      }
    });
  }
  //set goodPwd to false if length of the element with id="pwd" is less than 8
  function checkPwd() {
    if (document.getElementById("pwd").value.length < 7) {
      goodPwd = false;
    } else {
      goodPwd = true;
    }
    console.log(goodPwd);
    if (
      document.getElementById("pwd").value !=
      document.getElementById("confPwd").value
    ) {
      matchPwd = false;
    } else {
      matchPwd = true;
    }
    console.log(matchPwd);
  }

  function submit() {
    if (sign == "up") {
      checkPwd();
      if (goodPwd && matchPwd) {
                    //this tells the navbar to update the icon that is highligted
                    window.dispatchEvent(new Event("redrict"));
        const res = signupEmail(
          document.getElementById("email").value,
          document.getElementById("pwd").value,
          cloudflareVerifyToken
        ).then((x) => {
          if (x === true) {
            console.log("redricting...");
            if (localStorage.getItem("mode") !== "solo") {
              if (localStorage.getItem("btest") == "true") {
                if (plan != undefined) {
                  goto("/signup/plans/" + plan);
                  return;
                } else {
                  goto("/signup/plans/");
                  return;
                }
              }
              //change this to your own stripe checkout link
              if (plan == undefined) {
                goto("/signup/subscribe/basic");
              } else {
                goto("/signup/subscribe/" + plan);
              }
            } else {
              goto("/");
              //this tells the navbar to update the icon that is highligted
              window.dispatchEvent(new Event("redrict"));
            }
          } else {
            if (x.includes("Email already exists"))
              alert($t("alert.emailAlreadyExists"));
            else if (x.includes("Password is too short"))
              alert($t("alert.passwordIsTooShort"));
            else alert(x);
          }
        });
      }
    } else if (sign == "in") {
 
     
   
       
       
          const res = loginEmail(
        document.getElementById("email").value,
        document.getElementById("pwd").value,
        cloudflareVerifyToken
      ).then((x) => {
      
        console.log("x: " + x);
        if (x === true) {
         
          console.log("REDIRECTING...");
          
        
            goto("/");
            //this tells the navbar to update the icon that is highligted
            window.dispatchEvent(new Event("redrict"));
            
         
        } else {
          visible = true;
          alert("Invalid email or password");
        }

      });
    
      
    }
  }
  $: if (!matchPwd) {
    alert($t("alert.passwordsDontMatch"));
  } else if (!goodPwd) {
    alert($t("alert.passwordIsTooShort"));
  }

  function cloudflareVerifyCallback(event) {
    setTimeout(() => {
      cloudflareVerified = true;
      cloudflareVerifyToken = event.detail.token;
    }, 600);
  }
</script>

<div class="relative">
  {#if sign === "in"}
    <div class="rounded-xl">
      <div class="text-center">
        <div class="max-w-md space-y-5">
          <div class="flex flex-col items-center space-y-4">
            <input
              id="email"
              type="text"
              placeholder={$t("auth.email")}
              class="input w-full bg-base-200"
            />

            <div class="w-full flex space-x-2">
              <div class="w-full flex space-x-2">
                <input
                  type={pwdVisible}
                  id="pwd"
                  placeholder={$t("auth.password")}
                  class="input w-full max-w-xs bg-base-200"
                />
                <label class="btn btn-circle swap swap-rotate btn-ghost mb-1">
                  <!-- this hidden checkbox controls the state -->
                  <input type="checkbox" on:click={pwdVisibility} />

                  <Eye size="28" class="swap-off" />

                  <EyeOff size="28" class="swap-on" />
                </label>
              </div>
            </div>
            <div class="w-[100%] flex justify-start h-[4.1rem]">
              {#if !checkingIfCloudflareVerify}
                <Turnstile
                  on:turnstile-callback={cloudflareVerifyCallback}
                  language={lang}
                  siteKey={cloudflareVerifyKey}
                />
              {/if}
            </div>
            <button on:click={submit} class="btn btn-neutral rounded-xl"
              >{$t("auth.continue")}<ArrowRight class="ml-1.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  {:else}
    <div class="rounded-xl">
      <div class=" text-center">
        <div class="max-w-md space-y-3">
          <div class="flex flex-col items-start space-y-2.5">
            <input
              id="email"
              type="text"
              placeholder={$t("auth.email")}
              class="w-full px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-orange-500/50 focus:bg-slate-700 transition-all"
            />
            <div class="w-full flex space-x-2">
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
            </div>
            <input
              type="password"
              id="confPwd"
              placeholder={$t("auth.confirmPassword")}
              class="w-full px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-orange-500/50 focus:bg-slate-700 transition-all"
            />

            <div class="space-y-2 flex flex-col md:items-start md:w-full">
              <div class="w-[100%] h-[65px] flex justify-start origin-top-left scale-90">
                {#if !checkingIfCloudflareVerify}
                  <Turnstile
                    on:turnstile-callback={cloudflareVerifyCallback}
                    language={lang}
                    siteKey={cloudflareVerifyKey}
                  />
                {/if}
              </div>
              <button on:click={submit} class="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-800 text-white font-semibold rounded-lg transition-all duration-300 shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 text-sm flex items-center gap-2 w-fit"
                >{$t("auth.continue")}<ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
