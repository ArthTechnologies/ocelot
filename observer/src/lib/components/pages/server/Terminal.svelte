

<script lang="ts" context="module">

    import { browser } from "$app/environment";
    import FullscreenTerminal from "$lib/components/buttons/FullscreenTerminal.svelte";
    import TerminalFinder from "$lib/components/ui/TerminalFinder.svelte";
    import { t } from "$lib/scripts/i18n";
    import { readTerminal, writeTerminal } from "$lib/scripts/req";
    import { alert, groupStackFrames, stripLogLevelBlocks } from "$lib/scripts/utils";
    import { condenseTimestamps, groupSimilarLines, showLineNumbers } from "$lib/stores/terminalPrefs";
    import { get } from "svelte/store";
    import { CopyIcon, SendIcon, Wrench } from "lucide-svelte";

    export let id: number;

    function condenseTimestamp(timeStr: string): string {
      return timeStr.replace(/\[(\d{1,2}):(\d{2}):(\d{2})\]/g, (_, hours, minutes) => {
        const hour = parseInt(hours);
        const min = minutes;
        const period = hour >= 12 ? 'pm' : 'am';
        const displayHour = hour % 12 || 12;
        return `[${displayHour}:${min}${period}]`;
      });
    }

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
  //data-lines holds the console text before the line-number markup is wrapped
  //around it, so this copies what the server actually printed
  function copyTerminal() {
    const terminal = document.getElementById("terminal");
    const text = terminal?.getAttribute("data-lines") || "";

    if (text.trim() === "") {
      alert("Nothing in the console to copy");
      return;
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => alert("Console copied to clipboard", "success"),
        () => fallbackCopy(text)
      );
    } else {
      //a panel served over plain http has no navigator.clipboard at all
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text: string) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (e) {
      copied = false;
    }
    document.body.removeChild(area);

    if (copied) {
      alert("Console copied to clipboard", "success");
    } else {
      alert("Could not copy the console");
    }
  }

  let scrollCorrected = false;
  let collapsedLines = new Set();

  // Whether the container's scroll position is at (or within a few px of) the
  // bottom. Must be checked against the scrollable element itself, not an
  // ancestor - an ancestor's clientHeight includes the header/input chrome
  // too, which makes the threshold too generous and reports "at bottom" even
  // when scrolled well up.
  function isNearBottom(container: HTMLElement, threshold = 10) {
    return container.scrollTop + container.clientHeight >= container.scrollHeight - threshold;
  }

  // Written straight to the DOM rather than to a Svelte-bound variable: this
  // block and the onMount below sit in two different <script> tags (module vs
  // instance context), and reassigning a module-context variable never
  // triggers a re-render - the indicator would just freeze at its first value.
  function updateStickIndicator(atBottom: boolean) {
    const dot = document.getElementById("stickIndicatorDot");
    if (dot) {
      dot.classList.toggle("bg-white", atBottom);
      dot.classList.toggle("bg-gray-500", !atBottom);
    }
  }

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
    const shouldGroup = get(groupSimilarLines);
    const shouldCondense = get(condenseTimestamps);
    const shouldShowLineNumbers = get(showLineNumbers);
    const rows = shouldGroup
      ? groupStackFrames(lineArray)
      : lineArray.map((line, index) => ({ lineNum: index + 1, lines: [line] }));

    // On first render, collapse all lines by default
    if (collapsedLines.size === 0) {
      rows.forEach((row) => collapsedLines.add(row.lineNum));
    }

    let html = '<div class="terminal-output">';

    rows.forEach((row) => {
      const lineNum = row.lineNum;
      const isCollapsed = collapsedLines.has(lineNum);
      const displayClass = isCollapsed ? "terminal-line-collapsed" : "";

      const frames = row.lines.map(stripLogLevelBlocks);
      //while collapsed only the first frame is visible, so the rest of the
      //trace is advertised on that line rather than below the fold
      let content = frames[0];
      if (shouldCondense) {
        content = condenseTimestamp(content);
      }
      if (frames.length > 1) {
        if (isCollapsed) {
          content += `<span class="terminal-frame-count">+${frames.length - 1} more</span>`;
        }
        let remainingFrames = frames.slice(1).join("\n");
        if (shouldCondense) {
          remainingFrames = condenseTimestamp(remainingFrames);
        }
        content += "\n" + remainingFrames;
      }

      const lineNumberHtml = shouldShowLineNumbers
        ? `<div class="terminal-line-number">${lineNum}</div>`
        : "";

      html += `<div class="terminal-line-wrapper ${displayClass}" data-line="${lineNum}">
        ${lineNumberHtml}
        <div class="terminal-line-content" onclick="window.toggleTerminalLine(${lineNum})">${content}</div>
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
        if (!terminalContainer || !terminal) return;

        // Must be read before anything below moves the scrollbar - the nudges
        // further down used to run unconditionally on every poll, which kept
        // dragging scrollTop back down even right after the user scrolled up,
        // so this check never had a chance to see "scrolled away" for long.
        const wasAtBottom = isNearBottom(terminalContainer);

        const filteredResponse = response
          .replace(/\x1B\[[0-9;]*[mG]/g, "")
          .replace(/\n/g, "<LINEBREAK>");

        if (response.length < 1000000) {
          const oldLineCount = (terminal.getAttribute("data-lines") || "").split("\n").length;
          const newLineCount = filteredResponse.split("<LINEBREAK>").length;

          if (wasAtBottom) {
            terminalContainer.scrollTop += 50 * (newLineCount - oldLineCount);
          }

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

          if (wasAtBottom) {
            terminalContainer.scrollTop += 50 * (newLineCount - oldLineCount);
          }
          terminal.setAttribute("data-lines", truncated.replace(/<LINEBREAK>/g, "\n"));
          renderTerminalLines();
        }

        // Only follow new output down if the user was already at the bottom -
        // otherwise leave their scroll position exactly where they put it.
        if (wasAtBottom) {
          setTimeout(() => {
            terminalContainer.scrollTop = terminalContainer.scrollHeight;
            updateStickIndicator(true);
          }, 1);
        }

        //if this is the first time the terminal is loaded, this will scroll to the bottom.
        if (scrollCorrected == false) {
          terminalContainer.scrollTop = terminalContainer.scrollHeight;
          scrollCorrected = true;
        }

        updateStickIndicator(wasAtBottom);
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

  return ratio * screenWidth + 40;
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
let showPrefs = false;
let prefsRef: HTMLDivElement | undefined;

function togglePrefs() {
  showPrefs = !showPrefs;
}

function handleClickOutside(e: MouseEvent) {
  if (showPrefs && prefsRef && !prefsRef.contains(e.target as Node)) {
    showPrefs = false;
  }
}

// Re-render whenever a preference changes - safe to call before the terminal
// has any content, renderTerminalLines() no-ops until data-lines exists.
$: if (browser) {
  $condenseTimestamps;
  $groupSimilarLines;
  $showLineNumbers;
  renderTerminalLines();
}

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
    window.addEventListener("mousedown", handleClickOutside);
    updateElementWidth(); // Initial call to set width on mount
    window.toggleTerminalLine = toggleLineCollapse;
    (window as any).renderTerminalLines = renderTerminalLines;

    const terminalContainer = document.getElementById("terminalContainer");
    if (terminalContainer) {
      terminalContainer.addEventListener("scroll", () => {
        updateStickIndicator(isNearBottom(terminalContainer));
      });
    }
  });

  onDestroy(() => {
    window.removeEventListener("resize", updateElementWidth);
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("mousedown", handleClickOutside);
    delete window.toggleTerminalLine;
  });

}
</script>

<div class="bg-base-300 rounded-xl px-4 py-3 shadow-xl neutralGradientStroke" id="terminalContainerContainer">
  <div class="flex items-center justify-between mb-2">
    <p class="font-ubuntu text-gray-200 text-lg ml-1">Server Console</p>
    <div class="flex items-center gap-3">
      <div class="flex items-center justify-center w-7 h-7 rounded-md bg-base-200/50">
        <div id="stickIndicatorDot" class="w-2 h-2 rounded-full transition-colors bg-white"></div>
      </div>
      <div class="relative" bind:this={prefsRef}>
        <div class="tooltip tooltip-left" data-tip="Console preferences">
          <button
            class="btn btn-ghost btn-sm btn-circle"
            on:click={togglePrefs}
            aria-label="Console preferences"
          >
            <Wrench size="16" />
          </button>
        </div>
        {#if showPrefs}
          <div class="terminal-prefs-dropdown">
            <p class="text-xs font-semibold text-gray-300 mb-2">Preferences</p>
            <label class="flex items-center gap-2 py-1 cursor-pointer">
              <input type="checkbox" bind:checked={$condenseTimestamps} class="checkbox checkbox-xs" />
              <span class="text-xs text-gray-300">Condense Timestamps</span>
            </label>
            <label class="flex items-center gap-2 py-1 cursor-pointer">
              <input type="checkbox" bind:checked={$groupSimilarLines} class="checkbox checkbox-xs" />
              <span class="text-xs text-gray-300">Group together similar lines</span>
            </label>
            <label class="flex items-center gap-2 py-1 cursor-pointer">
              <input type="checkbox" bind:checked={$showLineNumbers} class="checkbox checkbox-xs" />
              <span class="text-xs text-gray-300">Show line numbers</span>
            </label>
          </div>
        {/if}
      </div>
      <div class="tooltip tooltip-left" data-tip="Copy console">
        <button
          class="btn btn-ghost btn-sm btn-circle"
          on:click={copyTerminal}
          aria-label="Copy console to clipboard"
        >
          <CopyIcon size="16" />
        </button>
      </div>
    </div>
  </div>
  <div  class="relative mb-3 w-full ">
    <FullscreenTerminal />
    <TerminalFinder isVisible={showFinder} fullscreen={false} on:close={() => showFinder = false} />
    <div
      id="terminalContainer"
      class="bg-base-100 rounded-xl overflow-auto  h-[30rem] 2xl:h-[35rem] mb-2 "
    >
      <div class="{$showLineNumbers ? 'pl-1' : 'pl-4'} pr-4 py-5 text-[14px] font-mono relative ">
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
  .terminal-prefs-dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 0.5rem);
    z-index: 30;
    width: 14rem;
    padding: 0.75rem;
    border-radius: 0.5rem;
    background: var(--fallback-b2, oklch(var(--b2)));
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);

    @media (prefers-color-scheme: light) {
      border-color: rgba(0, 0, 0, 0.1);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
  }

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

  :global(.terminal-frame-count) {
    margin-left: 0.5rem;
    padding: 0 0.35rem;
    border-radius: 0.25rem;
    font-size: 0.8em;
    background-color: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.55);

    @media (prefers-color-scheme: light) {
      background-color: rgba(0, 0, 0, 0.07);
      color: rgba(0, 0, 0, 0.5);
    }
  }

  //the theme toggle stamps data-theme on :root, and it has to win over the
  //prefers-color-scheme default above
  :global(:root[data-theme="light"] .terminal-frame-count) {
    background-color: rgba(0, 0, 0, 0.07);
    color: rgba(0, 0, 0, 0.5);
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
