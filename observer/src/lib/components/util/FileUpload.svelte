<script>
  import { t } from "$lib/scripts/i18n";
  import { browser } from "$app/environment";
  import { apiurl, getServerNode, usingOcelot } from "$lib/scripts/req";
  import { alert } from "$lib/scripts/utils";
  export let foldername;
  export let uploadpath;
  export let id;
  export let modal = true;
  let uniqueId = Math.floor(Math.random() * 1000000);

  function uploadFile() {
    const formData = new FormData();
    const fileInput = document.getElementById("upload" + foldername + "file");
    const file = fileInput.files[0];

    formData.append("file", file, file.name);

    console.error("uploading");
    if (browser) {
      const uploadBtn = document.getElementById("uploadBtn" + uniqueId);
      //we normally use fetch, but we have to use XMLHttpRequest for this because fetch doesnt give progress of uploads.
      const xhr = new XMLHttpRequest();
      let visualPercent = 0;
      let requestFinished = false;
      let virusScanningEnabled = localStorage.getItem("enableVirusScan");
      let theme = localStorage.getItem("theme");

      // Disable button during upload
      uploadBtn.classList.add("pointer-events-none");
      if (theme == "dark") uploadBtn.classList.add("text-accent-content");
      else if (theme == "light") uploadBtn.classList.add("text-gray-200");

      // Update progress UI
      function updateProgressUI() {
        uploadBtn.innerHTML = $t("uploading") + ` (${Math.round(visualPercent)}%)`;
        uploadBtn.style.background = `linear-gradient(
          to right,
          #13171e 0%,
          #13171e ${visualPercent}%,
          #2b364f ${visualPercent}%,
          #2b364f 100%
        )`;
      }

      // Reset button to original state
      function resetButton() {
        uploadBtn.style.background = ``;
        uploadBtn.innerHTML = $t("button.upload");
        uploadBtn.classList.remove("pointer-events-none");
        uploadBtn.classList.remove("text-accent-content");
        uploadBtn.classList.remove("text-gray-200");
        uploadBtn.classList.remove("text-lime-500");
        uploadBtn.classList.remove("skeleton");
        if (theme == "dark") uploadBtn.classList.remove("bg-[#112100]");
        if (theme == "light") uploadBtn.classList.remove("bg-[#143f04]");
      }

      // Listen for refresh event
      document.addEventListener("refresh", function () {
        console.log("ending loading thing");
        setTimeout(() => {
          resetButton();
        }, 100);
      });

      // Track actual upload progress (cap at 99% until backend responds)
      let lastLoaded = 0;
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          // Detect if reverse proxy reset the connection (loaded decreased significantly)
          if (event.loaded < lastLoaded - 1000) {
            xhr.abort();
            alert("Reverse proxy blocked file upload. Check your proxy's max body size settings.", "error");
            resetButton();
            return;
          }
          lastLoaded = event.loaded;

          const actualPercent = (event.loaded / event.total) * 100;
          visualPercent = Math.min(actualPercent, 99);
          updateProgressUI();
        }
      });

      // Upload stream complete, waiting for backend response
      xhr.upload.addEventListener("loadend", () => {
        if (!requestFinished) {
          uploadBtn.classList.remove("text-accent-content");
          uploadBtn.classList.remove("text-gray-200");
          if (virusScanningEnabled == "true") {
            uploadBtn.innerHTML = $t("scanningForViruses");
            uploadBtn.classList.add("text-lime-500");
            uploadBtn.style.background = ``;
            if (theme == "dark") uploadBtn.classList.add("bg-[#112100]");
            if (theme == "light") uploadBtn.classList.add("bg-[#143f04]");
            uploadBtn.classList.add("skeleton");
          } else {
            uploadBtn.innerHTML = $t("uploading") + " (99%)";
            uploadBtn.style.background = ``;
            uploadBtn.classList.add("skeleton");
          }
        }
      });

      xhr.addEventListener("load", (e) => {
        console.log(e.target.response);
        requestFinished = true;

        if (!e.target.response.includes("No Viruses Detected") &&
          !e.target.response.includes("Upload Complete")
        ) {
          alert($t("alert.virusDetected"));
          resetButton();
        } else {
          alert($t("alert.fileUploaded"), "success");
          // Dispatch refresh event
          const event = new CustomEvent("refresh");
          document.dispatchEvent(event);
          console.log("Dispatching refresh event");
        }
      });

      xhr.addEventListener("error", (error) => {
        console.error("Error:", error);
        requestFinished = true;
        resetButton();
        alert("Upload failed", "error");
      });

      xhr.open(
        "POST",
        apiurl +
          "server/" +
          id +
          "/files/upload/" +
          uploadpath +
          "?filename=" +
          file.name,
        true
      );
      xhr.setRequestHeader("token", localStorage.getItem("token"));
      xhr.setRequestHeader("username", localStorage.getItem("accountEmail"));
      xhr.send(formData);
    }
  }
</script>

{#if modal}
<div class="flex gap-1 mt-2">
  <input
    id="upload{foldername}file"
    type="file"
    class="file-input file-input-bordered file-input-secondary w-full max-w-xs"
  />
  <button id="uploadBtn{uniqueId}" on:click={uploadFile} class="btn btn-neutral">
    {$t("button.upload")}</button
  >
</div>
{:else}
<div class="flex gap-1 mt-2">
  <input
    id="upload{foldername}file"
    type="file"
    class="file-input file-input-bordered file-input-secondary w-full max-w-xs"
  />
  <button id="uploadBtn{uniqueId}" on:click={uploadFile} class="btn btn-neutral">
    {$t("button.upload")}</button
  >
</div>
{/if}