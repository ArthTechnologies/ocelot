

<script lang="ts" context="module">

    import { browser } from "$app/environment";
    import FullscreenTerminal from "$lib/components/buttons/FullscreenTerminal.svelte";
    import TerminalFinder from "$lib/components/ui/TerminalFinder.svelte";
    import { t } from "$lib/scripts/i18n";
    import { readTerminal, writeTerminal } from "$lib/scripts/req";
    import { SendIcon } from "lucide-svelte";
  
    
    export let id: number;

    if (browser	) {
        id = localStorage.getItem("serverID");
    }
    function writeCmd(event) {
    //take input value
    let input = document.getElementById("input").value;

    //if theres a / at the beginning, remove it
    if (input.startsWith("/")) {
      input = input.substring(1);
    }
    //if key pressed is enter, send alert
    if (event.keyCode == 13) {
send(input);
    }
  }

  function send(input) {
    writeTerminal(id, input);
      //clear input
      document.getElementById("input").value = "";

      //wait 200 ms then read terminal
      setTimeout(() => {
        readCmd();
      }, 200);
  }
  let scrollCorrected = false;
  let collapsedLines = new Set();

  function toggleLineCollapse(lineNum) {
    if (collapsedLines.has(lineNum)) {
      collapsedLines.delete(lineNum);
    } else {
      collapsedLines.add(lineNum);
    }
    collapsedLines = collapsedLines;
    renderTerminalLines();
  }

  function renderTerminalLines() {
    const terminal = document.getElementById("terminal");
    if (!terminal) return;

    const lines = terminal.getAttribute("data-lines") || "";
    if (!lines) return;

    const lineArray = lines.split("\n").filter(line => line !== "");

    // On first render, collapse all lines by default
    if (collapsedLines.size === 0) {
      for (let i = 1; i <= lineArray.length; i++) {
        collapsedLines.add(i);
      }
    }

    let html = '<div class="terminal-output">';

    lineArray.forEach((line, index) => {
      const lineNum = index + 1;
      const isCollapsed = collapsedLines.has(lineNum);
      const displayClass = isCollapsed ? "terminal-line-collapsed" : "";

      html += `<div class="terminal-line-wrapper ${displayClass}" data-line="${lineNum}">
        <div class="terminal-line-number">${lineNum}</div>
        <div class="terminal-line-content" onclick="window.toggleTerminalLine(${lineNum})">${line}</div>
      </div>`;
    });

    html += "</div>";
    terminal.innerHTML = html;
  }

  export function readCmd() {
    if (browser) {
      readTerminal(id).then((response) => {
        let difference = 0;

        const terminalContainer = document.getElementById("terminalContainer");
        const terminal = document.getElementById("terminal");
        const filteredResponse = response
          .replace(/\x1B\[[0-9;]*[mG]/g, "")
          .replace(/\n/g, "<LINEBREAK>");

        if (response.length < 1000000) {
          const oldLineCount = (terminal.getAttribute("data-lines") || "").split("\n").length;
          const newLineCount = filteredResponse.split("<LINEBREAK>").length;

          terminalContainer.scrollTop += 50 * (newLineCount - oldLineCount);

          if (
            filteredResponse.length - (terminal.getAttribute("data-lines") || "").length !=
            difference
          ) {
            difference = filteredResponse.length - (terminal.getAttribute("data-lines") || "").length;
            terminal.setAttribute("data-lines", filteredResponse.replace(/<LINEBREAK>/g, "\n"));
            renderTerminalLines();
          }
        } else {
          const truncated = filteredResponse.substring(
            filteredResponse.length - 1000000,
          );
          const oldLineCount = (terminal.getAttribute("data-lines") || "").split("\n").length;
          const newLineCount = truncated.split("<LINEBREAK>").length;

          terminalContainer.scrollTop += 50 * (newLineCount - oldLineCount);
          terminal.setAttribute("data-lines", truncated.replace(/<LINEBREAK>/g, "\n"));
          renderTerminalLines();
        }

        //scroll down the height of the new lines added
        const lineCount = (terminal.getAttribute("data-lines") || "").split("\n").length;
        if (lineCount > 0) {
          let difference =
            terminalContainer.scrollHeight - terminalContainer.scrollTop;
          const terminalContainerContainer = document.getElementById(
            "terminalContainerContainer",
          );
          if (difference <= terminalContainerContainer?.clientHeight) {
            setTimeout(() => {
              terminalContainer.scrollTop = terminalContainer.scrollHeight;
            }, 1);
          }
        }

        //if this is the first time the terminal is loaded, this will scroll to the bottom.
        if (scrollCorrected == false) {
          terminalContainer.scrollTop = terminalContainer.scrollHeight;
          scrollCorrected = true;
        }
      });
    }
  }
  function calculateElementWidth(screenWidth) {
  let ratio;

  if (screenWidth <= 1500) {
    ratio = 0.0002335 * screenWidth + 0.13105; // Segment 1
  } else if (screenWidth <= 1700) {
    ratio = 0.000176 * screenWidth + 0.2173;   // Segment 2
  } else if (screenWidth <= 1900) {
    ratio = 0.0001385 * screenWidth + 0.28105; // Segment 3
  } else if (screenWidth <= 2100) {
    ratio = 0.0001125 * screenWidth + 0.33045; // Segment 4
  } else if (screenWidth <= 2300) {
    ratio = 0.0000905 * screenWidth + 0.37665; // Segment 5
  } else {
    // Extrapolate for larger widths (use last segment's slope)
    ratio = 0.0000905 * screenWidth + 0.37665;
  }

  return ratio * screenWidth;
}

function updateElementWidth() {
  const screenWidth = window.innerWidth;
  const elementWidth = calculateElementWidth(screenWidth);
  //if larger than 1280px, set to elementWidth. otherwise, full
  const terminalContainer = document.getElementById("terminalContainerContainer");
  const input = document.getElementById("input");
  if (screenWidth > 1280) {
    terminalContainer.style.width = elementWidth + "px";
    input.style.width = elementWidth + "px";
  } else {
    terminalContainer.style.width = "100%";
    input.style.width = "100%";
  }
}


</script>

<script lang="ts">
import { onMount, onDestroy } from "svelte";

let showFinder = false;

function handleKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    //the fullscreen terminal brings its own finder while it's open
    const fullscreen = document.getElementById("fullscreenTerminal");
    if (fullscreen instanceof HTMLInputElement && fullscreen.checked) return;
    e.preventDefault();
    showFinder = true;
  }
}

