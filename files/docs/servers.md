# Servers

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

### POST /server/new

This route lets you create a new server.

**Query Parameters:**

- `email`: The email of a user's account. If stripe is enabled, this email will be checked on stripe for an active subscription.

**Body Parameters:**

- `name`: THe name of the server. There are no restrictions currently besides that the name can't already exist.
- `software` The software. Check https://serverjars.com for valid options.
- `version`: The minecraft version. `latest` is also valid, and that makes it so a server automatically updates to the latest version.
- `addons`: An array of worldgen mods. Valid items are `terralith`, `nullscape`, and `incendium`.

### POST /server/`id`/addplugin

This route lets you add a plugin from modrinth to a server.

**Query Parameters:**

- `pluginUrl`: The url of the plugin. Must start with `https://api.modrinth.com`

### GET /servers

Get every server under a email address.

**No Parameters**

**Query Parameters:**

- `email`: An email of an account.

### GET /server/`id`/world

Download a world.zip file containing your world

**No Parameters**
