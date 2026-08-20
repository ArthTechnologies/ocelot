<script lang="ts">
  import { apiurl, usingOcelot, getServerNode, writeTerminal } from "$lib/scripts/req";
  import { lrurl } from "$lib/scripts/req";
  import { browser } from "$app/environment";
  import { t } from "$lib/scripts/i18n";
  import { BoxIcon, ChevronDown, ChevronUp, Clock, ExternalLink, InfoIcon, Send, Trash, Trash2 } from "lucide-svelte";
  import ChooseVersion from "./ChooseVersion.svelte";
  import ChooseModVersion from "./ChooseModVersion.svelte";
  import TranslateableText from "./TranslateableText.svelte";
    import ManagePluginSkele from "./ManagePluginSkele.svelte";
    import { alert } from "$lib/scripts/utils";

  export let name;
  export let id;
  export let platform;
  export let modtype;
  export let filename;
  export let date;
  export let disabled;
  export let desc = "";
  export let icon = "";
  export let slug = id;
  export let author = "";
  let state = "normal";
  let showInfo = true;
  let disableText = $t("disable");
  if (disabled) {
    disableText = $t("enable");
  }

  let time = new Date(date).toLocaleString();
  let serverId = "";
  const webmapurl =
    "http://" + apiurl.substring(0, apiurl.length - 1).split("https://")[1];
  let pregenRadius = "";

  $: lowerName = (name || "").toLowerCase();
  $: lowerFile = (filename || "").toLowerCase();
  $: isDynmap = modtype === "plugin" && (lowerName.includes("dynmap") || lowerFile.includes("dynmap"));
  $: isBluemap = modtype === "plugin" && (lowerName.includes("bluemap") || lowerFile.includes("bluemap"));
  $: isVoicechat = modtype === "plugin" && (lowerName.includes("voice chat") || lowerFile.includes("voicechat") || lowerFile.includes("voice-chat"));
  $: isChunky = modtype === "plugin" && (lowerName.includes("chunky") || lowerFile.includes("chunky"));
  $: isDiscordsrv = modtype === "plugin" && (lowerName.includes("discordsrv") || lowerFile.includes("discordsrv"));
  $: hasSpecial = isDynmap || isBluemap || isVoicechat || isChunky || isDiscordsrv;

  function dynmapRender() {
    writeTerminal(parseInt(serverId), "dynmap fullrender world");
  }

  function pregen() {
    writeTerminal(parseInt(serverId), "chunky start world circle 0 0 " + pregenRadius);
    pregenRadius = "";
  }

  let prefixToHandleFlexOnSM = "";
  if (platform == "cf" || platform == "lr") {
    prefixToHandleFlexOnSM = "sm:";
  }
  if (browser) {
    serverId = localStorage.getItem("serverID");
    //if screen is small, only say the date
    if (window.innerWidth < 768) {
      time = new Date(date).toLocaleString().split(",")[0];
    }
  }

  if (platform == "lr") {
    name = name.replace(/-/g, " ");

    fetch(lrurl + "project/" + id)
      .then((response) => response.json())
      .then((data) => {

        desc = data.description;
        slug = data.slug;
        name = data.title;
        icon = data.icon_url;
                if (data.description.includes("rate-limit")) {
          name = filename;
          desc = "Unable to fetch data from Modrinth."
        }
      });

    fetch(lrurl + "project/" + id + "/members")
      .then((response) => response.json())
      .then((data) => {
        if (data[0] != undefined) {author = data[0].user.username;
        } else {
          author = "Undefined";
        }
      });
  } else if (platform == "cf") {
    fetch(apiurl + "curseforge/" + id)
      .then((response) => response.json())
      .then((data) => {
        desc = data.summary;
        slug = data.slug;
        name = data.name;
        author = data.authors[0].name;
        icon = data.logo.thumbnailUrl;
      });
  } else if (platform == "gh") {
    author = id.split("/")[0];
    fetch("https://api.github.com/repos/" + id)
      .then((response) => response.json())
      .then((data) => {
        desc = data.description;
      });
  } else if (platform == "cx") {
    switch (name) {
      case "Geyser":
        desc =
          "A bridge/proxy allowing you to connect to Minecraft: Java Edition servers with Minecraft: Bedrock Edition. ";
        break;
      case "Floodgate":
        desc =
          "An addon to Geyser that removes the need for Bedrock players to log in with a Java Edition account.";
        break;
    }
  }

  export function del(filename) {
   state="skeleton";

    let baseurl = apiurl;
    if (usingOcelot) baseurl = getServerNode(id);
    const url =
      baseurl + "server/" + serverId + "/files/delete/" + modtype + "s*" + filename;
    fetch(url, {
      method: "POST",
      headers: {
        token: localStorage.getItem("token"),
        username: localStorage.getItem("accountEmail"),
      },
    }).then((response) => {
      if (response.error != undefined) {
        alert(response.error, "error");
      } else {

        alert("File successfully deleted", "success");
        state = "deleted";
      }
      skeleton=false;
    });
  }

  function toggleInfo() {
    if (showInfo === true) {
      showInfo = false;
    } else {
      showInfo = true;
    }
  }

  function toggleDisable() {
    let baseurl = apiurl;
    if (usingOcelot) baseurl = getServerNode(id);
    const url =
      baseurl +
      "server/" +
      serverId +
      "/toggleDisable/" +
      modtype +
      "?filename=" +
      filename;
    fetch(url, {
      method: "POST",
      headers: {
        token: localStorage.getItem("token"),
        username: localStorage.getItem("accountEmail"),
      },
    })
      .then((response) => response.text())
      .then((data) => {
        console.error(data);
        if (data.includes("disabled")) {
          disableText = $t("enable");
        } else if (data.includes("enabled")) {
          disableText = $t("disable");
        }
      });
  }
