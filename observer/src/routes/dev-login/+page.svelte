<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  export let data;

  onMount(() => {
    if (data.creds) {
      const c = data.creds;
      localStorage.setItem("loggedIn", "true");
      localStorage.setItem("token", c.token);
      localStorage.setItem("accountId", c.accountId);
      localStorage.setItem("accountEmail", c.accountEmail);
      localStorage.setItem("email", c.email);
      localStorage.setItem("userNode", c.userNode);
      goto(c.redirectTo || "/");
    } else {
      goto("/");
    }
  });
</script>

<p>Logging in...</p>
