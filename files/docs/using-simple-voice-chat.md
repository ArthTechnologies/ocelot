# Simple Voice Chat

Simple Voice Chat is a plugin that lets players verbally speak to each other directly from Minecraft if they are close enough to each other. While we've made the process pretty simple on the server's end, each player still needs to set it up on their end if they want to use the voice chat feature.

## Server Setup
Like our other officially supported plugins, **all you need to do to install it on the server is add the plugin and then restart.** The port will be automatically configured.

### Troubleshooting
**If your voice chat server starts on the wrong port**, (it should be on your servers's port + 33), all you should need to do is **restart the server again.**  

If that fails or if you have any other issues regarding ports, simply open the file explorer on the server page and edit `plugins/voicechat/voicechat-server.properties`. Look for this section which is near the beginning:
```
# The port of the voice chat server
# Setting this to "-1" sets the port to the Minecraft servers port (Not recommended)
port=24454
```
Simply change the number to your server's port + 33. For example, if your address is arthmc.xyz:10001, enter 10034.

## Clientside (Player) Setup [Java Edition Only]
**You'll need to use a modded version of Minecraft, like Fabric or Quilt in order to set this up.** Typically, Fabric is used for mods that aren't required to join the server (Simple Voice Chat is one of these mods). If you are unfamiliar with how to setup something like this, the easiest way is to download the [Modrinth app](https://modrinth.com/app). Whether you use the Modrinth app, CurseForge or another launcher, the steps are pretty much the same. Create an instance/modpack with Fabric that is on the version the server you're trying to join is running on. Search for the Simple Voice Chat mod, add it and start up the game.

Once you're on the server, press the `V` key to finish setup. And that's it! Walk up to another player with the mod installed and you should be able to talk. 