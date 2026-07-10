<script lang="ts">
  import { browser } from "$app/environment";
  import File from "$lib/components/ui/files/File.svelte";
  import Folder from "$lib/components/ui/files/Folder.svelte";
  import FileUpload from "$lib/components/util/FileUpload.svelte";
  import { t } from "$lib/scripts/i18n";
  import { apiurl, getServerNode, usingOcelot } from "$lib/scripts/req";
  import { alert, downloadProgressShort } from "$lib/scripts/utils";
  import {
    ChevronDown,
    FolderClosed,
    ChevronRight,
    Trash2,
    Upload,
    AlertTriangle,
    Download,
    Loader,
  } from "lucide-svelte";
  
  // Fixed values for main folder
  export let foldername = "Main Folder";
  export let files = [];
  export let path = "*";
  
  let uploadpath = "*"; // Directly set to wildcard
  let open = false;
  let folderId;
  let id;
  let accountType;
  let downloadUrl;

  if (browser) {
    id = localStorage.getItem("serverID");
    if (localStorage.getItem("accountEmail").includes("@")) {
      accountType = "email";
    } else {
      accountType = localStorage.getItem("accountEmail").split(":")[0];
    }
  }

  function baseUrl() {
    return usingOcelot ? getServerNode(id) : apiurl;
  }

  let preparingDownload = false;
  let downloadError = "";

  // The key stored at login rotates out every 6 hours, and a stale one used to
  // make the browser download the 401 response body as a .json file.
  async function getDownloadUrl() {
    preparingDownload = true;
    downloadError = "";
    downloadUrl = "";
    try {
      const response = await fetch(baseUrl() + "server/" + id + "/files/key", {
        method: "GET",
        headers: {
          token: localStorage.getItem("token"),
          username: localStorage.getItem("accountEmail"),
        },
      });

      if (!response.ok) {
        let msg = "Couldn't create a download link. Refresh the page and try again.";
        try {
          const data = await response.json();
          if (data && data.msg) msg = data.msg;
        } catch {
          // non-JSON body
        }
        downloadError = msg;
        return;
      }

      const data = await response.json();
      localStorage.setItem("fileAccessKey", data.key);
      downloadUrl = baseUrl() + "server/" + id + "/files/mainfolder?key=" + data.key;
    } catch (err) {
      console.error("Error preparing download:", err);
      downloadError = "Couldn't create a download link — connection lost.";
    } finally {
      preparingDownload = false;
    }
  }

  folderId = Math.floor(Math.random() * 1000000000);

  function toggleOpen() {
    open = !open;
    if (open) {
      document.getElementById("toggleIndicator" + folderId).innerHTML = "";
      new ChevronRight({
        target: document.getElementById("toggleIndicator" + folderId),
      });
    } else {
      document.getElementById("toggleIndicator" + folderId).innerHTML = "";
      new ChevronDown({
        target: document.getElementById("toggleIndicator" + folderId),
      });
    }
  }

  function deleteFile() {
    let baseurl = apiurl;
    if (usingOcelot) baseurl = getServerNode(id);

    fetch(
      baseurl + "server/" + id + "/folder/" + uploadpath,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          token: localStorage.getItem("token"),
          username: localStorage.getItem("accountEmail"),
        },
        body: JSON.stringify({
          password: document.getElementById("password" + foldername).value,
        }),
      }
    )
      .then((response) => response.json())
      .then((data) => {
        if (data.msg == "Done") {
          document.getElementById("delete" + foldername).checked = false;
          const event = new CustomEvent("refresh");
          document.dispatchEvent(event);
        } else {
          alert("Error: " + data.msg);
        }
      });
  }



</script>

<div class="flex gap-1 justify-between">
  <b
    class="w-[78%] px-1.5 p-1 rounded-lg btn-ghost gap-1 flex items-center pointer-events-none"
   
  >
    <FolderClosed
      class="shrink-0 w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem]"
    />
    <p class="text-xs md:text-sm w-full">{foldername}</p>
    <p id="toggleIndicator{folderId}"></p>
</b>
  <div class="flex gap-1">
    <label
      for="delete{foldername}"
      class="px-1.5 p-1 rounded-lg btn-ghost cursor-pointer gap-1 flex items-center btn-disabled opacity-50"
    >
      <Trash2 class="w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem]" />
    </label>
    <label
      for="upload{foldername}"
      data-tip="Upload File"
      class="tooltip px-1.5 p-1 rounded-lg btn-ghost cursor-pointer gap-1 flex items-center"
    >
      <Upload class="w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem]" />
    </label>
    <label
      for="download{foldername}"
      on:click={() => getDownloadUrl()}
      class="px-1.5 p-1 rounded-lg btn-ghost cursor-pointer gap-1 flex items-center"
    >
      <Download class="w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem]" />
    </label>
  </div>
</div>

{#if open}
  <div class="ml-3 md:ml-5">
    <!-- Empty state since main folder has no files -->
    <p class="text-xs text-gray-400">{$t("server.files.empty")}</p>
  </div>
{/if}

<!-- Modals remain the same -->
<input type="checkbox" id="delete{foldername}" class="modal-toggle" />
<div class="modal" style="margin:0rem;">
  <div class="modal-box bg-opacity-95 backdrop-blur relative">
    <label
      for="delete{foldername}"
      class="btn btn-neutral btn-sm btn-circle absolute right-2 top-2">✕</label
    >
    <h3 class="text-lg font-bold">{$t("server.delete.title")}</h3>
    <div
      class="bg-warning w-86 rounded-lg text-black p-2 flex items-center mb-6 space-x-2 mt-2"
    >
      <AlertTriangle class="w-6 h-6" />
      <span class="text-sm"
        >Make sure you're deleting the main folder. This will remove all contents permanently.</span
      >
    </div>
    <div class="flex gap-1">
      {#if accountType == "email"}
        <input
          type="password"
          id="password{foldername}"
          class="input input-bordered input-error mr-1"
          placeholder={$t("typeYourPassword")}
        />
      {/if}
      <button on:click={deleteFile} id="delButton" class="btn btn-error">
        {$t("button.delete")}
      </button>
    </div>
  </div>
</div>

<input type="checkbox" id="upload{foldername}" class="modal-toggle" />
<div class="modal" style="margin:0rem;">
  <div class="modal-box bg-opacity-95 backdrop-blur relative">
    <label
      for="upload{foldername}"
      class="btn btn-neutral btn-sm btn-circle absolute right-2 top-2">✕</label
    >
    <h3 class="text-lg font-bold">Upload File to Main Folder</h3>
    <FileUpload {foldername} {uploadpath} {id} />
  </div>
</div>

<input type="checkbox" id="download{foldername}" class="modal-toggle" />
<div class="modal" style="margin:0rem;">
  <div class="modal-box bg-opacity-95 backdrop-blur relative">
    <label
      for="download{foldername}"
      class="btn btn-neutral btn-sm btn-circle absolute right-2 top-2">✕</label
    >
    <h3 class="text-lg font-bold mb-5">Download Main Folder</h3>
    {#if downloadError}
      <p class="text-error text-sm mb-2">{downloadError}</p>
      <button on:click={getDownloadUrl} class="btn btn-neutral btn-sm">Retry</button>
    {:else if preparingDownload}
      <button class="btn btn-accent btn-sm btn-disabled">
        <Loader class="w-4 h-4 animate-spin" />
      </button>
    {:else}
      <div class="flex gap-1">
        <a href={downloadUrl} download id="downloadBtn" class="btn btn-accent btn-sm"
          >{$t("button.download")}</a
        >
      </div>
    {/if}
  </div>
</div>