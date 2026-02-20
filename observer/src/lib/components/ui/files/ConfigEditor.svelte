<script>
  import { browser } from "$app/environment";
  import { Code, FileText, ChevronDown, ChevronRight } from "lucide-svelte";

  export let initialContent = "";
  export let fileType = "yaml"; // "yaml" or "properties"

  let rawMode = false;
  let rawContent = "";
  let parsedLines = [];
  let originalContent = "";
  let collapsedSections = {};

  // Enable/disable save button based on changes
  function saveIndicator() {
    if (browser) {
      const editor = document.getElementById("textEditor");
      const filepath = document.getElementById("filepath");
      const saveButton = document.getElementById("saveButton");

      if (editor && filepath && saveButton) {
        if (editor.value === originalContent) {
          filepath.innerHTML = filepath.innerHTML.replace("*", "");
          saveButton.classList.add("btn-disabled");
        } else {
          if (!filepath.innerHTML.endsWith("*")) {
            filepath.innerHTML += "*";
          }
          saveButton.classList.remove("btn-disabled");
        }
      }
    }
  }

  // Parse content based on file type
  function parseContent(content) {
    if (fileType === "properties") {
      return parseProperties(content);
    }
    return parseYaml(content);
  }

  // Generate content based on file type
  function generateContent() {
    if (fileType === "properties") {
      return generateProperties();
    }
    return generateYaml();
  }

  // Parse .properties file format
  function parseProperties(content) {
    const lines = content.split("\n");
    const result = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === "") {
        result.push({ type: "empty", indent: 0, lineNum: i });
      } else if (trimmed.startsWith("#")) {
        result.push({
          type: "comment",
          value: trimmed.substring(1).trim(),
          rawLine: line,
          indent: 0,
          lineNum: i
        });
      } else if (trimmed.includes("=")) {
        const eqIndex = trimmed.indexOf("=");
        const key = trimmed.substring(0, eqIndex).trim();
        const value = trimmed.substring(eqIndex + 1).trim();

        result.push({
          type: "keyvalue",
          key,
          value,
          inlineComment: "",
          indent: 0,
          lineNum: i,
          valueType: detectValueType(value)
        });
      } else {
        result.push({
          type: "raw",
          value: line,
          indent: 0,
          lineNum: i
        });
      }
    }

    return result;
  }

  // Generate .properties file from parsed structure
  function generateProperties() {
    let result = [];

    for (const line of parsedLines) {
      switch (line.type) {
        case "empty":
          result.push("");
          break;
        case "comment":
          if (line.value) {
            result.push("#" + line.value);
          } else {
            result.push("#");
          }
          break;
        case "keyvalue":
          result.push(line.key + "=" + line.value);
          break;
        case "raw":
          result.push(line.value);
          break;
      }
    }

    return result.join("\n");
  }

  // Parse YAML into structured lines
  function parseYaml(content) {
    const lines = content.split("\n");
    const result = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Calculate indentation level (2 spaces = 1 level)
      const leadingSpaces = line.match(/^(\s*)/)[1].length;
      const indent = Math.floor(leadingSpaces / 2);

      if (trimmed === "") {
        result.push({ type: "empty", indent, lineNum: i });
      } else if (trimmed.startsWith("#")) {
        result.push({
          type: "comment",
          value: trimmed.substring(1).trim(),
          rawLine: line,
          indent,
          lineNum: i
        });
      } else if (trimmed.includes(":")) {
        const colonIndex = trimmed.indexOf(":");
        const key = trimmed.substring(0, colonIndex).trim();
        const valueAfterColon = trimmed.substring(colonIndex + 1).trim();

        let value = valueAfterColon;
        let inlineComment = "";

        if (valueAfterColon.includes(" #")) {
          const commentIndex = valueAfterColon.indexOf(" #");
          value = valueAfterColon.substring(0, commentIndex).trim();
          inlineComment = valueAfterColon.substring(commentIndex + 2).trim();
        }

        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
          value = value.substring(1, value.length - 1);
        }

        if (value === "" || value === "|" || value === ">") {
          result.push({
            type: "section",
            key,
            indent,
            multiline: value === "|" || value === ">",
            multilineStyle: value,
            lineNum: i
          });
        } else {
          result.push({
            type: "keyvalue",
            key,
            value,
            inlineComment,
            indent,
            lineNum: i,
            valueType: detectValueType(value)
          });
        }
      } else if (trimmed.startsWith("- ")) {
        const listValue = trimmed.substring(2).trim();
        result.push({
          type: "listitem",
          value: listValue,
          indent,
          lineNum: i
        });
      } else {
        result.push({
          type: "raw",
          value: line,
          indent,
          lineNum: i
        });
      }
    }

    return result;
  }

  // Detect value type for input styling
  function detectValueType(value) {
    if (value === "true" || value === "false") return "boolean";
    if (!isNaN(value) && value !== "") return "number";
    return "string";
  }

  // Generate YAML from parsed structure
  function generateYaml() {
    let result = [];

    for (const line of parsedLines) {
      const spaces = "  ".repeat(line.indent);

      switch (line.type) {
        case "empty":
          result.push("");
          break;
        case "comment":
          if (line.value) {
            result.push(spaces + "# " + line.value);
          } else {
            result.push(spaces + "#");
          }
          break;
        case "section":
          if (line.multiline) {
            result.push(spaces + line.key + ": " + line.multilineStyle);
          } else {
            result.push(spaces + line.key + ":");
          }
          break;
        case "keyvalue":
          let val = line.value;
          if (line.valueType === "string" && needsQuotes(val)) {
            val = '"' + val.replace(/"/g, '\\"') + '"';
          }
          let lineStr = spaces + line.key + ": " + val;
          if (line.inlineComment) {
            lineStr += " # " + line.inlineComment;
          }
          result.push(lineStr);
          break;
        case "listitem":
          result.push(spaces + "- " + line.value);
          break;
        case "raw":
          result.push(line.value);
          break;
      }
    }

    return result.join("\n");
  }

  // Check if a string value needs quotes (YAML only)
  function needsQuotes(val) {
    if (val === "") return false;
    const special = ["true", "false", "yes", "no", "on", "off", "null", "~"];
    if (special.includes(val.toLowerCase())) return false;
    if (/[:{}\[\],&*#?|<>=!%@`]/.test(val)) return true;
    if (val.startsWith(" ") || val.endsWith(" ")) return true;
    return false;
  }

  // Update value and sync
  function updateValue(index, newValue) {
    parsedLines[index].value = newValue;
    syncToTextEditor();
  }

  // Update comment
  function updateComment(index, newValue) {
    parsedLines[index].value = newValue;
    syncToTextEditor();
  }

  // Toggle boolean
  function toggleBoolean(index) {
    const current = parsedLines[index].value;
    parsedLines[index].value = current === "true" ? "false" : "true";
    syncToTextEditor();
  }

  // Sync generated content to the hidden textarea
  function syncToTextEditor() {
    if (browser) {
      const editor = document.getElementById("textEditor");
      if (editor) {
        const newContent = generateContent();
        editor.value = newContent;
        saveIndicator();
      }
    }
  }

  // Toggle section collapse (YAML only)
  function toggleSection(lineNum) {
    collapsedSections[lineNum] = !collapsedSections[lineNum];
    collapsedSections = collapsedSections;
  }

  // Check if a line should be hidden due to collapsed parent (YAML only)
  function isHidden(index, collapsed) {
    if (fileType === "properties") return false;

    const line = parsedLines[index];
    for (let i = index - 1; i >= 0; i--) {
      const prevLine = parsedLines[i];
      if (prevLine.type === "section" && prevLine.indent < line.indent) {
        if (collapsed[prevLine.lineNum]) {
          return true;
        }
        if (isHidden(i, collapsed)) return true;
        break;
      }
    }
    return false;
  }

  // Get children count for a section (YAML only)
  function getChildrenCount(index) {
    const section = parsedLines[index];
    let count = 0;
    for (let i = index + 1; i < parsedLines.length; i++) {
      if (parsedLines[i].indent <= section.indent && parsedLines[i].type !== "empty") {
        break;
      }
      if (parsedLines[i].type !== "empty" && parsedLines[i].type !== "comment") {
        count++;
      }
    }
    return count;
  }

  // Initialize
  function init(content) {
    rawContent = content;
    originalContent = content;
    parsedLines = parseContent(content);
  }

  // Watch for content changes from parent
  $: if (initialContent) {
    init(initialContent);
  }

  // Listen for external content updates
  if (browser) {
    document.addEventListener("configContentUpdate", function(e) {
      if (e.detail.fileType) {
        fileType = e.detail.fileType;
      }
      init(e.detail.content);
    });
  }

  // Toggle raw mode
  function toggleRawMode() {
    if (rawMode) {
      const editor = document.getElementById("textEditor");
      if (editor) {
        parsedLines = parseContent(editor.value);
      }
    }
    rawMode = !rawMode;
  }
</script>

<div class="config-editor h-full flex flex-col overflow-hidden">
  <!-- Mode Toggle -->
  <div class="flex justify-end mb-2">
    <button
      class="btn btn-xs btn-ghost gap-1"
      on:click={toggleRawMode}
    >
      {#if rawMode}
        <FileText size={14} />
        Pretty Mode
      {:else}
        <Code size={14} />
        Raw Mode
      {/if}
    </button>
  </div>

  {#if rawMode}
    <textarea
      class="textarea w-full bg-base-200 bg-opacity-25 flex-1 font-mono text-sm"
      id="textEditor"
      style="resize: none;"
      on:input={saveIndicator}
    >{rawContent}</textarea>
  {:else}
    <div class="flex-1 min-h-0 overflow-y-auto space-y-1 pr-2 pb-4">
      {#each parsedLines as line, index}
        {#if !isHidden(index, collapsedSections)}
          {#if line.type === "empty"}
            <div class="h-2"></div>
          {:else if line.type === "comment"}
            <div
              class="flex items-start gap-2 py-1 group"
              style="padding-left: {line.indent * 16}px"
            >
              <span class="text-gray-500 select-none">#</span>
              <input
                type="text"
                class="bg-transparent text-gray-400 italic text-sm flex-1 outline-none border-b border-transparent focus:border-gray-600 transition-colors"
                value={line.value}
                on:input={(e) => updateComment(index, e.target.value)}
              />
            </div>
          {:else if line.type === "section"}
            <div
              class="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-base-200 rounded transition-colors"
              style="padding-left: {line.indent * 16}px"
              on:click={() => toggleSection(line.lineNum)}
              on:keypress={(e) => e.key === 'Enter' && toggleSection(line.lineNum)}
              role="button"
              tabindex="0"
            >
              {#if collapsedSections[line.lineNum]}
                <ChevronRight size={16} class="text-gray-400" />
              {:else}
                <ChevronDown size={16} class="text-gray-400" />
              {/if}
              <span class="font-semibold text-primary">{line.key}</span>
              <span class="text-xs text-gray-500">
                ({getChildrenCount(index)} items)
              </span>
            </div>
          {:else if line.type === "keyvalue"}
            <div
              class="flex items-center gap-3 py-1 group"
              style="padding-left: {(line.indent * 16) + (fileType === 'yaml' ? 24 : 0)}px"
            >
              <label class="text-sm text-gray-300 min-w-[120px] truncate" title={line.key}>
                {line.key}
              </label>

              {#if line.valueType === "boolean"}
                <button
                  class="btn btn-xs {line.value === 'true' ? 'btn-success' : 'btn-error'}"
                  on:click={() => toggleBoolean(index)}
                >
                  {line.value}
                </button>
              {:else if line.valueType === "number"}
                <input
                  type="number"
                  class="input input-xs input-bordered bg-base-200 w-32 font-mono"
                  value={line.value}
                  on:input={(e) => updateValue(index, e.target.value)}
                />
              {:else}
                <input
                  type="text"
                  class="input input-xs input-bordered bg-base-200 flex-1 max-w-md font-mono"
                  value={line.value}
                  on:input={(e) => updateValue(index, e.target.value)}
                />
              {/if}

              {#if line.inlineComment}
                <span class="text-xs text-gray-500 italic">
                  # {line.inlineComment}
                </span>
              {/if}
            </div>
          {:else if line.type === "listitem"}
            <div
              class="flex items-center gap-2 py-1"
              style="padding-left: {line.indent * 16 + 24}px"
            >
              <span class="text-gray-500">•</span>
              <input
                type="text"
                class="input input-xs input-bordered bg-base-200 flex-1 max-w-md font-mono"
                value={line.value}
                on:input={(e) => { parsedLines[index].value = e.target.value; syncToTextEditor(); }}
              />
            </div>
          {:else if line.type === "raw"}
            <div
              class="py-1 font-mono text-sm text-gray-400"
              style="padding-left: {line.indent * 16}px"
            >
              {line.value}
            </div>
          {/if}
        {/if}
      {/each}
    </div>

    <textarea
      class="hidden"
      id="textEditor"
      bind:value={rawContent}
    ></textarea>
  {/if}
</div>

<style>
  .config-editor {
    font-family: inherit;
  }

  input[type="text"]:focus,
  input[type="number"]:focus {
    outline: none;
    border-color: oklch(var(--p));
  }

  .overflow-y-auto::-webkit-scrollbar {
    width: 6px;
  }

  .overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
  }

  .overflow-y-auto::-webkit-scrollbar-thumb {
    background: oklch(var(--bc) / 0.2);
    border-radius: 3px;
  }

  .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: oklch(var(--bc) / 0.3);
  }
</style>
