# Servers

### GET /server/claimId

This route lets you claim a server id, which you can then create a server with
### GET /server/`id`

This route lets you get a server's state (wether it's on, off or starting), as well as it's name, software, version, and worldgen mods.

**No Parameters**

### POST /server/`id`/state/`stop|start|restart`

This route lets you start, stop, or restart a server.

**No Parameters**

### DELETE /server/`id`/`modtype`

This route lets you delete a mod/plugin file.

**Path Parameters**

- `modtype(mods|plugins)`: the type of mod that you are deleting, mods or plugins.

**Query Parameters**

- `pluginPlatform(cx|lr|gh)`: The source of the mod; custom, labrinth, or github.
- `pluginId`: The unique identifier for that mod. For custom, its the lowercase name of the plugin, for github its author/repo, and for labrinth it's the project id.
- `pluginName`: The human-readable name of the mod.

### Get /server/`id`/`modtype`

This route grabs a list of every mod/plugin on that server.

**Path Parameters**

- `modtype(plugins|mods)`: the type of mod that you are grabbing, mods or plugins.

### POST /server/`id`/add/`modtype`

This route lets you add a mod/plugin to your server.

**Path Parameters**

- `modtype(plugin|mod)`: the type of mod that you are adding, mods or plugins.

**Query Parameters**

- `pluginUrl`: the URL of the file. Must be a modrinth.com or github.com URL.
- `pluginId`: A unique identifier for your mod. For custom, its the lowercase name of the plugin, for github its author/repo, and for labrinth it's the project id.
- `pluginName`: A human-readable name for your mod.

### POST /server/`id`/version

This route lets you change the server's version.

**Query Parameters**

- `version`: The Minecraft version you want your server to be on.

### POST /server/`id`/setInfo

This route lets you set a description and icon for your server.

**Body Parameters**

- `iconUrl`: The URL of the icon. Can't be taller than it is wide.
- `description`: The description of the server.

### GET /server/`id`/getInfo

**No Parameters**

### DELETE /server/`id`

This route lets you stop and delete a server, as well as get rid of all it's information.

**No Parameters**

### POST /server/new/`id`

This route lets you create a new server.

**Query Parameters:**

- `username`: The username of a user's account, ex `email:john@gmail.com`. If stripe is enabled, this account's email (if the account is a non-email account, you should still just put the username here) will be checked on stripe for an active subscription.

**Body Parameters:**

- `name`: THe name of the server. There are no restrictions currently besides that the name can't already exist.
- `software` The software. Check https://serverjars.com for valid options.
- `version`: The minecraft version. `latest` is also valid, and that makes it so a server automatically updates to the latest version.
- `addons`: An array of worldgen mods. Valid items are `terralith`, `nullscape`, and `incendium`.
- `modpackURL`: The download url of a modpack
- `modpackID`: The CurseForge or Modrinth ID of that modpack
- `modpackVersionID`: The CurseForge or Modrinth ID of the specific version you're using.

### POST /server/`id`/addplugin

This route lets you add a plugin from modrinth to a server.

**Query Parameters:**

- `pluginUrl`: The url of the plugin. Must start with `https://api.modrinth.com`

### GET /servers

Get every server an account has.

**No Parameters**

**Query Parameters:**

- `username`: The username of an account.

### GET /server/`id`/world

Download a world.zip file containing your world

**No Parameters**

### POST /server/`id`/world

This route lets you either generate a new world or replace your world with one from a file.

**File Parameters (Not needed if you're regenerating)**

- Send one file. It must be a valid archive/zip file.

**Query Parameters (Not needed if you're uploading)**

- `worldgenMods`: Optional. A list of any worldgen mods you want on the new world. Format Example: 'terralith,incendium'.
- `seed`: Optional. A random seed will be used if you don't provide one.
- `worldType(normal|flat|large_biomes)`: The worldtype. You may know flat as 'superflat'.

### GET /server/`id`/file/`path`

This route gets the contents of a text file within your server folder.

**Path Parameters**

- `path`: The path to the file you want to read. Use `*` instead of `/`, for example: 'config\*paper-global.yml`.

### POST /server/`id`/file/`path`

This route lets you set the contents of a text file within your server folder.

**Path Parameters**:

- `path`: The path to the file you want to write to. Use `*` instead of `/`, for example: 'config\*paper-global.yml`.

**Body Parameters**:

- `content`: The text that you want the file to contain.

### DELETE /server/`id`/file/`path`

This route lets you delete a text file within your server folder.

**Path Parameters**

- `path`: The path to the file you want to delete. Use `*` instead of `/`, for example: 'config\*paper-global.yml`.

### POST /server/`id`/rename

This route lets you rename your server.

**Query Parameters**

- `newName`: The new name you want your server to have.

### GET /server/`id`/storageInfo

This route gets the storage limit of your server as well as how much of it is used up.

**No Parameters**
