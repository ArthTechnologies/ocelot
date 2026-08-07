<script>
  import { browser } from "$app/environment";
  import { onMount, onDestroy } from "svelte";
  import { writeTerminal } from "$lib/scripts/req";
  import { groupStackFrames, stripLogLevelBlocks, portal } from "$lib/scripts/utils";
  import { condenseTimestamps, groupSimilarLines, lineCondensation, showLineNumbers } from "$lib/stores/terminalPrefs";
  import TerminalFinder from "$lib/components/ui/TerminalFinder.svelte";
  import { Maximize2, Minimize2 } from "lucide-svelte";
  import { t } from "$lib/scripts/i18n";
  let id;
  let scrollCorrected = false;
  let isFocused = false;
  let showFinder = false;
  let collapsedLines2 = new Set();
  let seenLines2 = new Set();

  //also matches paper-style "[03:07:41 INFO]" stamps. The level word is kept -
  //removing it is Line Condensation's job (stripLogLevelBlocks), not this pref's
  /** @param {string} timeStr */
  function condenseTimestamp(timeStr) {
    return timeStr.replace(/\[(\d{1,2}):(\d{2}):(\d{2})( [A-Za-z]+)?\]/g, (/** @type {string} */ _, /** @type {string} */ hours, /** @type {string} */ minutes, /** @type {string} */ _seconds, /** @type {string} */ level) => {
      const hour = parseInt(hours);
      const min = minutes;
      const period = hour >= 12 ? 'pm' : 'am';
      const displayHour = hour % 12 || 12;
      return `[${displayHour}:${min}${period}${level || ""}]`;
    });
  }

  if (browser) {
    id = localStorage.getItem("serverID");
  }

  // Keeps the fullscreen terminal in sync with the same preferences used by
  // the inline terminal - re-render whenever a toggle changes.
  $: if (browser) {
    $condenseTimestamps;
    $groupSimilarLines;
    $showLineNumbers;
    $lineCondensation;
    renderTerminalLines2();
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
    const shouldGroup = $groupSimilarLines;
    const shouldCondense = $condenseTimestamps;
    const shouldShowLineNumbers = $showLineNumbers;
    const rows = shouldGroup
      ? groupStackFrames(lineArray)
      : lineArray.map((line, index) => ({ lineNum: index + 1, lines: [line] }));

    // Any row not seen before starts collapsed - not just the initial backlog,
    // so lines (and groups) arriving live get condensed too. Rows the user
    // expanded stay in seenLines2 but out of collapsedLines2, so they keep
    // their state across re-renders and pref toggles.
    rows.forEach((row) => {
      if (!seenLines2.has(row.lineNum)) {
        seenLines2.add(row.lineNum);
        collapsedLines2.add(row.lineNum);
      }
    });

    let html = '<div class="terminal-output">';

    rows.forEach((row) => {
      const lineNum = row.lineNum;
      //with Line Condensation off every row renders at full height
      const isCollapsed = $lineCondensation && collapsedLines2.has(lineNum);
      //only a row showing the +N more badge reserves space for it, so a
      //single-line row isn't padded out to the spacer's height
      const hasBadge = isCollapsed && row.lines.length > 1;
      const displayClass =
        (isCollapsed ? "terminal-line-collapsed" : "") + (hasBadge ? " terminal-line-badged" : "");

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
        <div class="terminal-line-content" onclick="window.toggleTerminalLine2(${lineNum})">${content}</div>
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

{#if browser}
<div use:portal>
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
</div>
{/if}

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
    opacity: 0.9;

    &:hover {
      opacity: 1;
    }
  }

  //the two-line clamp lives on the content rather than a max-height on the
  //wrapper: -webkit-line-clamp puts a "..." exactly where the second line is
  //cut. Expanded rows show everything untouched.
  :global(.terminal-line-collapsed .terminal-line-content) {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  //invisible spacer reserving the ~10 characters the +N more badge sits over.
  //A float's exclusion zone is its margin box, so margin-top can't push it off
  //the first line - it only makes the exclusion taller. shape-outside is what
  //actually frees line one: the float spans both lines but its shape starts a
  //line down, so only line two wraps early, and only when it runs that far
  //right. The em pair is a fallback for browsers without the lh unit.
  :global(.terminal-line-badged .terminal-line-content::before) {
    content: "";
    float: right;
    width: 10ch;
    height: 3em;
    shape-outside: inset(1.5em 0 0 0);
    height: 2lh;
    shape-outside: inset(1lh 0 0 0);
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

  //pinned to the wrapper's bottom-right (the wrapper is position: relative,
  //and its box height is clamped while collapsed) so long wrapped text can
  //neither push it off-screen nor below the collapse clip. The near-solid
  //background keeps it readable over whatever text it sits on.
  :global(.terminal-frame-count) {
    position: absolute;
    bottom: 0;
    right: 0.5rem;
    padding: 0 0.35rem;
    border-radius: 0.25rem;
    font-size: 0.8em;
    white-space: nowrap;
    background-color: rgb(58, 63, 74);
    color: rgba(255, 255, 255, 0.75);

    @media (prefers-color-scheme: light) {
      background-color: rgb(219, 222, 228);
      color: rgba(0, 0, 0, 0.65);
    }
  }

  //the theme toggle stamps data-theme on :root, and it has to win over the
  //prefers-color-scheme default above
  :global(:root[data-theme="light"] .terminal-frame-count) {
    background-color: rgb(219, 222, 228);
    color: rgba(0, 0, 0, 0.65);
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
