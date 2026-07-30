<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import { X, ChevronUp, ChevronDown } from "lucide-svelte";

  export let isVisible = false;
  export let fullscreen = false;

  const dispatch = createEventDispatcher();

  let searchInput = "";
  let currentMatch = 0;
  let totalMatches = 0;
  let inputRef: HTMLInputElement;

  function getTerminalContent(): string {
    const terminalEl = fullscreen
      ? document.getElementById("terminal2")
      : document.getElementById("terminal");
    return terminalEl?.innerText || "";
  }

  function highlightMatches() {
    const terminalEl = fullscreen
      ? document.getElementById("terminal2")
      : document.getElementById("terminal");

    if (!terminalEl || !searchInput.trim()) {
      terminalEl.innerHTML = terminalEl.innerHTML.replace(
        /<span class="terminal-match".*?<\/span>/g,
        (match) => {
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = match;
          return tempDiv.textContent || "";
        }
      );
      totalMatches = 0;
      currentMatch = 0;
      return;
    }

    const content = getTerminalContent();
    const regex = new RegExp(`(${searchInput.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const matches = content.match(regex);
    totalMatches = matches ? matches.length : 0;
    currentMatch = totalMatches > 0 ? 1 : 0;

    if (totalMatches > 0) {
      let html = terminalEl.innerHTML;
      let matchCount = 0;

      html = html.replace(
        regex,
        (match) => {
          matchCount++;
          const isCurrentMatch = matchCount === currentMatch;
          return `<span class="terminal-match ${isCurrentMatch ? "terminal-match-current" : ""}">${match}</span>`;
        }
      );

      terminalEl.innerHTML = html;
      scrollToCurrentMatch();
    }
  }

  function scrollToCurrentMatch() {
    const terminalContainer = fullscreen
      ? document.getElementById("terminalContainer2")
      : document.getElementById("terminalContainer");

    const currentMatchEl = document.querySelector(".terminal-match-current");
    if (currentMatchEl && terminalContainer) {
      currentMatchEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function nextMatch() {
    if (totalMatches === 0) return;
    currentMatch = currentMatch === totalMatches ? 1 : currentMatch + 1;
    highlightMatches();
  }

  function prevMatch() {
    if (totalMatches === 0) return;
    currentMatch = currentMatch === 1 ? totalMatches : currentMatch - 1;
    highlightMatches();
  }

  function close() {
    isVisible = false;
    searchInput = "";
    dispatch("close");
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      nextMatch();
    } else if (e.key === "Escape") {
      close();
    }
  }

  onMount(() => {
    if (isVisible && inputRef) {
      inputRef.focus();
    }
  });

  $: if (isVisible && inputRef) {
    setTimeout(() => inputRef?.focus(), 0);
  }

  $: if (isVisible) {
    highlightMatches();
  }
</script>

{#if isVisible}
  <div
    class="terminal-finder-container"
    class:fullscreen
  >
    <div class="terminal-finder">
      <div class="terminal-finder-input-wrapper">
        <input
          bind:this={inputRef}
          bind:value={searchInput}
          type="text"
          placeholder="Find in terminal..."
          class="terminal-finder-input"
          on:keydown={handleKeyDown}
          on:input={highlightMatches}
        />
        <div class="terminal-finder-count">
          {totalMatches > 0 ? `${currentMatch}/${totalMatches}` : "No matches"}
        </div>
      </div>

      <div class="terminal-finder-buttons">
        <button
          class="terminal-finder-btn"
          disabled={totalMatches === 0}
          on:click={prevMatch}
          title="Previous match (Shift+Enter)"
        >
          <ChevronUp size={16} />
        </button>
        <button
          class="terminal-finder-btn"
          disabled={totalMatches === 0}
          on:click={nextMatch}
          title="Next match (Enter)"
        >
          <ChevronDown size={16} />
        </button>
        <button
          class="terminal-finder-btn terminal-finder-close-btn"
          on:click={close}
          title="Close (Esc)"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  .terminal-finder-container {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 100;
    padding: 1rem;

    &.fullscreen {
      position: fixed;
      top: 1rem;
      right: 1rem;
      z-index: 1001;
    }
  }

  .terminal-finder {
    display: flex;
    gap: 0.5rem;
    background: var(--terminal-finder-bg, #2a2a3e);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 0.5rem;
    padding: 0.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .terminal-finder-input-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 200px;
  }

  .terminal-finder-input {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.9);
    padding: 0.4rem 0.6rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    flex: 1;
    font-family: monospace;

    &::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }

    &:focus {
      outline: none;
      border-color: rgba(99, 102, 241, 0.6);
      background: rgba(99, 102, 241, 0.1);
    }
  }

  .terminal-finder-count {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.75rem;
    font-family: monospace;
    white-space: nowrap;
  }

  .terminal-finder-buttons {
    display: flex;
    gap: 0.25rem;
  }

  .terminal-finder-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.7);
    padding: 0.4rem;
    border-radius: 0.375rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;

    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.25);
      color: rgba(255, 255, 255, 0.9);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  .terminal-finder-close-btn {
    &:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.2);
      border-color: rgba(239, 68, 68, 0.4);
      color: #f87171;
    }
  }

  @media (prefers-color-scheme: light) {
    .terminal-finder {
      background: #f5f5f5;
      border-color: rgba(0, 0, 0, 0.1);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .terminal-finder-input {
      background: rgba(0, 0, 0, 0.04);
      border-color: rgba(0, 0, 0, 0.1);
      color: rgba(0, 0, 0, 0.9);

      &::placeholder {
        color: rgba(0, 0, 0, 0.4);
      }

      &:focus {
        border-color: rgba(99, 102, 241, 0.6);
        background: rgba(99, 102, 241, 0.08);
      }
    }

    .terminal-finder-count {
      color: rgba(0, 0, 0, 0.6);
    }

    .terminal-finder-btn {
      background: rgba(0, 0, 0, 0.04);
      border-color: rgba(0, 0, 0, 0.1);
      color: rgba(0, 0, 0, 0.7);

      &:hover:not(:disabled) {
        background: rgba(0, 0, 0, 0.08);
        border-color: rgba(0, 0, 0, 0.15);
        color: rgba(0, 0, 0, 0.9);
      }
    }

    .terminal-finder-close-btn {
      &:hover:not(:disabled) {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.2);
      }
    }
  }

  :root[data-theme="light"] {
    .terminal-finder {
      background: #f5f5f5;
      border-color: rgba(0, 0, 0, 0.1);
    }

    .terminal-finder-input {
      background: rgba(0, 0, 0, 0.04);
      border-color: rgba(0, 0, 0, 0.1);
      color: rgba(0, 0, 0, 0.9);

      &::placeholder {
        color: rgba(0, 0, 0, 0.4);
      }

      &:focus {
        border-color: rgba(99, 102, 241, 0.6);
        background: rgba(99, 102, 241, 0.08);
      }
    }

    .terminal-finder-count {
      color: rgba(0, 0, 0, 0.6);
    }

    .terminal-finder-btn {
      background: rgba(0, 0, 0, 0.04);
      border-color: rgba(0, 0, 0, 0.1);
      color: rgba(0, 0, 0, 0.7);

      &:hover:not(:disabled) {
        background: rgba(0, 0, 0, 0.08);
        border-color: rgba(0, 0, 0, 0.15);
        color: rgba(0, 0, 0, 0.9);
      }
    }
  }

  :global(.terminal-match) {
    background-color: rgba(251, 191, 36, 0.3);
    padding: 0.125rem;
  }

  :global(.terminal-match-current) {
    background-color: rgba(251, 191, 36, 0.6);
    padding: 0.125rem;
  }

  @media (prefers-color-scheme: light) {
    :global(.terminal-match) {
      background-color: rgba(251, 191, 36, 0.4);
    }

    :global(.terminal-match-current) {
      background-color: rgba(251, 191, 36, 0.7);
    }
  }

  :root[data-theme="light"] {
    :global(.terminal-match) {
      background-color: rgba(251, 191, 36, 0.4);
    }

    :global(.terminal-match-current) {
      background-color: rgba(251, 191, 36, 0.7);
    }
  }
</style>
