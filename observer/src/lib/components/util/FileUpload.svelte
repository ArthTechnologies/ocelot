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

  // Bound directly rather than looked up by id: two folders with the same name
  // (say, two `config` dirs) rendered two inputs with identical ids, so
  // getElementById always returned the first one.
  let fileInput;

  function uploadFile() {
    const file = fileInput?.files?.[0];
    if (!file) {
      alert("Choose a file to upload first.", "error");
      return;
    }

    const formData = new FormData();
    formData.append("file", file, file.name);

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
        requestFinished = true;

        // `load` fires for every status, not just 2xx. The old check only looked
        // for success strings in the body, so a 401 or a 500 stack trace fell
        // through to the "Virus Detected" branch and told users their file was
        // infected when their session had simply expired.
        if (xhr.status >= 200 && xhr.status < 300) {
          resetButton();
          alert($t("alert.fileUploaded"), "success");
          document.dispatchEvent(new CustomEvent("refresh"));
          return;
        }

        resetButton();

        if (xhr.status === 422) {
          alert($t("alert.virusDetected"), "error");
          return;
        }
        if (xhr.status === 503) {
          alert("Upload blocked: virus scan couldn't run.", "error");
          return;
        }
        if (xhr.status === 401) {
          alert("Upload failed — your session expired. Log in again.", "error");
          return;
        }
        if (xhr.status === 404) {
          alert("Upload failed — the destination folder no longer exists.", "error");
          document.dispatchEvent(new CustomEvent("refresh"));
          return;
        }
        if (xhr.status === 413) {
          alert("Upload failed — the file is too large.", "error");
          return;
        }

        let msg = "Upload failed.";
        try {
          const data = JSON.parse(xhr.response);
          if (data && data.msg) msg = data.msg;
        } catch {
          // non-JSON body (an HTML error page, usually)
        }
        alert(msg, "error");
      });

      xhr.addEventListener("error", (error) => {
        console.error("Error:", error);
        requestFinished = true;
        resetButton();
        alert("Upload failed", "error");
      });

      // Uploads have to reach the node that actually holds this server.
      const baseurl = usingOcelot ? getServerNode(id) : apiurl;

      xhr.open(
        "POST",
        baseurl +
          "server/" +
          id +
          "/files/upload/" +
          uploadpath +
          "?filename=" +
          encodeURIComponent(file.name),
        true
      );
      xhr.setRequestHeader("token", localStorage.getItem("token"));
      xhr.setRequestHeader("username", localStorage.getItem("accountEmail"));
      xhr.send(formData);
    }
  }
</script>

<div class="flex gap-1 mt-2">
  <input
    bind:this={fileInput}
    id="upload{uniqueId}file"
    type="file"
    class="file-input file-input-bordered file-input-secondary w-full max-w-xs"
  />
  <button id="uploadBtn{uniqueId}" on:click={uploadFile} class="btn btn-neutral">
    {$t("button.upload")}</button
  >
</div>
