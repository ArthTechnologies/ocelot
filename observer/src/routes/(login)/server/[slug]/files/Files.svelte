<script>
  import { browser } from "$app/environment";
  import File from "$lib/components/ui/files/File.svelte";
  import Folder from "$lib/components/ui/files/Folder.svelte";
  import TextEditor from "$lib/components/ui/files/TextEditor.svelte";
  import ConfigEditor from "$lib/components/ui/files/ConfigEditor.svelte";
  import { apiurl, usingOcelot, getServerNode } from "$lib/scripts/req";
  import { ArrowLeft, ArrowLeftIcon, FlaskConical, HardDriveDownload, Hash, KeyIcon, LinkIcon, UserIcon, Search, X, FileText, Folder as FolderIcon, FolderClosed } from "lucide-svelte";
  import { t } from "$lib/scripts/i18n";
  import HistoryButton from "$lib/components/buttons/HistoryButton.svelte";
  import { onDestroy } from "svelte";
  import MainFolder from "$lib/components/ui/files/MainFolder.svelte";
  import MovePicker from "$lib/components/ui/files/MovePicker.svelte";
  import MoveToast from "$lib/components/ui/files/MoveToast.svelte";
  import { alert } from "$lib/scripts/utils";
  import {
    applyMove,
    displayPath,
    entryPath,
    fileTree,
    parentOf,
    relativeTo,
    treeRoot,
  } from "$lib/scripts/fileMoves";

  let files = [];
  let filteredFiles = [];
  let searchQuery = "";
  let id;
  let backurl = "server";
  let tab = "list";
  let filepath = "file.txt";
  let isConfigFile = false;
  let configContent = "";
  let configFileType = "yaml";
  let ftpPassword = "loading...";
  let showFtpPassword = false;
  let username;
  let isLoading = true; // Add loading state
  let loadError = "";
  let saving = false;

  if (browser) {
    let accountId = localStorage.getItem("accountId");
    if (accountId?.includes("acc_")) accountId = accountId.split("acc_")[1];  
    username = accountId.slice(-6)+"."+localStorage.getItem("serverID")
    if (window.location.href.includes("proxy")) {
      backurl = "proxy";
    }
    if (localStorage.getItem("serverSoftware") == "Velocity") {
      backurl = "proxy";
    }
    id = localStorage.getItem("serverID");
    getFiles();

    document.addEventListener("refresh", function () {
      console.log("refreshing");
      getFiles();
    });

    // Cleaned up on destroy — remounting the page would otherwise stack
    // listeners and apply a single move once per mount.
    document.addEventListener("moveEntry", onMoveEntry);

    fetch(
      apiurl + "server/" + id + "/getFtpToken",
      {
        method: "GET",
        headers: {
          token: localStorage.getItem("token"),
          username: localStorage.getItem("accountEmail"),
        },
      }
    )
      .then((response) => response.json())
      .then((data) => {
        ftpPassword = data.token;
      });

    document.addEventListener("keydown", function (event) {
      if (
        (event.key === "s" || event.key === "S") &&
        (event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();
        save();
      }
    });
  }

  // `silent` refetches in the background, leaving the current tree on screen.
  // Used after a move, where the optimistic tree is already correct but the
  // cached folder sizes aren't — a skeleton flash there would be noise.
  async function getFiles({ silent = false } = {}) {
    if (!silent) {
      isLoading = true; // Set loading to true when fetching
      loadError = "";
    }
    let baseurl = apiurl;
    if (usingOcelot) baseurl = getServerNode(id);
    const url = baseurl + "server/" + id + "/files";

    // The tree endpoint used to answer nothing at all when access was denied,
    // so this spinner ran until the socket timed out. Bound it client-side too.
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 20000);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          token: localStorage.getItem("token"),
          username: localStorage.getItem("accountEmail"),
        },
        signal: abort.signal,
      });

      if (!response.ok) {
        // A background refresh must never replace a good tree with an error.
        if (silent) return;
        // 404 + code 101 means the server isn't provisioned on this node —
        // distinct from an empty file list, which is what we used to render.
        if (response.status === 404) {
          loadError = "This server hasn't been created yet.";
        } else if (response.status === 401) {
          loadError = "Couldn't load files. Log in again and retry.";
        } else {
          loadError = "Couldn't load files. Try again.";
        }
        files = [];
        filteredFiles = [];
        return;
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        if (silent) return;
        loadError = "Couldn't load files. Try again.";
        files = [];
        filteredFiles = [];
        return;
      }
      files = data;
      filteredFiles = data;
    } catch (error) {
      console.error("Error fetching files:", error);
      if (silent) return;
      loadError =
        error.name === "AbortError"
          ? "Couldn't load files — the server didn't respond."
          : "Couldn't load files. Check your connection.";
      files = [];
      filteredFiles = [];
    } finally {
      clearTimeout(timeout);
      if (!silent) isLoading = false;
    }
  }

  // Everything in the tree is rooted here, e.g. "servers/12".
  function rootPath() {
    return "servers/" + id;
  }

  function baseUrl() {
    return usingOcelot ? getServerNode(id) : apiurl;
  }

  async function errorFrom(response, fallback) {
    try {
      const data = await response.json();
      if (data && data.msg) return data.msg;
    } catch {
      // non-JSON body (an HTML error page, usually)
    }
    return fallback;
  }

  let lastMove = null;
  // One move at a time: the revert snapshot below would be stale if a second
  // move started before the first resolved.
  let moving = false;

  function onMoveEntry(event) {
    handleMove(event.detail.from, event.detail.to);
  }

  onDestroy(() => {
    if (browser) document.removeEventListener("moveEntry", onMoveEntry);
  });

  async function handleMove(from, to) {
    if (moving) return;

    const root = rootPath();
    const result = applyMove(files, from, to, root);
    if (!result.movedPath) return;

    // Apply straight away, then put it back if the server disagrees — a move
    // shouldn't feel like it's waiting on a round trip.
    const previous = files;
    files = result.tree;
    lastMove = {
      name: from.slice(from.lastIndexOf("/") + 1),
      origin: parentOf(from),
      movedPath: result.movedPath,
      destination: displayPath(to, root) || "/",
    };

    moving = true;
    try {
      const response = await fetch(baseUrl() + "server/" + id + "/files/move", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          token: localStorage.getItem("token"),
          username: localStorage.getItem("accountEmail"),
        },
        body: JSON.stringify({
          from: relativeTo(from, root),
          to: relativeTo(to, root),
        }),
      });

      if (!response.ok) {
        files = previous;
        lastMove = null;
        alert(await errorFrom(response, "Couldn't move that item. Try again."), "error");
        // 404 means our tree is stale — pull a fresh one rather than guessing.
        if (response.status === 404) getFiles();
        return;
      }

      // The optimistic tree has the entry in the right place, but the folder
      // sizes it inherited are now wrong. Reconcile without a visible reload.
      getFiles({ silent: true });
    } catch (err) {
      console.error("Error moving item:", err);
      files = previous;
      lastMove = null;
      alert("Couldn't move that item — connection lost.", "error");
    } finally {
      moving = false;
    }
  }

  // Undo is a real move back, so it goes through the same path as any other.
  function undoMove() {
    if (!lastMove || moving) return;
    const { movedPath, origin } = lastMove;
    lastMove = null;
    handleMove(movedPath, origin);
  }

  // Pure, so the visible list can be derived reactively below. A move rewrites
  // `files`, and the filtered view has to follow it without being re-run by hand.
  function searchTree(fileList, needle) {
    const results = [];

    for (const file of fileList) {
      if (typeof file === "string") {
        if (file.split(":")[0].toLowerCase().includes(needle)) {
          results.push(file);
        }
      } else {
        const foldername = file[0].split(":")[0].toLowerCase();
        const folderContents = searchTree(file[1], needle);

        if (foldername.includes(needle) || folderContents.length > 0) {
          results.push([file[0], folderContents]);
        }
      }
    }

    return results;
  }

  function handleSearchInput(event) {
    searchQuery = event.target.value;
  }

  function clearSearch() {
    searchQuery = "";
  }

  async function save() {
    if (tab !== "editor" || saving) return;

    const editor = document.getElementById("textEditor");
    if (!editor) return;

    let baseurl = apiurl;
    if (usingOcelot) baseurl = getServerNode(id);

    saving = true;
    document.dispatchEvent(new Event("updatedTextEditor"));

    try {
      const response = await fetch(
        baseurl + "server/" + id + "/files/write/" + filepath.split("/").join("*"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            token: localStorage.getItem("token"),
            username: localStorage.getItem("accountEmail"),
          },
          body: JSON.stringify({ content: editor.value }),
        }
      );

      // Previously the response was logged and the save button disabled no
      // matter what came back, so a rejected write looked exactly like a
      // successful one and the user lost their edits on reload.
      if (!response.ok) {
        let msg = "Couldn't save. Copy your changes before reloading.";
        if (response.status === 401) {
          msg = "Couldn't save — your session may have expired. Copy your changes before reloading.";
        } else {
          try {
            const data = await response.json();
            if (data && data.msg) msg = data.msg;
          } catch {
            // non-JSON body
          }
        }
        alert(msg, "error");
        return;
      }

      // Only now is it safe to mark the buffer clean.
      const filepathEl = document.getElementById("filepath");
      if (filepathEl) filepathEl.innerHTML = filepathEl.innerHTML.replace("*", "");
      document.getElementById("saveButton")?.classList.add("btn-disabled");
      alert("Saved.", "success");
    } catch (err) {
      console.error("Error saving file:", err);
      alert("Couldn't save — connection lost. Your changes are still in the editor.", "error");
    } finally {
      saving = false;
    }
  }

  function toggleFtpPassword() {
    showFtpPassword = !showFtpPassword;
  }

  if (browser) {
    document.addEventListener("openTextEditor", function (event) {
      tab = "editor";
      filepath = event.detail.path;

      // Check if it's a config file (YAML or properties)
      const ext = filepath.split(".").pop().toLowerCase();
      const isYaml = ext === "yml" || ext === "yaml";
      const isProperties = ext === "properties";
      isConfigFile = isYaml || isProperties;
      configFileType = isProperties ? "properties" : "yaml";

      setTimeout(function () {
        if (isConfigFile) {
          configContent = event.detail.content;
          document.dispatchEvent(new CustomEvent("configContentUpdate", {
            detail: { content: event.detail.content, fileType: configFileType }
          }));
        }
        const editor = document.getElementById("textEditor");
        if (editor) editor.value = event.detail.content;
      }, 100);
    });
  }

  function copyPassword() {
    const textarea = document.createElement("textarea");
    textarea.value = ftpPassword.trim();
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, 99999);
    document.execCommand("copy");
    document.body.removeChild(textarea);
    alert("Password copied to clipboard", "success");
  }

  $: filteredFiles = searchQuery.trim()
    ? searchTree(files, searchQuery.trim().toLowerCase())
    : files;

  // Published so nested rows can build a "Move to…" picker without the whole
  // tree being threaded down through props.
  $: fileTree.set(files);
  $: treeRoot.set(rootPath());
