<script lang="ts">
  import ServerCard from "$lib/components/ui/ServerCard.svelte";
  import UncreatedServerCard from "$lib/components/ui/UncreatedServerCard.svelte";
  import ServerSkele from "$lib/components/ui/ServerSkele.svelte";
  import { t, locale, locales } from "$lib/scripts/i18n";
  import { apiurl, getServers } from "$lib/scripts/req";
  import { browser, dev } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { parse } from "path";
  import {
    HelpCircle,
    Languages,
    LogOut,
    Menu,
    ShoppingCart,
    User,
    Crown,

    Currency,

    DollarSign


  } from "lucide-svelte";


    import SupportModal from "../buttons/SupportModal.svelte";
    import LanguageSwitcherModal from "../buttons/LanguageSwitcherModal.svelte";
    import ExpiredServerCard from "../ui/ExpiredServerCard.svelte";

  // NOTE: the element that is using one of the theme attributes must be in the DOM on mount
  let servers: any[] = [];
  //Example

  var id = undefined;

  let devMode = false;
  let mode = "provider";
  let adminAccess = false;

  let noserverlock = false;
  let amountOfServersForSkeletons = 1;

  // Which server (if any) the sidebar should show as "selected". Derived
  // reactively from the current route so it's always correct - including on
  // browser back/forward, or any link that doesn't explicitly refresh it.
  // This used to be a plain variable only refreshed by getSlug(), called
  // from specific on:click handlers - reaching a page any other way (e.g.
  // clicking "Admin", which had no such handler) left it pointing at
  // whichever server was last viewed, so that server's card stayed rendered
  // as "selected" (and inert - the selected card has no click handler)
  // everywhere else in the app.
  //
  // The "not viewing any server" case must be `null`, not `0` - 0 is also a
  // legitimate real server id (the first slot ever provisioned), and the
  // uncreated-server comparison below matches on the raw id with no offset.
  // Falling back to 0 meant server 0, if uncreated, showed as permanently
  // "selected" (and inert) on every non-server page, since it always
  // matched the "nothing selected" sentinel.
  $: slug = (() => {
    const pathname = $page.url.pathname;
    if (pathname.includes("/server")) {
      return parseInt(pathname.split("/")[2]);
    } else if (pathname.includes("/newserver")) {
      return parseInt($page.url.search.split("?id=")[1]);
    }
    return null;
  })();
  let email: string = "";

  onMount(() => {
    if (browser) {
      // Fetch admin access status from info route
      fetch(apiurl + "info", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          token: localStorage.getItem("token") || "",
          username: localStorage.getItem("accountEmail") || "",
        },
      })
        .then((res) => res.json())
        .then((data) => {
          adminAccess = data.adminAccess === true;
        })
        .catch((err) => console.error("Error fetching admin access:", err));
    }
  });
  if (browser) {
    mode = localStorage.getItem("mode") || "provider";
    if (mode === "solo") localStorage.setItem("accountId", "noemail")
    email = localStorage.getItem("accountEmail");
    if (localStorage.getItem("token") == undefined) goto("/login");
    amountOfServersForSkeletons = localStorage.getItem("amountOfServers");
    if (localStorage.getItem("devMode") == "true") {
      console.log("dev mode");
      devMode = true;
    }
  }

  // getServers and store "amount" given in the response in a variable
  let promise;

  if (browser) {
     

     loadServers();
     window.addEventListener("redrict", loadServers);
     window.addEventListener("refreshIcons", refreshIcons)

  }
  function refreshIcons() {
    if (browser) {
      console.log("refreshing icons" + servers);
      for (let i = 0; i < servers.length; i++) {
        let id = servers[i].id;


      fetch(apiurl + "server/" + id + "/settings/icon",
        {
          method: "GET",
          headers: {
            token: localStorage.getItem("token"),
            username: localStorage.getItem("accountEmail"),
          },
        })
        .then((response) => response.blob())
        .then((blob) => {
          if (blob.size > 0) {
            let icon = URL.createObjectURL(blob);
            const el = document.getElementById("navIcon" + id);
            if (el) el.src = icon;
          } else {
            icon = "/images/placeholder.webp";
          }
        });
    }
  }
  }
  function loadServers() {

    promise = getServers(email).then((response) => {
      console.log(JSON.stringify(response));
      if (browser && response != "error") {

        noserverlock = true;
        console.log(response);
        if (response.amount != "undefined") {
          id = response.amount;
        }
        servers = response;
        refreshIcons();
        if (
          servers.length == 0
        ) {
          if (localStorage.getItem("reservedId") != null) {
          claim();
        } else {
          fetch(apiurl + "server/reserve",
      {
        method: "GET",
        headers: {
          "username": localStorage.getItem("accountEmail"),
          "token": localStorage.getItem("token"),
        },
      }
    )
      .then((response) => response.json())
      .then((data) => {
        if (!data.atCapacity && data.id > -1) {
          localStorage.setItem("reservedId", data.id);
          claim();
        }
      });
        }
    
        function claim() {
          let reservedId = localStorage.getItem("reservedId");
          console.log("claiming an id..." + reservedId);
          fetch(apiurl + "server/claim/" + reservedId, {
            method: "GET",
            headers: {
              token: localStorage.getItem("token"),
              username: localStorage.getItem("accountEmail"),
            },
          })
            .then((res) => res.json())
            .then((res) => {

              console.log(res);
             
              if (!res.msg.includes("Success") && !res.msg.includes("already claimed")) {
               
                goto("/billing");
              }
              promise = getServers(email).then((response) => {

                if (browser) {
                  noserverlock = true;

                  console.log(response);

                  if (response.amount != "undefined") {
                    id = response.amount;
                  }
                  servers = response;
                  let slug2 = window.location.pathname;

                  if (slug2 == "/") {
                    console.log(servers[0])
                    if (servers[0].isStandard) {


                      goto("/server/" + (10000 + parseInt(servers[0].id)));
                    }
                  }
                }
              });
            });
        }
      } else if (servers.length > 0 && !servers[0].isStandard && servers[0].error?.code === 101 && !isViewingExistingServer(servers)) {
         createServer(parseInt(servers[0].id))
      }
    } else {
        servers[0] = "-1:invalid accoount";
        setTimeout(()=>{//logout(); 
        }, 5000);

    }
    });
  }

   function isViewingExistingServer(serversList) {
     if (!browser) return false;
     const path = window.location.pathname;
     if (!path.startsWith("/server/")) return false;
     const viewedId = parseInt(path.split("/")[2]) - 10000;
     return serversList.some(s => s.isStandard && parseInt(s.id) === viewedId);
   }

  let noserver = false;

  if (id == 0 && noserverlock) {
    noserver = true;
  }

  // Selects a server and navigates to its page. `slug` no longer needs a
  // manual update here - it's derived reactively from the route, so it
  // picks up the new server as soon as the navigation lands.
  function selectServer(id) {
    id = parseInt(id);
    for (let i = 0; i < servers.length; i++) {
      let newslug = 10000 + parseInt(id);
      if (parseInt(servers[i].id) + 10000 == newslug) {
        select(servers[i]);
        window.location.href = "/server/" + newslug;
      }
    }
  }

  function select(server) {
    console.log("server");
    
    localStorage.setItem("serverName", server.name);
    localStorage.setItem("serverID", server.id);
    localStorage.setItem("serverSoftware", server.software);
    localStorage.setItem("serverVersion", server.version);
    localStorage.setItem("serverCardRedrict", "true");
    localStorage.setItem("fileAccessKey", server.fileAccessKey);
    if (server.subdomain != undefined) {
      localStorage.setItem("serverSubdomain", server.subdomain);
    } else {
      localStorage.removeItem("serverSubdomain");
    }
  }

  function logout() {
    //clear all local storage
    localStorage.clear();
    window.location.href = "/login";
  }

  function createServer(id) {

        slug = id;
        goto("/newserver?id="+id);
 

  }
  
