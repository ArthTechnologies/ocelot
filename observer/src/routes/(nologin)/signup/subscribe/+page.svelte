<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";

  if (browser) {
    const plan = localStorage.getItem("plan");

    if (plan === "plus") {
      goto("/signup/subscribe/plus");
    } else if (plan === "premium") {
      goto("/signup/subscribe/premium");
    } else if (plan === "basic") {
      goto("/signup/subscribe/basic");
    } else if (window.innerWidth < 768) {
      goto("/signup/subscribe/choosePlan");
    } else {
      goto("/signup/subscribe/basic");
    }
  }
</script>
