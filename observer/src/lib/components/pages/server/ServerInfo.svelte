<script>
    import { browser } from "$app/environment";
    import CopyButton from "$lib/components/buttons/CopyButton.svelte";
    import StorageLimit from "$lib/components/ui/StorageLimit.svelte";
    import { apiurl, setInfo } from "$lib/scripts/req";
    import { alert } from "$lib/scripts/utils";

    import { AlertCircleIcon, AlertOctagonIcon, ChevronRight, InfoIcon, PencilIcon } from "lucide-svelte";

    export let name = "Server Name";
    export let address = "127.0.0.1";
    export let port = 25565;
    export let subdomain = undefined;
    export let modded = false;
    export let geyser = false;
    export let description = "";

    let icon = "/images/placeholder.webp";
    let e2;
    let uploadState = 0;

    if (browser) {
      let id = localStorage.getItem("serverID");
      fetch(apiurl + "server/" + id + "/settings/icon", {
        method: "GET",
        headers: {
          token: localStorage.getItem("token"),
          username: localStorage.getItem("accountEmail"),
        },
      })
        .then((response) => response.blob())
        .then((blob) => {
          if (blob.size > 0) {
            icon = URL.createObjectURL(blob);
          }
        });
    }

    function handleIconChange() {
      const fileInput = document.getElementById("upload");
      if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = function (e) {
          const img = new Image();
          img.src = e.target.result;
          e2 = e.target.result;
          img.onload = function () {
            uploadState = (img.width != 64 || img.height != 64) ? 1 : 2;
          };
          document.getElementById("newImg").src = e.target.result;
        };
        reader.readAsDataURL(file);
      }
    }

    function uploadIcon() {
      const fileInput = document.getElementById("upload");
      if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append("file", file);
        let serverId = localStorage.getItem("serverID");
        fetch(apiurl + "server/" + serverId + "/settings/icon", {
          method: "POST",
          body: formData,
          headers: {
            token: localStorage.getItem("token"),
            username: localStorage.getItem("accountEmail"),
          },
        })
          .then((response) => response.json())
          .then((data) => {
            if (data.msg.includes("Success")) {
              icon = e2;
              // Nav's sidebar list keeps its own copy of every server's icon -
              // this is what tells it to refetch rather than reaching into its DOM directly.
              window.dispatchEvent(new CustomEvent("refreshIcons"));
            } else {
              alert(data.error, "error");
            }
          });
      }
    }

    // Name/description are saved through the same /settings endpoint Settings.svelte
    // uses - that route also expects proxiesEnabled/fSecret/javaVersion back on every
    // save, so those are fetched fresh when the modal opens and sent through unchanged.
    let editName = "";
    let editDesc = "";
    let editSecret = "";
    let editProxiesEnabled = false;
    let editJavaVersion = "0";

    function openEditModal() {
      editName = name;
      editDesc = description;
      uploadState = 0;

      if (browser) {
        let id = localStorage.getItem("serverID");
        fetch(apiurl + "server/" + id + "/settings", {
          method: "GET",
          headers: {
            token: localStorage.getItem("token"),
            username: localStorage.getItem("accountEmail"),
          },
        })
          .then((response) => response.json())
          .then((data) => {
            editSecret = data.secret || "";
            editProxiesEnabled = !!data.proxiesEnabled;
            editJavaVersion = data.javaVersion || "0";
          });
      }

      document.getElementById("editInfoModal").showModal();
    }

    function saveInfo() {
      const fileInput = document.getElementById("upload");
      if (fileInput.files.length > 0) uploadIcon();

      let id = localStorage.getItem("serverID");
      setInfo(id, icon, editDesc, editProxiesEnabled, editSecret, editJavaVersion, editName);

      name = editName;
      description = editDesc;
      localStorage.setItem("serverName", editName);
      alert("Server info updated.", "success");
      document.getElementById("editInfoModal").close();
    }
</script>
    <div
          class=" bg-base-300 w-full shadow-xl rounded-xl px-4 pt-4 pb-3 neutralGradientStroke"
        >
          <div class="flex flex-col items-center w-full md:w-[15rem]">

<div class="relative group flex gap-3 items-center w-full bg-base-200 rounded-lg p-2.5 shadow-md mb-2">
  <button
    on:click={openEditModal}
    class="absolute top-1 right-1 btn btn-ghost btn-xs btn-circle opacity-0 group-hover:opacity-100 transition-opacity"
    aria-label="Edit server info"
  >
    <PencilIcon size="13" />
  </button>
  <div class="w-12 h-12 flex-shrink-0">
    <img
      id="xIcon"
      src={icon}
      class="rounded-lg w-12 h-12 object-cover"
    />
  </div>
  <div class="flex flex-col w-full min-w-0">
    <div class="font-poppins-bold text-sm text-white break-words">
      {name}
    </div>
    {#if description}
    <div class="text-xs font-light text-gray-400 whitespace-pre-wrap break-words">
      {description}
    </div>
    {/if}
    <div id="rawDesc" class="hidden"></div>
  </div>
</div>

<dialog id="editInfoModal" class="modal">
  <div class="modal-box">
    <h3 class="text-lg font-bold">Edit Server Info</h3>

    <div class="flex gap-3 mt-5 items-center">
      <img src={icon} class="rounded-lg w-16 h-16 object-cover" />
      <ChevronRight size="32" />
      <img src={icon} id="newImg" class="rounded-lg w-16 h-16 object-cover" />
    </div>
    <input id="upload" type="file" accept="image/png" on:change={handleIconChange} class="mt-3 file-input file-input-bordered w-full max-w-xs" />
    {#if uploadState == 1}
      <div class="mt-3 bg-error w-86 rounded-lg text-black p-4 text-xl py-1.5 flex items-center space-x-2">
        <AlertCircleIcon size="20" />
        <span class="text-sm">Please convert your image to 64x64 pixels.</span>
      </div>
    {:else if uploadState == 2}
      <div class="mt-3 bg-success w-86 rounded-lg text-black p-4 text-xl py-1.5 flex items-center space-x-2">
        <AlertOctagonIcon size="20" />
        <span class="text-sm">Image is valid</span>
      </div>
    {:else}
      <div class="mt-3 bg-info w-86 rounded-lg p-4 text-black text-xl py-1.5 flex items-center space-x-2">
        <InfoIcon size="20" />
        <span class="text-sm">Upload a 64x64 image</span>
      </div>
    {/if}

    <label class="form-control w-full mt-4">
      <span class="label-text text-sm">Name</span>
      <input type="text" bind:value={editName} class="input input-bordered input-sm w-full mt-1" />
    </label>

    <label class="form-control w-full mt-3">
      <span class="label-text text-sm">Description</span>
      <textarea bind:value={editDesc} rows="2" class="textarea textarea-bordered textarea-sm w-full mt-1"></textarea>
    </label>

    <div class="modal-action">
      <button on:click={saveInfo} class="btn btn-neutral">Save</button>
      <form method="dialog">
        <button class="btn">Close</button>
      </form>
    </div>
  </div>
</dialog>

                  <div class="flex items-center gap-3.5 w-full">


           <div class="flex w-full">
               <div class="flex flex-col w-full">
               <span class="text-sm font-light  font-poppins mt-2">
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
<div class="mt-2 mb-1.5">
                <StorageLimit {modded}/>
              </div>
                <div id="rawDesc" class="hidden"></div>
              </div>


    
              
                  
           </div>
              
            </div>
          </div>
        </div>