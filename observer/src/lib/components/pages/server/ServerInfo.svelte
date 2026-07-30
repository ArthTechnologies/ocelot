<script>
    import CopyButton from "$lib/components/buttons/CopyButton.svelte";
    import Versions from "$lib/components/buttons/Versions.svelte";
    import Software from "$lib/components/buttons/Software.svelte";
    import StorageLimit from "$lib/components/ui/StorageLimit.svelte";
    import World from "$lib/components/ui/World.svelte";

    export let name = "Server Name";
    export let address = "127.0.0.1";
    export let port = 25565;
    export let subdomain = undefined;
    export let modded = false;
    export let geyser = false;
    export let description = "";
</script>
    <div
          class=" bg-base-300 w-full shadow-xl rounded-xl px-4 py-3 neutralGradientStroke"
        >
        <p class=" font-bold font-ubuntu text-gray-100 mb-3">Server Info</p>
          <div class="flex flex-col items-center w-full md:w-[15rem]">

<div class="flex flex-col w-full">
  <span class="text-sm font-light font-poppins">
    Name
  </span>
  <div class="flex justify-between">
    <div class="font-mono text-sm text-white rounded flex gap-1 items-center -mt-1">
      {name}
    </div>
  </div>
  <div id="rawDesc" class="hidden"></div>
</div>

{#if description}
<div class="flex flex-col w-full">
  <span class="text-sm font-light font-poppins mt-3">
    Description
  </span>
  <div class="text-sm text-white rounded flex gap-1 items-center -mt-1 whitespace-pre-wrap break-words">
    {description}
  </div>
</div>
{/if}

                  <div class="flex items-center gap-3.5 w-full mt-3">
           

           <div class="flex w-full">
               <div class="flex flex-col w-full">
               <span class="text-sm font-light  font-poppins mt-3">
                  Java Address
                </span>
                <div class="flex justify-between">
                  <div class="font-mono text-sm  text-white  rounded flex gap-1 items-center -mt-1">
                  {#if subdomain == undefined}{address}:{port}{:else}
                    {subdomain}.{address}
                  {/if}
                  <CopyButton text={subdomain == undefined ? address + ":" + port : subdomain + "." + address} size="16" class="cursor-pointer"
                  />
            
                </div>

                </div>
 {#if geyser}
                  <div class="flex gap-3">
                   <div class="flex flex-col">
                <span class="text-sm font-light  font-poppins mt-1">
                  Bedrock Address
                </span>
                <div class="flex justify-between">
                  <div class="font-mono text-sm  text-white  rounded flex gap-1 items-center -mt-1">
{subdomain == undefined ? address : subdomain + "." + address}
                  <CopyButton text={subdomain == undefined ? address + ":" + port : subdomain + "." + address} size="16" class="cursor-pointer"
                  />
            
                </div>
              
                </div>
         </div>
                        <div class="flex flex-col">
                <span class="text-sm font-light  font-poppins mt-1">
                  Port
                </span>
                <div class="flex justify-between">
                  <div class="font-mono text-sm  text-white  rounded flex gap-1 items-center -mt-1">
{subdomain == undefined ? port : 19132}
                  <CopyButton text={subdomain == undefined ? address + ":" + port : subdomain + "." + address} size="16" class="cursor-pointer"
                  />
            
                </div>
              
                </div>
         </div>
  </div>
  {/if}
<div class="divider my-2"></div>
              <StorageLimit {modded}/>
                <div id="rawDesc" class="hidden"></div>
                  <div class="flex flex-col gap-1.5 w-full mt-3 mb-1.5 server-info-buttons items-center">
        <div class="flex gap-1 w-full">
          <div class="flex-1">
            <Versions />
          </div>
          <div class="flex-1">
            <World />
          </div>
        </div>
        <div>
          <Software />
        </div>

      </div>
              </div>


    
              
                  
           </div>
              
            </div>
          </div>
        </div>

<style>
  :global(.server-info-buttons .btn) {
    font-size: 0.75rem;
    padding: 0.375rem 0.75rem;
    height: auto;
    min-height: 2rem;
  }

  :global(.server-info-buttons .btn svg) {
    width: 16px;
    height: 16px;
  }
</style>