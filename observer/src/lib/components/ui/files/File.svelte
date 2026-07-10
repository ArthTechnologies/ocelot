<script lang="ts">
  import { browser } from "$app/environment";
  import { t } from "$lib/scripts/i18n";
  export let url: string;
  export let filename: string;
  export let size: number;
  import { apiurl, usingOcelot, getServerNode } from "$lib/scripts/req";
  import { alert, downloadProgressShort, fileSizeShort } from "$lib/scripts/utils";
  import {
    File,
    FileText,
    Image,
    Trash2,
    Upload,
    AlertTriangle,
    FileDown,
    Download,
    Loader,
    FileLock2,
    PackageOpen,
    Package,
    FileBox,
    Box,
    MenuIcon,
    ChevronRight,
  } from "lucide-svelte";
  let id;
  let extension = filename.split(".")[filename.split(".").length - 1];

  // Handle multi-dot extensions like .tar.gz, .tar.bz2
  const parts = filename.split(".");
  if (parts.length > 2) {
    const lastTwo = parts[parts.length - 2] + "." + parts[parts.length - 1];
    if (["tar.gz", "tar.bz2", "tar.xz"].includes(lastTwo.toLowerCase())) {
      extension = lastTwo;
    }
  }

  let clickable = "auto";
  let accountType = "email";
  let uniqueId = Math.floor(Math.random() * 1000000000);
  let downloadUrl = "";
  let key = "";

  if (browser) {
    id = localStorage.getItem("serverID");
    if (localStorage.getItem("accountEmail").includes("@")) {
      accountType = "email";
    } else {
      accountType = localStorage.getItem("accountEmail").split(":")[0];
    }
    if (url != undefined) {
      if (url.includes("//")) {
        url = url.split("//")[1];
        if (url.includes("/")) {
          url = url.split("/").join("*");
        }
      }
      if (url.includes("/")) {
        url = url.split("/").join("*");
      }
      if (url.includes("servers*" + id + "*")) {
        url = url.split("servers*" + id + "*")[1];
      }
    }
  }

     key = localStorage.getItem("fileAccessKey");

  // Requests for this server have to go to the node that holds it, not the
  // panel's default API host.
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

  // Every handler below used to act only on the success case, so a 401/404/500
  // left the modal open with no explanation.
  async function errorFrom(response: Response, fallback: string) {
    try {
      const data = await response.json();
      if (data && data.msg) return data.msg;
    } catch {
      // non-JSON body (an HTML error page, usually)
    }
    return fallback;
  }

  switch (extension) {
    case "png":
    case "jpg":
    case "jpeg":
    case "zip":
    case "jar":
      clickable = "none";
      break;
    default:
      clickable = "auto";
      break;
  }
  if (filename == "server.json") {
    clickable = "none";
  }

  async function getText() {
    try {
      const response = await fetch(baseUrl() + "server/" + id + "/files/read/" + url, {
        method: "GET",
        headers: {
          token: localStorage.getItem("token"),
          username: localStorage.getItem("accountEmail"),
        },
      });

      if (!response.ok) {
        // 404 means the tree is stale; 413/415 mean the file isn't editable.
        // Either way the editor must not open on the error text.
        alert(await errorFrom(response, "Couldn't open the file. Try refreshing or logging in again."), "error");
        if (response.status === 404) refresh();
        return;
      }

      const data = await response.json();
      let content = (data.content ?? "").replace(/\\n/g, "\n").replace(/\\"/g, '"');
      //broadcast openTextEditor event
      const event = new CustomEvent("openTextEditor", {
        detail: {
          content: content,
          filename: filename,
          path: url.split("*").join("/"),
        },
      });
      document.dispatchEvent(event);
    } catch (err) {
      console.error("Error reading file:", err);
      alert("Couldn't open the file — connection lost.", "error");
    }
  }

  let deleting = false;
  let deleteError = "";

  async function deleteFile() {
    deleting = true;
    deleteError = "";
    try {
      const response = await fetch(baseUrl() + "server/" + id + "/files/delete/" + url, {
        method: "POST",
        headers: {
          token: localStorage.getItem("token"),
          username: localStorage.getItem("accountEmail"),
        },
      });

      if (!response.ok) {
        deleteError = await errorFrom(response, "Couldn't delete the file. Try again.");
        // The tree is out of date either way — pull it fresh.
        if (response.status === 404) refresh();
        return;
      }

      closeModal("delete");
      refresh();
    } catch (err) {
      console.error("Error deleting file:", err);
      deleteError = "Couldn't delete the file — connection lost.";
    } finally {
      deleting = false;
    }
  }

  let extracting = false;
  let extractProgress = 0;
  let extractError = "";

  async function extractFile() {
    //if url starts with /, remove it
    if (url.startsWith("/")) {
      url = url.substring(1);
    }
    extracting = true;
    extractProgress = 0;
    extractError = "";
    let done = false;
    try {
      const response = await fetch(
        `${baseUrl()}server/${id}/files/extract/${url.split("/").join("*")}`,
        {
          method: "POST",
          headers: {
            token: localStorage.getItem("token"),
            username: localStorage.getItem("accountEmail"),
          },
        }
      );

      // The backend streams newline-delimited JSON progress events.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Parse one NDJSON line, updating progress / error / done state.
      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const data = JSON.parse(trimmed);
          if (typeof data.progress === "number") extractProgress = data.progress;
          if (data.error) extractError = data.error;
          if (data.msg === "Done") done = true;
        } catch {
          // Non-JSON body (e.g. an unexpected error page) — show it raw.
          extractError = trimmed;
        }
      };

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          handleLine(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
        }
      }
      // Flush any trailing content with no final newline. Auth/validation
      // rejections (400/401) come back as a single JSON object like this.
      if (buffer.trim()) handleLine(buffer);

      // Network reached the server but it refused the request and sent no
      // usable error payload — surface a status-based fallback.
      if (!response.ok && !extractError && !done) {
        extractError = `Extraction failed (HTTP ${response.status}).`;
      }

      if (done) {
        closeModal("extract");
        refresh();
      }
    } catch (err) {
      console.error("Error extracting file:", err);
      extractError = "Extraction failed.";
    } finally {
      extracting = false;
    }
  }

  let renaming = false;
  let renameError = "";
  let renameValue = "";
  // The old handler read the input, appended the missing extension to the DOM
  // node, then sent the *pre-append* string. Deriving both from one value fixes
  // that and keeps the button state in sync without touching classList.
  $: renameValid =
    renameValue.trim().length > 0 &&
    renameValue !== filename &&
    renameValue.includes(".") &&
    !renameValue.includes("/") &&
    !renameValue.includes("*");

  async function rename() {
    //if the new name does not include the extension, add it
    let newName = renameValue;
    if (!newName.includes("." + extension)) {
      newName = newName + "." + extension;
      renameValue = newName;
    }

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
          from: url,
          to: newName,
        }),
      });

      if (!response.ok) {
        // 409 duplicate, 404 gone, 400 protected/invalid, 500 fs error — the
        // backend already distinguishes all of these.
        renameError = await errorFrom(response, "Rename failed. Try again.");
        if (response.status === 404) refresh();
        return;
      }

      closeModal("rename");
      refresh();
    } catch (err) {
      console.error("Error renaming file:", err);
      renameError = "Rename failed — connection lost.";
    } finally {
      renaming = false;
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

  let preparingDownload = false;
  let downloadError = "";

  // File access keys rotate every 6 hours and on restart, so the copy in
  // localStorage goes stale and the download 401s into a saved .json file.
  // Mint a fresh one when the modal opens instead.
  async function setDownloadUrl() {
    if (url.includes("servers/" + id + "/")) {
      url = url.split("servers/" + id + "/")[1];
    }
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
        url.split("/").join("*") +
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
  <button
    on:click={getText}
    class="w-[65%] px-1.5 p-1 rounded-lg btn-ghost pointer-events-{clickable} gap-1 flex items-center"
  >
    {#if filename == "server.json" || filename == "server.jar"}
      <FileLock2 class="shrink-0 w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem]" />
    {:else if extension == "jar"}
      <Box class="shrink-0 w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem]" />
    {:else if extension == "png" || extension == "jpg" || extension == "jpeg"}
      <Image class="shrink-0 w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem]" />
    {:else if extension == "zip"}
      <Package class="shrink-0 w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem]" />
    {:else if extension == "yml" || extension == "yaml" || extension == "json" || extension == "txt"}
      <FileText class="shrink-0 w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem]" />
    {:else}
      <File class="shrink-0 w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem]" />
    {/if}
    <p
      class="text-xs md:text-sm truncate w-[8rem] md:w-[14rem] flex justify-left"
    >
      {filename}
    </p>
  </button>
  <div class="flex gap-1 items-center">
    {#if filename.includes(".zip")}
      <label
        for="extract{uniqueId}"
        class="px-1.5 p-1 rounded-lg btn-ghost cursor-pointer gap-1 flex items-center"
      >
        <PackageOpen class="w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem]" />
      </label>
    {/if}
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
        {#if filename.includes(".zip")}
    <li>
      <label
        for="extract{uniqueId}"

      >
        Extract
      </label>
    </li>
    {/if}
  </ul>
</details>
    <label
      for="upload"
      data-tip="Upload"
      class="tooltip px-1.5 p-1 rounded-lg btn-ghost cursor-pointer gap-1 flex items-center btn-disabled opacity-50"
    >
      <Upload class="w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem]" />
    </label>
    <label
      for="download{uniqueId}"
      on:click={() => {
        setDownloadUrl();
      }}
      class="px-1.5 p-1 rounded-lg btn-ghost cursor-pointer gap-1 flex items-center"
    >
      <Download class="w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem]" />
    </label>
  </div>
</div>
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
        recover <b>{filename}</b>.</span
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
    <h3 class="text-lg font-bold mb-2">Rename File</h3>
<div class="flex gap-2 w-2/3 items-center mb-5">
  <div class="bg-neutral rounded-lg text-sm h-8 py-2 px-4">
    {filename}
  </div>
  <ChevronRight size=32 />
      <input
      bind:value={renameValue}
      type="text"
      id="renameInput{uniqueId}"
      placeholder="newname.{extension}"
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

{#if filename.includes(".zip")}
  <!-- Extract Modal -->
  <input type="checkbox" id="extract{uniqueId}" class="modal-toggle" />
  <div class="modal" style="margin:0rem;">
    <div class="modal-box bg-opacity-95 backdrop-blur relative">
      <label
        for="extract{uniqueId}"
        class="btn btn-neutral btn-sm btn-circle absolute right-2 top-2"
        >✕</label
      >
      <h3 class="text-lg font-bold mb-5">Extract {filename}</h3>
      <p class="mb-5">
        The contents of this will be extracted to <code
          class="bg-base-300 px-1 rounded"
          >/{url.split("*").join("/").split(".zip")[0]}</code
        >.
      </p>
      {#if extracting}
        <div class="flex flex-col gap-2">
          <progress
            class="progress progress-success w-full"
            value={extractProgress}
            max="100"
          ></progress>
          <p class="text-sm opacity-70 text-center">
            Extracting… {extractProgress}%
          </p>
        </div>
      {:else}
        {#if extractError}
          <p class="text-error text-sm mb-2">{extractError}</p>
        {/if}
        <div class="flex gap-1">
          <button on:click={extractFile} class="btn btn-success">
            Extract
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
<!-- Put this part before </body> tag -->
<input type="checkbox" id="upload" class="modal-toggle" />
<div class="modal" style="margin:0rem;">
  <div class="modal-box bg-opacity-95 backdrop-blur relative">
    <label
      for="upload"
      class="btn btn-neutral btn-sm btn-circle absolute right-2 top-2">✕</label
    >
    <h3 class="text-lg font-bold">{$t("server.delete.title")}</h3>
    <div
      class="bg-warning w-86 h-16 rounded-lg text-black p-2 flex items-center mb-6 space-x-2 mt-2"
    >
      <span class="text-sm">{$t("server.delete.desc")}</span>
    </div>
    <div class="flex gap-1">
      {#if accountType == "email"}
        <input
          type="password"
          id="password"
          class="input input-bordered input-error mr-1"
          placeholder={$t("typeYourPassword")}
        />
      {/if}
      <button id="delButton" class="btn btn-error">
        {$t("button.delete")}</button
      >
    </div>
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
    <h3 class="text-lg font-bold mb-5">Download {filename}</h3>

    {#if downloadError}
      <p class="text-error text-sm mb-2">{downloadError}</p>
      <button on:click={setDownloadUrl} class="btn btn-neutral btn-sm">Retry</button>
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
