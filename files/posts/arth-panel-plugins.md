Arth Panel Update: Plugins 
Plugins, major bug fixes, and much more arrive in our beta 1.1 update. 
2023-02-14 
DiamonC 
https://floss.social/@DiamonC 
https://cdn.masto.host/floss/accounts/avatars/109/207/881/612/624/574/original/6516bdc6b0ff0203.jpeg

---

![image-bordered](https://i.imgur.com/kGfjoZj.png)

After just over a month since beta 1.0, the beta 1.1 update to Arth Panel is here! If you're not familiar with Arth Panel, consider checking out our introducing arth panel article.  
## Plugins

Plugins are a great way to add functionality to your server, make the game more fun, or provide added security with features like backups. Modrinth is a modern and lightning-fast website to get plugins and mods from, so we decided to add a section to search for and add plugins from Modrinth. There's also a featured plugins section, which shows a few of the most common and useful plugins from both modrinth and github.
Alongside Geyser, Floodgate is now also a pre-installed plugin on every server. Floodgate allows for bedrock edition players to join your server without needing a java edition account. Lastly, we added a "manage plugins" button. You can view and delete all modrinth, github, and pre-installed plugins.  
## Bug Fixes

The terminal has been the buggiest part of the panel ever since it was introduced. One major problem was everything being put on one line, leaving the terminal hard to read. Another very important issue was commands often not going through, or being delayed. This was because the backend would check if a new command was sent every 200 milliseconds, meaning if multiple commands were sent within that time it could break the terminal until the server restarted. Both of these have been fixed, allowing us to finally focus on upcoming features.  
  
    
We've added plenty of small features such as adding the structory worldgen mod, command shortcuts, more efficient code utilizing features from Svelte, as well as more intuitive UI. We've also added experimental settings that need to be manually enabled which allow you to remove payments and authentication on your panel - a great option if your panel is just for your friends and people you trust.  
## The Future

Our number one priority now is adding security to people's servers. We've never recommended running arth panel on production (meaning letting people you don't trust access it) because it currently lacks proper password security. We'll be implementing a password security system, which likely means replacing pocketbase with our own account system as well.  
  
Another major priority is increasing accessibility when it comes to setting up the panel. We want our documentation to explain everything a beginner needs to know when it comes to setting up our panel, and we want to start work on the docker images again after taking a break from docker after some issues with ARM-based devices. We also want to improve the experience on mobile devices, and improve no-auth mode, which is currently experimental. Keep an eye on our Mastodon and our blog for new updates, and as always, consider checking out/contributing to Arth Panel at [codeberg](https://codeberg.org/arth/).