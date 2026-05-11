<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";

  let status = "Signing in…";

  onMount(() => {
    if (!browser) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      const accountId = params.get("accountId");
      const email = params.get("email");
      const accountEmail = params.get("accountEmail");
      const name = params.get("name") || (email ? email.split("@")[0] : "");
      const userNode = params.get("userNode");
      const redirectTo = params.get("redirectTo") || "/";

      if (!token || !accountId || !email || !accountEmail || !userNode) {
        status = "Missing required parameters.";
        return;
      }

      localStorage.setItem("loggedIn", "true");
      localStorage.setItem("token", token);
      localStorage.setItem("accountId", accountId);
      localStorage.setItem("accountEmail", accountEmail);
      localStorage.setItem("email", email.toLowerCase());
      localStorage.setItem("name", name);
      localStorage.setItem("userNode", userNode);

      // Clear server-node routing cache so it's rebuilt for this user.
      localStorage.removeItem("serverNodes");

      goto(redirectTo);
    } catch (err) {
      console.error("admin-impersonate failed:", err);
      status = "Sign-in failed.";
    }
  });
</script>

<div class="min-h-screen flex items-center justify-center">
  <p class="opacity-60">{status}</p>
</div>