</script>

<div
  class="shrink-0 md:fixed md:h-screen bg-base-100 px-5 py-3 md:py-5 flex md:flex-col items-center justify-between w-full md:w-[22%] border-r-4 border-base-300"
>
  <div class="flex md:flex-col items-center w-full">
    <img src="/favicon.png" class="w-12 md:hidden" />
    <img src="/images/sitelogo.svg" class="w-32 lg:w-36 max-md:hidden" />
    <div class="divider max-md:divider-horizontal max-md:mx-2.5"></div>

    <div class="flex md:flex-col gap-3 w-fit md:w-full">
      {#await promise}
        <div
          class="pointer-events-none flex gap-2.5 items-center p-4 w-full lg:h-[5.5rem] rounded-lg bg-gradient-to-b from-base-300 to-[#2a2a36] cursor-pointer"
        >
          <ServerSkele />
        </div>
        <div
          class="pointer-events-none flex gap-2.5 items-center p-4 w-full lg:h-[5.5rem] rounded-lg bg-gradient-to-b from-base-300 to-[#2a2a36] cursor-pointer"
        >
          <ServerSkele />
        </div>
      {:then}
        {#each servers as server}
{#if !server.isStandard && server.error}
  {#if server.error.code === 101}
    {#if parseInt(server.id) == slug}
    <a
      on:click={() => createServer(parseInt(server.id))}
      id="serverCard{parseInt(server.id)}"
      class="primaryGradientStroke pointer-events-none flex md:max-lg:px-4 gap-2.5 items-center p-4 w-12 sm:w-32 truncate md:w-full md:h-[5.5rem] rounded-lg bg-gradient-to-b from-base-300 to-[#2a2a36] cursor-pointer"
    >
    <UncreatedServerCard id={parseInt(server.id)}/>
    </a>
    {:else}
    <a
      on:click={() => createServer(parseInt(server.id))}
      id="serverCard{parseInt(server.id)}"
      class="neutralGradientStrokeB flex md:max-lg:px-4 gap-2.5 items-center p-4 w-12 sm:w-32 truncate md:w-full md:h-[5.5rem] rounded-lg bg-base-200 cursor-pointer"
    >
    <UncreatedServerCard id={parseInt(server.id)}/>
    </a>
    {/if}
  {:else if server.error.code === 100 || server.error.code === 103 || server.error.code === 104 || server.error.code === 105 || server.error.code === 106}
    <a
      href="/expired/{parseInt(server.id)}"
      id="serverCard{parseInt(server.id)}"
      class="neutralGradientStrokeB flex md:max-lg:px-4 gap-2.5 items-center p-3 w-12 sm:w-32 overflow-hidden md:w-full md:min-h-[5.5rem] rounded-lg bg-base-200 cursor-pointer"
    >
    <ExpiredServerCard id={parseInt(server.id)} timestamp={server.error.resetDate || -1} cause={server.error.subscriptionCause || "unknown"} errorCode={server.error.code}/>
    </a>
  {:else}
    <a
      id="serverCard{parseInt(server.id)}"
      class="neutralGradientStrokeB flex md:max-lg:px-4 gap-2.5 items-center p-3 w-12 sm:w-32 overflow-hidden md:w-full md:min-h-[5.5rem] rounded-lg bg-base-200 cursor-pointer"
    >
    <ExpiredServerCard id={parseInt(server.id)} errorCode={server.error.code}/>
    </a>
  {/if}
{:else if server.isStandard}
{#if parseInt(server.id) + 10000 == slug}
<a
  id="serverCard{10000 + parseInt(server.id)}"
  class="primaryGradientStroke pointer-events-none flex gap-2.5 items-center p-4 w-14 sm:w-32 truncate md:w-full md:h-[5.5rem] rounded-xl bg-gradient-to-b from-base-300 to-[#2a2a36] cursor-pointer"
>
  <ServerCard {...server} />
</a>
{:else}
<a
  on:click={() => selectServer(server.id)}
  id="serverCard{10000 + parseInt(server.id)}"
  class="neutralGradientStrokeB flex gap-2.5 items-center p-4 w-14 sm:w-32 truncate md:w-full md:h-[5.5rem] rounded-xl bg-base-200 cursor-pointer"
>
  <ServerCard {...server} />
</a>
{/if}
{/if}
        {/each}
      {/await}
    </div>
  </div>
  <div class="max-md:hidden flex flex-col w-full gap-1">
    {#if mode !== "solo"}
        <a href="/referrals" class="font-ubuntu btn btn-ghost btn-ms flex justify-start hover:text-primary" style="gap: 0.4rem;">
   Get <span class="text-[#edcfb0]">50%</span> off next month</a
    >

    <a href="/account" class="font-ubuntu btn btn-ghost btn-ms flex justify-start hover:text-primary">
      <User size="20" />Account</a
    >


    <a href="/billing" class="font-ubuntu btn btn-ghost btn-ms flex justify-start hover:text-primary">
      <ShoppingCart size="20" />Subscriptions</a
    >
    {/if}

    <button onclick="modal_language.showModal()" class="font-ubuntu btn btn-ghost btn-ms flex justify-start hover:text-primary">
      <Languages size="20" />Language</button
    >


    <button onclick="modal_support.showModal()" class="font-ubuntu btn btn-ghost btn-ms flex justify-start hover:text-primary">
      <HelpCircle size="20" />Get Support</button
    >
    {#if devMode}
    <a href="/dashboard" class="btn btn-ghost btn-ms flex justify-start hover:text-primary">
      <Crown size="20" />Dashboard</a
    >
    {/if}
    {#if adminAccess}
    <a href="/admin" class="btn btn-ghost btn-ms flex justify-start hover:text-primary">
      <Crown size="20" />Admin</a
    >
    {/if}
    <button class="btn btn-ghost btn-ms flex justify-start hover:text-primary" on:click={logout}>
      <LogOut size="20" />Logout</button
    >
  </div>
  <div class="md:hidden flex gap-1">

    <div class="dropdown dropdown-end">
      <div tabindex="0" role="button" class="btn m-1 btn-ghost"><Menu /></div>
      <ul
        tabindex="0"
        class="dropdown-content menu bg-base-300 rounded-box z-[1] w-52 p-2 shadow-xl"
      >
        <li><a href="/account">Account</a></li>
        {#if mode !== "solo"}
        <li><a href="/billing">Subscriptions</a></li>
        {/if}
        {#if adminAccess}
        <li><a href="/admin">Admin</a></li>
        {/if}
<li>        <a onclick="modal_language.showModal()">
  Language</a
 ></li>
 <li>        <a onclick="modal_support.showModal()">
  Get Support</a
 ></li>

        <li><a on:click={logout}>Logout</a></li>
      </ul>
    </div>
  </div>
</div>
<LanguageSwitcherModal/>
<SupportModal/>
<style>
  .primaryGradientStroke {
    position: relative;

    z-index: 1;
  }

  .primaryGradientStroke::before {
    content: "";
    position: absolute;
    top: 0px;

    bottom: 0px;
    left: 0px;
    right: 0px;
    border-radius: inherit; /* Inherits button's border-radius */
    padding: 2.5px; /* Space between button and border */
    background: linear-gradient(0deg, rgb(139, 59, 44), #ffffff00, #ffffff00, #ffffff00);
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: destination-out;
    mask-composite: exclude;
    z-index: -1;
  }

  .neutralGradientStrokeB {
    position: relative;

    z-index: 1;
  }

  .neutralGradientStrokeB:hover::before {
    content: "";
    position: absolute;
    top: 0px;

    bottom: 0px;
    left: 0px;
    right: 0px;
    border-radius: inherit; /* Inherits button's border-radius */
    padding: 3px; /* Space between button and border */
    background: linear-gradient(0deg, #2a354e, #ffffff00, #ffffff00, #ffffff00);
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: destination-out;
    mask-composite: exclude;
    z-index: -1;
  }
</style>