if (browser) {
  onMount(() => {
    window.addEventListener("resize", updateElementWidth);
    window.addEventListener("keydown", handleKeyDown);
    updateElementWidth(); // Initial call to set width on mount
    window.toggleTerminalLine = toggleLineCollapse;
  });

  onDestroy(() => {
    window.removeEventListener("resize", updateElementWidth);
    window.removeEventListener("keydown", handleKeyDown);
    delete window.toggleTerminalLine;
  });

}
</script>

<div class="bg-base-300 rounded-xl px-4 py-3 shadow-xl neutralGradientStroke" id="terminalContainerContainer">
        <p class="font-ubuntu text-gray-200 text-lg ml-1 mb-2">Server Console</p>
  <div  class="relative mb-3 w-full ">
    <FullscreenTerminal />
    <TerminalFinder isVisible={showFinder} fullscreen={false} on:close={() => showFinder = false} />
    <div
      id="terminalContainer"
      class="bg-base-100 rounded-xl overflow-auto  h-[30rem] 2xl:h-[35rem] mb-2 "
    >
      <div class="p-5 text-sm xl:text-[1rem] font-mono relative ">
        <p id="terminal" />
      </div>
    </div>
  </div>
<div class=" w-full flex items-center gap-2 relative">
  <input
  on:keypress={writeCmd}
  id="input"
  type="text"
  placeholder={$t("p.enterCommand")}
  class="input  bg-base-100 w-full"
/>
<button class="btn btn-ghost btn-circle absolute right-0" on:click={()=>send(document.getElementById("input").value)}
><SendIcon size=20  /></button>


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
