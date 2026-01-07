<script>
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { apiurl, updateReqTemplates } from "$lib/scripts/req";

  if (browser) {
    // Extract authorization code from URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    // Check for OAuth errors (user denied permission, etc.)
    if (error) {
      console.error("Google OAuth error:", error);
      alert("Authentication failed: " + error);
      goto("/login");
    } else if (code) {
      console.log("Authorization code received:", code);

      // Construct redirect URI (must match what was sent to Google)
      const redirectUri = window.location.origin + "/auth/google";

      // Send code to backend for token exchange
      fetch(apiurl + "accounts/google?code=" + code + "&redirectUri=" + encodeURIComponent(redirectUri), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })
        .then((response) => response.json())
        .then((data) => {
          console.log("Google OAuth response:", data);

          if (data.token === -1) {
            alert("Authentication failed: " + (data.reason || "Unknown error"));
            goto("/login");
            return;
          }

          // Store authentication data in localStorage
          localStorage.setItem("picture", data.picture);
          localStorage.setItem("name", data.name);
          localStorage.setItem("token", data.token);
          localStorage.setItem("accountId", data.accountId);
          localStorage.setItem("accountEmail", "google:" + data.username);
          localStorage.setItem("email", data.email.toLowerCase());

          // Update request templates with new auth data
          updateReqTemplates();

          // Redirect to subscription page if first time, otherwise dashboard
          if (localStorage.getItem("mode") !== "solo" && data.firstTime) {
            goto("/signup/subscribe/basic");
          } else {
            goto("/");
            // Notify navbar to update highlighted icon
            window.dispatchEvent(new Event("redrict"));
          }
        })
        .catch((error) => {
          console.error("Error during Google authentication:", error);
          alert("Authentication failed. Please try again.");
          goto("/login");
        });
    } else {
      // No code and no error - user navigated here directly
      console.error("No authorization code found in URL");
      goto("/login");
    }
  }
</script>

<!-- Optional: Show loading indicator while processing -->
<div class="flex items-center justify-center min-h-screen">
  <div class="text-center">
    <div class="loading loading-spinner loading-lg"></div>
    <p class="mt-4">Authenticating with Google...</p>
  </div>
</div>
