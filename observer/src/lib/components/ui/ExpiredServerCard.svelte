<script lang="ts">
  import { onMount, src_url_equal } from "svelte/internal";
  import { changeServerState } from "$lib/scripts/req";

  import { getServer } from "$lib/scripts/req";
  import { t, locale, locales } from "$lib/scripts/i18n";
  import { browser } from "$app/environment";
  import { AlertOctagon, ArrowRight, Loader, Plus, PlusIcon } from "lucide-svelte";
  //Status variables

  let startcolor = "accent";
  let starttext = "Start";
  let loading = false;
  let email = "noemail";
  let softwareType = "server";
  let address;
  
  if (browser) {
    address = localStorage.getItem("address")
  }
  let po = "?";
  let apo = 0;
  let lock = false;
  //Software variables
  type serverType =
    | "paper"
    | "spigot"
    | "bukkit"
    | "waterfall"
    | "velocity"
    | "forge"
    | "fabric"
    | "quilt"
    | "mohist"
    | "vanilla";

  export let id: number;
  export let timestamp: number = 0;
  export let cause: string = "unknown";
  export let errorCode: number = 100;

  const daysUntil = timestamp => Math.ceil((timestamp * 1000 - Date.now()) / (1000 * 60 * 60 * 24));

  const causeText = (cause: string) => {
    if (cause === "payment_failed") return "Unable to charge payment method.";
    if (cause === "canceled") return "Subscription was cancelled.";
    return null;
  };
</script>


<div

  class="bg-base-300 w-[3.75rem] h-[3.75rem] rounded-lg max-lg:hidden flex justify-center items-center"
><AlertOctagon size=32/></div>
<div class="-mt-1">
  <p class="font-poppins-bold text-gray-200 text-sm truncate max-md:hidden">
    {#if errorCode === 100 || errorCode === 103 || errorCode === 104 || errorCode === 105 || errorCode === 106}
      Expired Server
    {:else}
      Error code {errorCode}
    {/if}
  </p>
  <div class="md:hidden flex items-center justify-center"><PlusIcon size=20/></div>
  <!-- Only shows in sidebar mode-->
  <div class="max-md:hidden">
    {#if errorCode === 100}
      <p class="font-poppins text-xs mb-0.5 -mt-1">
        Your subscription has expired. Your data is still there but may be deleted soon.
      </p>
    {:else if errorCode === 103}
      <p class="font-poppins text-xs mb-0.5 -mt-1">
        This is a complicated error stemming from a possible expired subscription that is no longer expired. Please contact support.
      </p>
    {:else if errorCode === 104}
      <p class="font-poppins text-xs mb-0.5 -mt-1">
        Your subscription has expired. It looks like your data has been deleted, but you can contact support to double-check.
      </p>
    {:else if errorCode === 105}
      <p class="font-poppins text-xs mb-0.5 -mt-1">
        This is a complicated error stemming from a possible expired subscription that is no longer expired. Please contact support.
      </p>
    {:else if errorCode === 106}
      <p class="font-poppins text-xs mb-0.5 -mt-1">
        Your subscription has expired. Your server data is still intact — renew to restore access.
      </p>
    {:else}
      <p class="font-poppins text-xs mb-0.5 -mt-1">
        Unknown error.
      </p>
    {/if}
  </div>
</div>

<style>
  .primaryGradientStroke {
    position: relative;

    z-index: 1;
  }

  .primaryGradientStroke::before {
    content: "";
    position: absolute;
    top: 0px;

    bottom: 0px;
    left: 0px;
    right: 0px;
    border-radius: inherit; /* Inherits button's border-radius */
    padding: 2.5px; /* Space between button and border */
    background: linear-gradient(0deg, #135664, #ffffff00, #ffffff00, #ffffff00);
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: destination-out;
    mask-composite: exclude;
    z-index: -1;
  }

  .neutralGradientStroke {
    position: relative;

    z-index: 1;
  }

  .neutralGradientStroke:hover::before {
    content: "";
    position: absolute;
    top: 0px;

    bottom: 0px;
    left: 0px;
    right: 0px;
    border-radius: inherit; /* Inherits button's border-radius */
    padding: 2.5px; /* Space between button and border */
    background: linear-gradient(0deg, #2a354e, #ffffff00, #ffffff00, #ffffff00);
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: destination-out;
    mask-composite: exclude;
    z-index: -1;
  }
</style>
