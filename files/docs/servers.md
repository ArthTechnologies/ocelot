# Servers

### GET /server/`id`
This route lets you get a server's state (wether it's on, off or starting), as well as it's name, software, version, and worldgen mods.

**No Parameters**

### DELETE /server/`id`
This route lets you stop and delete a server, as well as get rid of all it's information.

**No Parameters**

### POST /server/`id`/state/`stop|start|restart`
This route lets you start, stop, or restart a server.

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

**Query Parameters:**  
- `email`: An email of an account.