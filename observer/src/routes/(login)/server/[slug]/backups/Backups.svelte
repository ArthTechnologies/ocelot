<script lang="ts">
  import { browser } from "$app/environment";
  import { apiurl } from "$lib/scripts/req";
  import { fileSizeShort } from "$lib/scripts/utils";
  import { error } from "console";
  import { Download, FlaskConical, HardDriveDownload, InfoIcon } from "lucide-svelte";
  import { onMount, onDestroy } from "svelte";

  let promise = null;
  let backups = [];
  let isBackingUp = false;
  let backupProgress = null;
  let progressPoll = null;
  let isRestoring = false;
  let restoreError = '';
  let restoreSuccess = false;
  let restoringBackupId = null;

  function loadBackups() {
    if (browser) {
      fetch(apiurl + "server/" + localStorage.getItem("serverID") + "/backups", {
        method: "GET",
        headers: {
          token: localStorage.getItem("token"),
          username: localStorage.getItem("accountEmail"),
        },
      })
        .then((response) => response.json())
        .then((data) => {
          backups = data.sort((a, b) => b.timestamp - a.timestamp);
          promise = Promise.resolve();
        })
        .catch((error) => {
          console.error("Error fetching backups:", error);
          promise = Promise.reject(error);
        });
    }
  }

  function checkProgress() {
    if (browser) {
      fetch(apiurl + "server/" + localStorage.getItem("serverID") + "/backup/progress", {
        method: "GET",
        headers: {
          token: localStorage.getItem("token"),
          username: localStorage.getItem("accountEmail"),
        },
      })
        .then((response) => response.json())
        .then((data) => {
          backupProgress = data;

          // If backup completed, reload backups and stop polling
          if (data.status === "completed") {
            setTimeout(() => {
              loadBackups();
              isBackingUp = false;
              backupProgress = null;
              if (progressPoll) clearInterval(progressPoll);
            }, 1000);
          }
          // If backup failed, stop polling
          else if (data.status === "failed") {
            isBackingUp = false;
            if (progressPoll) clearInterval(progressPoll);
          }
        })
        .catch((error) => {
          console.error("Error checking backup progress:", error);
        });
    }
  }

  function startProgressPolling() {
    progressPoll = setInterval(checkProgress, 1000);
  }

  onMount(() => {
    loadBackups();
    // Check progress on mount
    checkProgress();
  });

  onDestroy(() => {
    if (progressPoll) clearInterval(progressPoll);
  });

  function backup() {
    isBackingUp = true;
    backupProgress = { status: "in_progress", progress: 0 };

    fetch(apiurl + "server/" + localStorage.getItem("serverID") + "/backup", {
      method: "POST",
      headers: {
        token: localStorage.getItem("token"),
        username: localStorage.getItem("accountEmail"),
      },
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("Backup started:", data);
        startProgressPolling();
      })
      .catch((error) => {
        console.error("Error starting backup:", error);
        isBackingUp = false;
        backupProgress = null;
      });
  }

  function download(timestamp) {
    fetch(
      apiurl +
        "server/" +
        localStorage.getItem("serverID") +
        "/backup/" +
        timestamp,
      {
        method: "GET",
        headers: {
          token: localStorage.getItem("token"),
          username: localStorage.getItem("accountEmail"),
        },
      }
    )
      .then((response) => {
        if (response.ok) {
          return response.blob();
        } else {
          throw new Error("Failed to download backup");
        }
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `backup-${timestamp}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch((error) => {
        console.error("Error downloading backup:", error);
      });
  }

  function restore(timestamp) {
    isRestoring = true;
    restoringBackupId = timestamp;
    restoreError = '';
    restoreSuccess = false;

    fetch(
      apiurl +
        "server/" +
        localStorage.getItem("serverID") +
        "/backup/" +
        timestamp +
        "/restore",
      {
        method: "POST",
        headers: {
          token: localStorage.getItem("token"),
          username: localStorage.getItem("accountEmail"),
        },
      }
    )
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          restoreSuccess = true;
          setTimeout(() => {
            isRestoring = false;
            restoringBackupId = null;
            // Reload backups after restore
            loadBackups();
          }, 3000);
        } else {
          restoreError = data.message || "Failed to restore backup";
          isRestoring = false;
          restoringBackupId = null;
        }
      })
      .catch((error) => {
        console.error("Error restoring backup:", error);
        restoreError = "Error restoring backup: " + error.message;
        isRestoring = false;
        restoringBackupId = null;
      });
  }
</script>

<div class="bg-base-300 rounded-xl px-4 py-4 shadow-xl neutralGradientStroke w-full min-h-[30rem] flex flex-col">
  <!-- Header Section -->
  <div class="mb-5">
    <div class="flex justify-between items-start mb-3">
      <div>
        <span class="flex items-center gap-2"><p class="font-ubuntu text-gray-200 text-xl font-bold">Backups</p>
                <div class="badge badge-outline gap-1 text-xs">
          <FlaskConical size={14} />
          Beta
        </div>
       </span>
        <p class="text-gray-400 text-sm mt-1">Manage and restore your world saves</p>
      </div>
      <div class="flex gap-2 items-center">
        <button
          on:click={backup}
          disabled={isBackingUp}
          class="btn btn-sm btn-neutral gap-2 transition-all {isBackingUp ? 'opacity-75' : ''}"
        >
          <HardDriveDownload class="mr-1.5" size={16} />
          <span class="font-medium">{isBackingUp ? "Creating backup..." : "Backup Now"}</span>
        </button>

      </div>
    </div>
    <div class="divider my-2"></div>

    <!-- Progress Bar (if backing up) -->
    {#if backupProgress && backupProgress.status === "in_progress"}
      <div class="space-y-2">
        <div class="flex justify-between items-center text-sm">
          <span class="text-gray-300 font-medium">Backing up...</span>
          <span class="text-gray-400">{backupProgress.progress || 0}%</span>
        </div>
        <progress
          class="progress progress-primary w-full"
          value={backupProgress.progress || 0}
          max="100"
        />
        <div class="flex justify-between text-xs text-gray-400">
          <span>
            {#if backupProgress.filesProcessed && backupProgress.totalFiles}
              {backupProgress.filesProcessed.toLocaleString()} / {backupProgress.totalFiles.toLocaleString()} files
            {/if}
          </span>
          <span>
            {#if backupProgress.startTime}
              {Math.round((Date.now() - backupProgress.startTime) / 1000)}s elapsed
            {/if}
          </span>
        </div>
      </div>
    {/if}

    {#if backupProgress && backupProgress.status === "failed"}
      <div class="alert alert-error">
        <span class="text-sm">Backup failed: {backupProgress.error || "Unknown error"}</span>
      </div>
    {/if}
  </div>

  <!-- Content Section -->
  <div class="flex-1 overflow-y-auto">
    {#await promise}
      <!-- Loading State -->
      <div class="space-y-3">
        {#each Array.from({ length: 4 }) as _, i}
          <div class="bg-base-100 rounded-lg p-4 h-24 flex items-center gap-3">
            <div class="w-12 h-12 bg-slate-700 rounded-lg animate-pulse" />
            <div class="flex-1 space-y-2">
              <div class="bg-slate-700 rounded h-4 w-48 animate-pulse" />
              <div class="bg-slate-700 rounded h-3 w-32 animate-pulse" />
            </div>
            <div class="bg-slate-700 rounded h-8 w-20 animate-pulse" />
          </div>
        {/each}
      </div>
    {:then}
      {#if backups.length === 0}
        <!-- Empty State -->
        <div class="flex flex-col items-center justify-center h-96 text-center">
          <div class="bg-base-100 rounded-full p-6 mb-4">
            <HardDriveDownload size={40} class="mr-1.5 text-gray-400" />
          </div>
          <p class="text-gray-300 text-lg font-semibold mb-1">No backups yet</p>
          <p class="text-gray-400 text-sm mb-6">Create your first backup by clicking the button above</p>
          <button
            on:click={backup}
            disabled={isBackingUp}
            class="btn btn-sm btn-primary gap-2"
          >
            <HardDriveDownload class="mr-1.5" size={16} />
            Create First Backup
          </button>
        </div>
      {:else}
        <!-- Backups List -->
        <div class="space-y-3">
          {#each backups as backup (backup.timestamp)}
            <div class="bg-base-100 rounded-lg p-4 hover:bg-base-100/80 transition-colors group">
              <div class="flex items-center justify-between">
                <!-- Left Content -->
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  <div class="flex-shrink-0 bg-base-200 rounded-lg p-3 group-hover:bg-base-300 transition-colors">
                    <HardDriveDownload size={20} class=" text-primary" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-gray-200 font-semibold text-sm truncate">
                      {new Date(backup.timestamp).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <div class="flex gap-2 items-center mt-1">
                      <span class="badge badge-sm badge-neutral text-xs">
                        {fileSizeShort(backup.size).toUpperCase()}
                      </span>
                      <span class="text-gray-500 text-xs">
                        {new Date(backup.timestamp).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Right Actions -->
                <div class="flex gap-2 flex-shrink-0 ml-3">
                  <a
                    href={apiurl +
                      "server/" +
                      localStorage.getItem("serverID") +
                      "/backup/" +
                      backup.timestamp +
                      "?key=" +
                      backup.key}
                    class="btn btn-sm btn-ghost gap-1 hover:btn-primary"
                    title="Download this backup"
                  >
                    <Download class="mr-1.5" size={16} />
                    <span class="hidden sm:inline">Download</span>
                  </a>
                  <button
                    on:click={() => restore(backup.timestamp)}
                    disabled={isRestoring}
                    class="btn btn-sm btn-ghost gap-1 hover:btn-warning"
                    title="Restore this backup"
                  >
                    <svg class="mr-1.5 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span class="hidden sm:inline">Restore</span>
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/await}
  </div>

  <!-- Footer Info -->
  <div class="mt-5 pt-4 border-t border-base-100 text-xs text-gray-400">
    <p class="flex items-center gap-1.5">
      <InfoIcon size={14} />
      Automatic backups run based on your scheduler, by default every 6 hours.
    </p>
  </div>
</div>

<!-- Restore Modal -->
{#if isRestoring || restoreSuccess || restoreError}
  <div class="modal modal-open">
    <div class="modal-box">
      <h3 class="font-bold text-lg">
        {#if isRestoring}
          Restoring Backup...
        {:else if restoreSuccess}
          ✅ Backup Restored
        {:else}
          ❌ Restore Failed
        {/if}
      </h3>

      {#if isRestoring}
        <div class="py-6 text-center">
          <div class="flex flex-col items-center gap-4">
            <span class="loading loading-spinner loading-lg"></span>
            <p class="text-sm text-gray-400">
              Restoring your world... The server will restart automatically.
            </p>
          </div>
        </div>
      {:else if restoreSuccess}
        <div class="py-4">
          <p class="text-sm text-gray-300 mb-4">
            Your backup has been successfully restored! The current world has been moved to a backup folder and your server will restart.
          </p>
          <div class="alert alert-info text-sm">
            <span>The server is restarting now. You'll be back online shortly.</span>
          </div>
        </div>
        <div class="modal-action">
          <button
            class="btn"
            on:click={() => {
              restoreSuccess = false;
            }}
          >
            Close
          </button>
        </div>
      {:else if restoreError}
        <div class="py-4">
          <p class="text-sm text-gray-300 mb-4">
            {restoreError}
          </p>
        </div>
        <div class="modal-action">
          <button
            class="btn"
            on:click={() => {
              restoreError = '';
            }}
          >
            Close
          </button>
        </div>
      {/if}
    </div>
    <div class="modal-backdrop" />
  </div>
{/if}