</script>

<div class="bg-base-300 rounded-xl px-4 py-3 shadow-xl neutralGradientStroke" id="filesRoot">
  <p class="font-ubuntu text-gray-200 text-lg ml-1 mb-2">Server Files</p>

  {#if tab == "list"}
    <div class="flex flex-col items-start gap-3 w-full" id="filesListWrapper">
      <!-- Search Bar -->
      <div class="w-full">
        <div class="relative">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search class="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search files and folders..."
            class="input input-bordered w-full pl-10 pr-10 bg-base-100 h-10 text-[.9rem]"
            bind:value={searchQuery}
            on:input={handleSearchInput}
            disabled={isLoading}
          />
          {#if searchQuery}
            <button
              class="absolute inset-y-0 right-0 pr-3 flex items-center"
              on:click={clearSearch}
            >
              <X class="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer" />
            </button>
          {/if}
        </div>
        {#if searchQuery && filteredFiles.length === 0 && !isLoading}
          <p class="text-sm text-gray-500 mt-2 pl-1">No files or folders found matching "{searchQuery}"</p>
        {/if}
      </div>

      <div class="bg-base-100 rounded-xl md:p-2 w-full" id="filetree">
        {#if isLoading}
          <!-- Skeleton Loader -->
          <div class="space-y-1">
            
            
            <!-- File/folder skeletons -->
            {#each Array(8) as _, i}
              <div class="flex items-center gap-1.5 p-2 rounded-lg">
               
                
                <!-- File/folder icon -->
                {#if i % 3 === 0}
    <FolderClosed
      class="shrink-0 w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem] text-gray-600 animate-pulse"
    />
                {:else}
                  <FileText
                    class="shrink-0 w-[.9rem] h-[.9rem] md:w-[1rem] md:h-[1rem] text-gray-600 animate-pulse"
                  />  
                {/if}
                
                <!-- Filename with varying widths -->
                <div class="w-{20 + (i * 8) % 40} h-3 bg-gray-600 rounded animate-pulse"></div>
                
                <!-- Spacer -->
                <div class="flex-1"></div>
                
                <!-- File size placeholder -->
                {#if i % 3 !== 0 || i == 0}
                  <div class="w-12 h-3 bg-gray-600 rounded animate-pulse"></div>
                {/if}
              </div>
              
     
            {/each}
          </div>
        {:else if loadError}
          <div class="flex flex-col items-start gap-2 p-4">
            <p class="text-error text-sm">{loadError}</p>
            <button class="btn btn-neutral btn-sm" on:click={getFiles}>Retry</button>
          </div>
        {:else}
          <!-- Actual content -->
          <MainFolder />
          {#each filteredFiles as file}
            {#if typeof file == "string"}
              <File filename={file.split(":")[0]} url={file.split(":")[1]} size={file.split(":")[2]}
                fullPath={entryPath(file)}/>
            {:else}
              <Folder
                foldername={file[0].split(":")[0]}
                files={file[1]}
                path={file[0].split(":")[1]}
                size={file[0].split(":")[2]}
                fullPath={entryPath(file)}
              />
            {/if}
          {/each}
        {/if}
      </div>
    </div>
  {:else if tab == "editor"}
    <div
      class="bg-base-100 rounded-xl p-3 h-[30rem] w-full lg:h-[35rem] xl:h-[45rem] flex flex-col"
      id="filesEditorWrapper"
    >
      <div class="flex justify-between shrink-0">
        <div class="flex mb-2 justify-between w-full">
          <button
            class="btn btn-sm btn-neutral btn-circle"
            on:click={() => { tab = "list"; }}>
            <ArrowLeftIcon class="w-5 h-5" />
          </button>
          <h1 class="text-xl font-bold" id="filepath">{filepath}</h1>
          <button
            class="btn btn-sm btn-neutral btn-disabled"
            id="saveButton"
            on:click={save}>
            {$t("save")}
          </button>
        </div>
      </div>
      <div class="flex-1 min-h-0">
        {#if isConfigFile}
          <ConfigEditor initialContent={configContent} fileType={configFileType} />
        {:else}
          <TextEditor />
        {/if}
      </div>
    </div>
  {/if}

  <!-- FTP info -->
  <div class="w-full mt-3">
    <div class="bg-base-100 rounded-lg px-3 py-2 w-full relative">
      <div class="badge badge-outline badge-sm absolute top-1.5 right-1.5 text-xs flex gap-1 items-center">
        <FlaskConical size="10" />Beta
      </div>
      <h1 class="text-sm font-poppins-bold mb-1.5">SFTP Info</h1>
      <div class="flex flex-wrap gap-x-4 gap-y-1">
        <div class="flex gap-1.5 items-center text-xs">
          <div class="flex bg-neutral px-1.5 py-0.5 rounded items-center font-bold gap-1">
            <LinkIcon size="11" />
            Host
          </div>
          sftp://{localStorage.getItem("userNode")?.includes("https://")
            ? localStorage.getItem("userNode").split("https://")[1].split("/")[0]
            : ''}
        </div>

        <div class="flex gap-1.5 items-center text-xs">
          <div class="flex bg-neutral px-1.5 py-0.5 rounded items-center font-bold gap-1">
            <Hash size="11" />
            Port
          </div>
          {10000+(Math.floor(parseInt(localStorage.getItem("serverID")) / 100) * 100)+99}
        </div>

        <div class="flex gap-1.5 items-center text-xs">
          <div class="flex bg-neutral px-1.5 py-0.5 rounded items-center font-bold gap-1">
            <UserIcon size="11" />
            Username
          </div>
          {username}
        </div>

        <div class="flex gap-1.5 items-center text-xs">
          <div class="flex bg-neutral px-1.5 py-0.5 rounded items-center font-bold gap-1">
            <KeyIcon size="11" />
            Password
          </div>
          <p id="ftpToken">
            {#if showFtpPassword}
              {ftpPassword}
            {:else}
              ********
            {/if}
          </p>
          <button class="btn btn-xs btn-ghost" on:click={toggleFtpPassword}>
            {#if showFtpPassword}Hide{:else}Show{/if}
          </button>
          <button class="btn btn-xs btn-neutral" on:click={copyPassword}>
            Copy
          </button>
        </div>
      </div>
    </div>
  </div>
  </div>

<MovePicker />

{#if lastMove}
  {#key lastMove.movedPath}
    <MoveToast
      name={lastMove.name}
      destination={lastMove.destination}
      on:undo={undoMove}
      on:dismiss={() => (lastMove = null)}
    />
  {/key}
{/if}

<style>
  /* The parent page forces this component's root to flex:1 on tall screens
     (see +page.svelte's .tab-content-wrapper rule) so it can grow to fill
     the leftover vertical space. Without this, the file tree/editor kept
     their natural content height and got clipped by .server-page-root's
     overflow:hidden instead of scrolling internally. */
  @media (min-height: 700px) and (min-width: 1024px) {
    #filesRoot {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    /* Whichever tab body is mounted (list or editor) grows into the leftover
       space; the SFTP info card below it keeps its natural height. */
    #filesListWrapper,
    #filesEditorWrapper {
      flex: 1 1 0%;
      min-height: 0;
    }
    /* The search bar stays fixed; only the actual file/folder listing (which
       can run to hundreds of rows) becomes the scrollbox. */
    #filetree {
      flex: 1 1 0%;
      min-height: 0;
      overflow-y: auto;
    }
    /* Overrides the fixed h-[30rem]/lg:h-[35rem]/xl:h-[45rem] classes - the
       editor's own flex-1/min-h-0 child already scrolls its content. */
    #filesEditorWrapper {
      height: auto;
    }
  }
</style>