</script>

{#if state == "skeleton"}
  <ManagePluginSkele />
{:else if state == "normal"}
<div>
  <div
    class="p-2 {hasSpecial ? 'rounded-t-lg' : 'rounded-lg'} bg-base-200 flex justify-between items-center h-16"
  >
    <div class="{prefixToHandleFlexOnSM}flex items-center gap-1 break-all">
      <div class="flex gap-2 mr-1 items-center max-{prefixToHandleFlexOnSM}mb-1">
        {#if icon}
    <img 
          class="h-12 w-12 bg-base-100 rounded-md"
          src={icon}
          alt="Mod Icon"
         
        />
        {:else}
        <div class="h-12 w-12 flex-shrink-0 bg-base-100 rounded-md flex items-center justify-center">
          <BoxIcon size=32/>
        </div>
        {/if}
        <div class="flex flex-col">
          <div class=""><span class="font-bold text-gray-200 font-ubuntu">{name}</span>
            {#if author}<span class="text-sm font-ubuntu ml-1 text-gray-300"> by {author}</span>{/if}</div>
          <div  class="text-xs text-gray-400 font-mono overflow-hidden text-ellipsis w-[100%] h-3">
      
          {#if desc}
          {desc.length > 80 ? desc.substring(0, 80).trim() + "..." : desc}
          {/if}
          </div>
        </div>
        
      </div>

    
    </div>

    <div class="flex items-center">
              <button class="btn btn-sm text-xs btn-ghost" on:click={toggleDisable}>
          {disableText}
        </button>

      <button
       class="btn btn-square btn-ghost btn-sm"
        on:click={() => del(filename)}
        title={$t("delete")}
      >
        <Trash2 size="16" />
      </button>
                  <button class="btn btn-square btn-ghost btn-sm"
        on:click={toggleInfo}
        title={$t("info")}
      >
        <InfoIcon size="16" />
      </button>

      

    </div>
  </div>

  {#if isDynmap}
    <div class="bg-base-100 rounded-b-lg p-2 flex flex-wrap items-center gap-2">
      <div
        style="text-wrap: nowrap;"
        class="tooltip tooltip-top tooltip-info z-50 hidden sm:block"
        data-tip="Only renders overworld. See guide for more info."
      >
        <button on:click={dynmapRender} class="btn btn-neutral btn-sm items-center"
          >{$t("plugins.dynmap.render")}</button
        >
      </div>
      <a href="https://arthmc.xyz/knowledgebase/using-dynmap" target="_blank" rel="noreferrer">
        <button class="btn btn-neutral btn-sm items-center"
          >{$t("plugins.dynmap.guide")}
          <ExternalLink size="18" class="ml-1" /></button
        >
      </a>
      <a href="{webmapurl}:{parseInt(serverId) + 10066}" target="_blank" rel="noreferrer">
        <button class="btn btn-sm items-center hover:bg-base-100"
          >{$t("plugins.dynmap.map")}
          <ExternalLink size="18" class="ml-1" /></button
        >
      </a>
    </div>
  {/if}

  {#if isBluemap}
    <div class="bg-base-100 rounded-b-lg p-2 flex flex-wrap items-center gap-2">
      <a href="https://arthmc.xyz/knowledgebase/using-bluemap" target="_blank" rel="noreferrer">
        <button class="btn btn-neutral btn-sm items-center"
          >{$t("plugins.voicechat.guide")}
          <ExternalLink size="18" class="ml-1" /></button
        >
      </a>
      <a href="{webmapurl}:{parseInt(serverId) + 10066}" target="_blank" rel="noreferrer">
        <button class="btn btn-sm items-center hover:bg-base-100"
          >Open Webmap
          <ExternalLink size="18" class="ml-1" /></button
        >
      </a>
    </div>
  {/if}

  {#if isVoicechat}
    <div class="bg-base-100 rounded-b-lg p-2 flex flex-wrap items-center gap-2">
      <a href="https://arthmc.xyz/knowledgebase/using-simple-voice-chat" target="_blank" rel="noreferrer">
        <button class="btn btn-neutral btn-sm items-center"
          >{$t("plugins.voicechat.guide")}
          <ExternalLink size="18" class="ml-1" /></button
        >
      </a>
      <a href="https://modrinth.com/plugin/simple-voice-chat/versions?l=fabric" target="_blank" rel="noreferrer">
        <button class="btn btn-sm items-center hover:bg-base-100"
          >{$t("plugins.voicechat.downloadMod")}
          <ExternalLink size="18" class="ml-1" /></button
        >
      </a>
    </div>
  {/if}

  {#if isChunky}
    <div class="bg-base-100 rounded-b-lg p-2 flex flex-wrap items-center gap-2">
      <input
        bind:value={pregenRadius}
        class="input input-sm w-32 input-bordered"
        placeholder={$t("plugins.chunky.l.radius")}
        type="text"
      />
      <button on:click={pregen} class="btn btn-secondary btn-sm btn-square"
        ><Send size="18" /></button
      >
      <a href="https://github.com/pop4959/Chunky/wiki/Commands" target="_blank" rel="noreferrer">
        <button class="btn btn-neutral btn-sm items-center"
          >{$t("plugins.voicechat.guide")}
          <ExternalLink size="18" class="ml-1" /></button
        >
      </a>
    </div>
  {/if}

  {#if isDiscordsrv}
    <div class="bg-base-100 rounded-b-lg p-2 flex flex-wrap items-center gap-2">
      <a href="https://knowledgebase.discordsrv.com/installation/initial-setup" target="_blank" rel="noreferrer">
        <button class="btn btn-neutral btn-sm items-center"
          >{$t("plugins.discordsrv.guide")}
          <ExternalLink size="18" class="ml-1" /></button
        >
      </a>
    </div>
  {/if}

</div>
{/if}