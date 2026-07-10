<script lang="ts">
  import { browser } from "$app/environment";
  import File from "$lib/components/ui/files/File.svelte";
  import Folder from "$lib/components/ui/files/Folder.svelte";
  import FileUpload from "$lib/components/util/FileUpload.svelte";
  import { t } from "$lib/scripts/i18n";
  import { apiurl, getServerNode, usingOcelot } from "$lib/scripts/req";
  import { alert, downloadProgressShort, fileSizeShort } from "$lib/scripts/utils";
  import {
    ChevronDown,
    FolderClosed,
    ChevronRight,
    Trash2,
    Upload,
    AlertTriangle,
    Download,
    Loader,
    MenuIcon,
  } from "lucide-svelte";
  export let foldername;
  export let files;
  export let path;
  export let size: number;
  let uniqueId = Math.floor(Math.random() * 1000000000);
  let uploadpath;
  let open = false;
  let folderId;
  let id;
  let accountType;
  let downloadUrl;

  if (browser) {
    id = localStorage.getItem("serverID");
    if (path != undefined) {
      if (path.includes("/" + id + "//"))
        uploadpath = path
          .split("/" + id + "//")[1]
          .split("/")
          .join("*");
      if (path.includes("/" + id + "/"))
        uploadpath = path
          .split("/" + id + "/")[1]
          .split("/")
          .join("*");
    }
    

    

  

    if (localStorage.getItem("accountEmail").includes("@")) {
      accountType = "email";
    } else {
      accountType = localStorage.getItem("accountEmail").split(":")[0];
    }
  }
  //folder ID is a random number.
  folderId = Math.floor(Math.random() * 1000000000);

  // Requests for this server have to go to the node that holds it.
  function baseUrl() {
    return usingOcelot ? getServerNode(id) : apiurl;
  }

  function refresh() {
    document.dispatchEvent(new CustomEvent("refresh"));
  }

  function closeModal(prefix: string) {
    const box = document.getElementById(prefix + uniqueId) as HTMLInputElement;
    if (box) box.checked = false;
  }

  async function errorFrom(response: Response, fallback: string) {
    try {
      const data = await response.json();
      if (data && data.msg) return data.msg;
    } catch {
      // non-JSON body (an HTML error page, usually)
    }
    return fallback;
  }

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

  let deleting = false;
  let deleteError = "";

  async function deleteFile() {
    //remove any double slashes
    path = path.replace(/\/\//g, "/");

    // path.split("servers/<id>")[1] is undefined for any unexpected shape, which
    // used to throw before the request was ever sent.
    const relative = path.split("servers/" + id)[1];
    if (relative === undefined) {
      deleteError = "Something went wrong building the request. Refresh and retry.";
      return;
    }

    deleting = true;
    deleteError = "";
    try {
      const response = await fetch(
        baseUrl() +
          "server/" +
          id +
          "/files/delete/" +
          relative.split("/").join("*") +
          "?folder=true",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            token: localStorage.getItem("token"),
            username: localStorage.getItem("accountEmail"),
          },
        }
      );

      if (!response.ok) {
        deleteError = await errorFrom(response, "Couldn't delete the folder. Try again.");
        if (response.status === 404) refresh();
        return;
      }

      closeModal("delete");
      refresh();
    } catch (err) {
      console.error("Error deleting folder:", err);
      deleteError = "Couldn't delete the folder — connection lost.";
    } finally {
      deleting = false;
    }
  }

  let downloading = false;
  let downloadProgress = "0/0MB";
  let gradientBackground = "#1fb2a5";



    if (browser) {
    //if the user clicks outside the dropdown, close it
    document.addEventListener("click", (event) => {
      const dropdown = document.getElementById("dropdown" + uniqueId);
      const target = event.target as HTMLElement;
      if (dropdown && !dropdown.contains(target)) {
        dropdown.removeAttribute("open");
      }
    });
  }

  let renaming = false;
  let renameError = "";
  let renameValue = "";
  $: renameValid =
    renameValue.trim().length > 0 &&
    renameValue !== foldername &&
    !renameValue.includes("/") &&
    !renameValue.includes("*");

  async function rename() {
    path = path.replace(/\/\//g, "/");
    renaming = true;
    renameError = "";
    try {
      const response = await fetch(baseUrl() + "server/" + id + "/files/rename/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          token: localStorage.getItem("token"),
          username: localStorage.getItem("accountEmail"),
        },
        body: JSON.stringify({
          from: uploadpath,
          to: renameValue,
        }),
      });

      if (!response.ok) {
        renameError = await errorFrom(response, "Rename failed. Try again.");
        if (response.status === 404) refresh();
        return;
      }

      closeModal("rename");
      refresh();
    } catch (err) {
      console.error("Error renaming folder:", err);
      renameError = "Rename failed — connection lost.";
    } finally {
      renaming = false;
    }
  }

  let preparingDownload = false;
  let downloadError = "";

  // Access keys rotate every 6 hours, so the localStorage copy goes stale and
  // the browser silently downloads a 401 JSON body. Mint a fresh key instead.
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
        downloadError = await errorFrom(
          response,
          "Couldn't create a download link. Refresh the page and try again."
        );
        return;
      }

      const data = await response.json();
      localStorage.setItem("fileAccessKey", data.key);
      downloadUrl =
        baseUrl() +
        "server/" +
        id +
        "/files/download/" +
        uploadpath +
        "?key=" +
        data.key;
    } catch (err) {
      console.error("Error preparing download:", err);
      downloadError = "Couldn't create a download link — connection lost.";
    } finally {
      preparingDownload = false;
    }
  }
