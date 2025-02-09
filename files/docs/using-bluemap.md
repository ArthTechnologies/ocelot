# BlueMap

BlueMap is a plugin that shows an interactive 3d view of your world on a webpage so that you can easily access it. It shows time, the location of players (by default) and can even offer a 3d view of the terrain.

## Setup
When adding official support for BlueMap, we designed the setup process to be as automatic and seamless as possible. After adding the plugin, all you need to do is restart. After the server starts up, a message in chat will tell you to to restart one more time. After that, use the bluemap bar on the right side of the server page, which has a button open the map.

### Troubleshooting
**If your map isn't working and the console says bluemap started on port 8100** instead of your servers's port + 66, all you should need to do is **restart the server again.**  

If that fails or if you have any other issues regarding ports, simply open the file explorer on the server page and edit `plugins/BlueMap/webserver.conf`. Look for this section:
```
# The port that the webserver listens to.
# Default is 8100
port: 8100
```
Simply change the number to your server's port + 66. For example, if your address is arthmc.xyz:10001, enter 10067.

## Things to consider
- Unlike Dynmap, BlueMap handles rendering automatically. There is no need to send a command to render your world.
- Dynmap runs on the insecure `http` protocol and the link is accessible by anyone so reconsider having mapart or chat messages that reveal personal info.