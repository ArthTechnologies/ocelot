# Dynmap

Dynmap is a plugin that shows a detailed map of your overworld, nether and end on a webpage so that you can easily access it. It shows time, the location of players (by default) and can even offer a 3d view of the terrain.

## Setup
When adding official support for Dynmap, we designed the setup process to be as automatic and seamless as possible. After adding the plugin, all you need to do is restart and you'll soon see a dynmap bar pop up on the right of the server page, which has a button to copy the dynmap's link.

### Troubleshooting
**If your map isn't working and the console says dynmap started on port 8123** instead of your servers's port + 66, all you should need to do is **restart the server again.**  

If that fails or if you have any other issues regarding ports, simply open the file explorer on the server page and edit `plugins/ dynmap/configuration.txt`. Look for this section:
```
# The TCP-port the webserver will listen on.
webserver-port: 8123
```
Simply change the number to your server's port + 66. For example, if your address is arthmc.xyz:10001, enter 10067.

## Things to consider
- By default, a player's can be seen on the map. **Players can hide themselves on the map via `/dynmap hide`.**
- Upon install, `/dynmap fullrender world` automatically runs, and can be re-run via the "Render World" button. **If you want to render another dimension, replace `world` with the worldname of the dimension.** The Nether is `world_nether` and The End is `world_the_end`. 
- Dynmap runs on the insecure `http` protocol and the link is accessible by anyone so reconsider having mapart or chat messages that reveal personal info.