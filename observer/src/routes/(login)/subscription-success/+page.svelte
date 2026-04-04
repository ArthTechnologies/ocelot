<script>
  import { apiurl } from "$lib/scripts/req";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { PUBLIC_SITE_URL } from '$env/static/public';

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
        // TikTok Pixel — Subscribe event
        (window as any).ttq?.track('Subscribe');
        // Report payment conversion back to the marketing site analytics
        fetch(`${PUBLIC_SITE_URL}/api/analytics/payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            referrer: localStorage.getItem("referrer") || "unknown",
            campaign: localStorage.getItem("campaign_name") || "unknown",
          }),
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
