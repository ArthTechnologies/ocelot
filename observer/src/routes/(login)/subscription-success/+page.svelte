<script lang="ts">
  import { apiurl } from "$lib/scripts/req";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { SITE_URL } from "$lib/config";

  onMount(async () => {
    let reservedId = localStorage.getItem("reservedId");

    fetch(apiurl + "server/claim/" + reservedId, {
      method: "GET",
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data.msg.includes("Success")) {
          //alert(data.msg, "error");
        }
        // Report payment conversion back to the marketing site analytics
        const referrer = localStorage.getItem("referrer") || "unknown";
        const campaign = localStorage.getItem("campaign_name") || "unknown";

        fetch(`${SITE_URL}/api/analytics/payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ referrer, campaign }),
        }).catch(() => {});

        // Redirect only after claim + analytics are fired
        goto("/newserver?fromSubscription=true");
      })
      .catch(() => {
        // Claim failed — still redirect so user isn't stuck
        goto("/newserver?fromSubscription=true");
      });
  });
</script>
