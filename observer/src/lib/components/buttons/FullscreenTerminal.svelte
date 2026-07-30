<script>
  import { browser } from "$app/environment";
  import { onMount, onDestroy } from "svelte";
  import { writeTerminal } from "$lib/scripts/req";
  import { stripLogLevelBlocks } from "$lib/scripts/utils";
  import TerminalFinder from "$lib/components/ui/TerminalFinder.svelte";
  import { Maximize2, Minimize2 } from "lucide-svelte";
  import { t } from "$lib/scripts/i18n";
  let id;
  let scrollCorrected = false;
  let isFocused = false;
  let showFinder = false;
  let collapsedLines2 = new Set();

  if (browser) {
    id = localStorage.getItem("serverID");
  }
  function writeCmd(event) {
    //take input value
    let input = document.getElementById("input2").value;
    //if theres a / at the beginning, remove it
    if (input.startsWith("/")) {
      input = input.substring(1);
    }
    //if key pressed is enter, send alert
    if (event.keyCode == 13) {
      writeTerminal(id, input);
      //clear input
      document.getElementById("input2").value = "";
    }
  }

  setInterval(() => {
    if (browser && isFocused) {
      const terminalContainer2 = document.getElementById("terminalContainer2");
      const terminal = document.getElementById("terminal");
      const terminal2 = document.getElementById("terminal2");
      if (terminal2 != null && terminal != null) {
        const terminal2Lines = (terminal2.getAttribute("data-lines") || "").split("\n").length;
        const terminalLines = (terminal.getAttribute("data-lines") || "").split("\n").length;

        if (terminal2Lines < terminalLines) {
          terminalContainer2.scrollTop +=
            12 * (terminalLines - terminal2Lines);
        }

        const dataLines = terminal.getAttribute("data-lines");
        if (dataLines && terminal2.getAttribute("data-lines") !== dataLines) {
          terminal2.setAttribute("data-lines", dataLines);
          renderTerminalLines2();
        }
      }
    }
  }, 100);

  function renderTerminalLines2() {
    const terminal2 = document.getElementById("terminal2");
    if (!terminal2) return;

    const lines = terminal2.getAttribute("data-lines") || "";
    if (!lines) return;

    const lineArray = lines.split("\n").filter(line => line !== "");

    // On first render, collapse all lines by default
    if (collapsedLines2.size === 0) {
      for (let i = 1; i <= lineArray.length; i++) {
        collapsedLines2.add(i);
      }
    }

    let html = '<div class="terminal-output">';

    lineArray.forEach((line, index) => {
      const lineNum = index + 1;
      const isCollapsed = collapsedLines2.has(lineNum);
      const displayClass = isCollapsed ? "terminal-line-collapsed" : "";

      html += `<div class="terminal-line-wrapper ${displayClass}" data-line="${lineNum}">
        <div class="terminal-line-number">${lineNum}</div>
        <div class="terminal-line-content" onclick="window.toggleTerminalLine2(${lineNum})">${stripLogLevelBlocks(line)}</div>
      </div>`;
    });

    html += "</div>";
    terminal2.innerHTML = html;
  }

  function correctScroll() {
    const terminalContainer2 = document.getElementById("terminalContainer2");
    if (!scrollCorrected && terminalContainer2 != null) {
      terminalContainer2.scrollTop = terminalContainer2.scrollHeight;
      scrollCorrected = true;
    }

    isFocused = !isFocused;
  }

  function isFullscreenOpen() {
    const toggle = document.getElementById("fullscreenTerminal");
    return toggle instanceof HTMLInputElement && toggle.checked;
  }

  function handleKeyDown(e) {
    //only capture find while the fullscreen terminal is actually open
    if ((e.ctrlKey || e.metaKey) && e.key === "f" && isFullscreenOpen()) {
      e.preventDefault();
      showFinder = true;
    }
  }

  function toggleLineCollapse2(lineNum) {
    if (collapsedLines2.has(lineNum)) {
      collapsedLines2.delete(lineNum);
    } else {
      collapsedLines2.add(lineNum);
    }
    collapsedLines2 = collapsedLines2;
    renderTerminalLines2();
  }

  if (browser) {
    onMount(() => {
      window.addEventListener("keydown", handleKeyDown);
      window.toggleTerminalLine2 = toggleLineCollapse2;
    });

    onDestroy(() => {
      window.removeEventListener("keydown", handleKeyDown);
      delete window.toggleTerminalLine2;
    });
  }
</script>

<label for="fullscreenTerminal"
  ><div class="btn btn-neutral btn-sm btn-circle absolute right-2 top-2 z-20">
    <Maximize2 size="17" />
  </div></label
>

<input
  type="checkbox"
  id="fullscreenTerminal"
  class="modal-toggle"
  on:click={correctScroll}
/>
<div
  class="modal bg-base-100 h-screen w-screen max-sm:items-start items-center"
>
  <TerminalFinder isVisible={showFinder} fullscreen={true} on:close={() => showFinder = false} />
  <div class="flex flex-col space-y-3 items-center my-5 md:py-[2rem]">
    <div id="terminalContainerContainer2" class="relative">
      <div
        id="terminalContainer2"
        class="p-5 bg-base-100 rounded-xl shadow-xl overflow-auto h-[80vh] md:h-[85vh] rounded-xl w-[90vw] z-[999]"
      >
        <label
          for="fullscreenTerminal"
          class="btn btn-neutral btn-sm btn-circle absolute right-2 top-2"
          ><Minimize2 size="17" /></label
        >
        <div class=" sm:text-xs xl:text-base font-mono">
          <p id="terminal2" />
        </div>
      </div>
    </div>
    <input
      on:keypress={writeCmd}
      id="input2"
      type="text"
      placeholder={$t("p.enterCommand")}
      class="input input-secondary bg-base-200 w-full"
    />
  </div>
</div>

<style lang="scss">
  :global(.terminal-output) {
    display: flex;
    flex-direction: column;
  }

  :global(.terminal-line-wrapper) {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 0.25rem 0;
    margin: 0;
    border-radius: 0.375rem;
    transition: background-color 0.15s ease;
    cursor: pointer;
    position: relative;

    &:hover {
      background-color: rgba(255, 255, 255, 0.05);
    }

    @media (prefers-color-scheme: light) {
      &:hover {
        background-color: rgba(0, 0, 0, 0.04);
      }
    }
  }

  :global(.terminal-line-wrapper.terminal-line-collapsed) {
    max-height: 1.5em;
    overflow: hidden;
    opacity: 0.6;

    &:hover {
      opacity: 0.8;
    }
  }

  :global(.terminal-line-number) {
    flex-shrink: 0;
    width: 3.5rem;
    text-align: right;
    color: rgba(255, 255, 255, 0.4);
    font-weight: 600;
    font-size: 0.875em;
    font-family: monospace;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    padding-right: 0.75rem;
    user-select: none;

    @media (prefers-color-scheme: light) {
      color: rgba(0, 0, 0, 0.35);
      border-right-color: rgba(0, 0, 0, 0.1);
    }
  }

  :global(.terminal-line-content) {
    flex: 1;
    word-break: break-word;
    white-space: pre-wrap;
    min-width: 0;
  }

  :root[data-theme="light"] {
    :global(.terminal-line-wrapper) {
      &:hover {
        background-color: rgba(0, 0, 0, 0.04);
      }
    }

    :global(.terminal-line-number) {
      color: rgba(0, 0, 0, 0.35);
      border-right-color: rgba(0, 0, 0, 0.1);
    }
  }
</style>
