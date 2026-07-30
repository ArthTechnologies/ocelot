<script>
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { writeTerminal } from "$lib/scripts/req";
  import TerminalFinder from "$lib/components/ui/TerminalFinder.svelte";
  import { Maximize2, Minimize2 } from "lucide-svelte";
  import { t } from "$lib/scripts/i18n";
  let id;
  let scrollCorrected = false;
  let isFocused = false;
  let showFinder = false;

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
      if (terminal2 != null) {
        //scroll down the height of the new lines added
        if (
          terminal2.innerHTML.split("<p>").length <
          terminal.innerHTML.split("<p>").length
        ) {
          terminalContainer2.scrollTop +=
            12 *
            (terminal.innerHTML.split("<p>").length -
              terminal2.innerHTML.split("<p>").length);
        }
        document.getElementById("terminal2").innerHTML =
          document.getElementById("terminal").innerHTML;
      }
    }
  }, 100);

  function correctScroll() {
    const terminalContainer2 = document.getElementById("terminalContainer2");
    if (!scrollCorrected && terminalContainer2 != null) {
      terminalContainer2.scrollTop = terminalContainer2.scrollHeight;
      scrollCorrected = true;
    }

    isFocused = !isFocused;
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault();
      showFinder = true;
    }
  }

  if (browser) {
    onMount(() => {
      window.addEventListener("keydown", handleKeyDown);
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
