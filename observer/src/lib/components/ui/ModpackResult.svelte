<script lang="ts">
  import { getVersions } from "$lib/scripts/req";

  import ChooseVersionModpack from "$lib/components/ui/ChooseVersionModpack.svelte";
  import CheckDetailsModal from "$lib/components/ui/CheckDetailsModal.svelte";
  import { browser } from "$app/environment";
  import { t } from "$lib/scripts/i18n";
  // lucide-svelte 0.263 names the shield-with-X icon ShieldClose; it was only
  // renamed to ShieldX in later versions.
  import { AlertCircle, BadgeCheck, Download, ShieldCheck, ShieldClose } from "lucide-svelte";
  import TranslateableText from "./TranslateableText.svelte";
  export let name: string;
  // Result of the automated boot check for this pack, or null when there isn't
  // one / the viewer isn't an admin. Shape: { status, reason, checkedAt }.
  export let check: { status: string; reason?: string; checkedAt?: number } | null = null;
  export let author: string;
  export let desc: string;
  export let icon: string;
  export let id: string;
  export let client: string;
  export let downloads: number;
  export let platform: string;

  export let slug: string;
  // True when the automated boot check has this pack passing, from the
  // public (unauthenticated) modpack-checks endpoint.
  export let verified: boolean = false;

  let showCheckModal = false;

  console.log(client);
  switch (client) {
    case "required":
      client = "Players must install this modpack to join your server.";
      break;
    case "optional":
      client = "Players can optionally install the modpack.";
      break;
    case "unsupported":
      client = "This modpack isn't meant to be installed by your players.";
  }
  function get() {
    getVersions(id).then((data) => {
      console.log(data);
    });
  }
  let software = "";

  if (browser) {
    software = localStorage.getItem("serverSoftware");
  }

  const checkedWhen = (ts: number | undefined) =>
    ts ? new Date(ts).toLocaleString() : "unknown time";
</script>

<div class="bg-base-200 rounded-lg p-3">
  <div class="flex justify-between place-items-center max-w-full relative">
    <div class="flex space-x-3 w-minus-7">
      {#if platform == "mr"}
        <a
          class="shrink-0"
          href="https://modrinth.com/plugin/{slug}"
          target="_blank"
        >
          <img
            src={icon}
            class="w-16 h-16 md:w-20 md:h-20 bg-base-300 rounded-lg text-sm"
          />
        </a>
      {:else if platform == "cf"}
        <a
          class="shrink-0"
          href="https://curseforge.com/minecraft/modpacks/{slug}"
          target="_blank"
        >
          <img
            src={icon}
            class="w-16 h-16 md:w-20 md:h-20 bg-base-300 rounded-lg text-sm"
          />
        </a>
      {/if}
      <div class="w-minus-7">
        <div class="w-minus-5">
          {#if platform == "mr"}
            <a
              href="https://modrinth.com/mod/{slug}"
              target="_blank"
              class="hover:link text-xl font-bold md:w-auto">{name}</a
            >
            {$t("by")}
            <a
              href="https://modrinth.com/user/{author}"
              target="_blank"
              class="hover:link">{author}</a
            >
          {:else if platform == "cf"}
            <a
              href="https://curseforge.com/minecraft/modpacks/{slug}"
              target="_blank"
              class="hover:link text-xl font-bold w-[10rem] md:w-auto">{name}</a
            >
            {$t("by")}
            <a
              href="https://curseforge.com/members/{author}"
              target="_blank"
              class="hover:link">{author}</a
            >
          {/if}
          {#if verified}
            <div
              class="badge badge-success w-5 p-0 text-xs ml-2 md:ml-0"
              title="Automated check passed"
            >
              <BadgeCheck size=16 />
            </div>
          {/if}
        </div>

        <p class="w-minus-7">
          <TranslateableText text={desc} />
        </p>

        <div
          class="md:flex space-x-0 md:space-x-2 space-y-1.5 md:space-y-0 items-start mt-1.5"
        >
          <div
            class="bg-base-300 flex px-2 py-1 rounded-md place-items-center text-sm w-[5.5rem] md:w-auto"
          >
            <Download class="mr-1.5 shrink-0" size="16" />
            {downloads}
          </div>
          {#if client != null}
            <div
              class="bg-base-300 flex px-2 py-1 rounded-md place-items-center text-sm w-[10rem] sm:w-[18rem] md:w-auto"
            >
              <AlertCircle class="mr-1.5 shrink-0" size="16" />
              {client}
            </div>
          {/if}
          {#if check && (check.status === "passed" || check.status === "failed")}
            <button
              on:click={() => showCheckModal = true}
              class="flex px-2 py-1 rounded-md place-items-center text-sm w-fit cursor-pointer transition-opacity hover:opacity-80
                {check.status === 'passed'
                ? 'bg-success text-success-content'
                : 'bg-error text-error-content'}"
            >
              {#if check.status === "passed"}
                <ShieldCheck class="mr-1.5 shrink-0" size="16" />
              {:else}
                <ShieldClose class="mr-1.5 shrink-0" size="16" />
              {/if}
              Automated check {check.status}
            </button>
          {/if}
        </div>
      </div>
    </div>
    <ChooseVersionModpack
      {platform}
      {id}
      {name}
      {author}
      {desc}
      {icon}
      {slug}
    />
  </div>
</div>

{#if showCheckModal && check}
  <CheckDetailsModal
    {name}
    {check}
    on:close={() => showCheckModal = false}
  />
{/if}