</script>

<div class="flex gap-1 justify-between">
  <a
    class="w-[75%] px-1.5 p-1 rounded-lg btn-ghost gap-1 flex items-center cursor-pointer"
    on:click={toggleOpen}
  >
    <FolderClosed
      class="shrink-0 w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem]"
    />
    <p class="text-xs md:text-sm w-full">{foldername}</p>

    {#if files.length >= 1}
      <p id="toggleIndicator{folderId}"><ChevronDown /></p>
    {/if}
  </a>
  <div class="flex gap-1 items-center">
    <div
  
    class="px-1.5 h-5 rounded-lg  text-xs outline outline-1 gap-1 flex items-center mr-0.5"
  >
    {fileSizeShort(size)}
    </div>
    <details id="dropdown{uniqueId}" class="dropdown dropdown-end">

  <summary class="px-1.5 p-1 rounded-lg btn-ghost cursor-pointer gap-1 flex items-center">     <MenuIcon class="w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem]" /></summary>
  <ul class="z-50 menu dropdown-content bg-neutral bg-opacity-75 backdrop-blur rounded-box z-1 w-32 p-1.5 shadow-sm">
    <li>    <label
      for="delete{uniqueId}"

    >
      Delete
    </label></li>
    <li>
      <label
        for="rename{uniqueId}"

      >
        Rename
      </label>
    </li>
  </ul>
</details>
    <label
      for="upload{uniqueId}"
      data-tip="Upload File"
      class="tooltip px-1.5 p-1 rounded-lg btn-ghost cursor-pointer gap-1 flex items-center"
    >
      <Upload class="w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem]" />
    </label>
    <label
      for="download{uniqueId}"
      on:click={() => getDownloadUrl()}
      class="px-1.5 p-1 rounded-lg btn-ghost cursor-pointer gap-1 flex items-center"
    >
      <Download class="w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem]" />
    </label>
  </div>
</div>
{#if open}
  <div class="ml-3 md:ml-5">
    {#each files as file}
      {#if typeof file == "string"}
        <File filename={file.split(":")[0]} url={file.split(":")[1]} size={file.split(":")[2]}
         />
      {:else}
        <Folder
          foldername={file[0].split(":")[0]}
          files={file[1]}
          path={file[0].split(":")[1]}
          size={file[0].split(":")[2]}
        />
      {/if}
    {/each}
  </div>
{/if}

<!-- Put this part before </body> tag -->
<input type="checkbox" id="delete{uniqueId}" class="modal-toggle" />
<div class="modal" style="margin:0rem;">
  <div class="modal-box bg-opacity-95 backdrop-blur relative">
    <label
      for="delete{uniqueId}"
      class="btn btn-neutral btn-sm btn-circle absolute right-2 top-2">✕</label
    >
    <h3 class="text-lg font-bold">{$t("server.delete.title")}</h3>
    <div
      class="bg-warning w-86 rounded-lg text-black p-2 flex items-center mb-6 space-x-2 mt-2"
    >
      <AlertTriangle class="w-6 h-6" />
      <span class="text-sm"
        >Make sure that you are deleting the right file, you won't be able to
        recover <b>{foldername}</b>.</span
      >
    </div>
    {#if deleteError}
      <p class="text-error text-sm mb-2">{deleteError}</p>
    {/if}
    <div class="flex gap-1">
      <button
        on:click={deleteFile}
        id="delButton"
        class="btn btn-error"
        class:btn-disabled={deleting}
      >
        {#if deleting}
          <Loader class="w-4 h-4 animate-spin" />
        {:else}
          {$t("button.delete")}
        {/if}
      </button>
    </div>
  </div>
</div>

<input
  type="checkbox"
  id="rename{uniqueId}"
  class="modal-toggle"
/>
<div class="modal" style="margin:0rem;">
  <div class="modal-box bg-opacity-95 backdrop-blur relative">
    <label
      for="rename{uniqueId}"
      class="btn btn-neutral btn-sm btn-circle absolute right-2 top-2">✕</label
    >
    <h3 class="text-lg font-bold mb-2">Rename Folder</h3>
<div class="flex gap-2 w-2/3 items-center mb-5">
  <div class="bg-neutral rounded-lg text-sm h-8 py-2 px-4">
    {foldername}
  </div>
  <ChevronRight size=32 />
      <input
      bind:value={renameValue}
      type="text"
      id="renameInput{uniqueId}"
      placeholder="newname"
      class="input input-bordered input-sm w-full"
    />
</div>
    {#if renameError}
      <p class="text-error text-sm mb-2">{renameError}</p>
    {/if}
    <div class="flex gap-1">
      <button
        on:click={rename}
        id="renameBtn{uniqueId}"
        class="btn btn-success"
        class:btn-disabled={!renameValid || renaming}
      >
        {#if renaming}
          <Loader class="w-4 h-4 animate-spin" />
        {:else}
          Rename
        {/if}
      </button>
    </div>
  </div>
</div>


<!-- Put this part before </body> tag -->
<input type="checkbox" id="upload{uniqueId}" class="modal-toggle" />
<div class="modal" style="margin:0rem;">
  <div class="modal-box bg-opacity-95 backdrop-blur relative">
    <label
      for="upload{uniqueId}"
      class="btn btn-neutral btn-sm btn-circle absolute right-2 top-2">✕</label
    >
    <h3 class="text-lg font-bold">Upload File to /{foldername}</h3>

    <FileUpload {foldername} {uploadpath} {id} />
  </div>
</div>

<!-- Put this part before </body> tag -->
<input type="checkbox" id="download{uniqueId}" class="modal-toggle" />
<div class="modal" style="margin:0rem;">
  <div class="modal-box bg-opacity-95 backdrop-blur relative">
    <label
      for="download{uniqueId}"
      class="btn btn-neutral btn-sm btn-circle absolute right-2 top-2">✕</label
    >
    <h3 class="text-lg font-bold mb-5">Download /{ foldername }</h3>

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
