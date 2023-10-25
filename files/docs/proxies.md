# Proxies

### GET /server/`id`/proxy/info

This route lets you get the forwarding secret of a proxy, as well as the sub-server that it sends users to upon joining.

**No Parameters**

### POST /server/`id`/proxy/info

This route lets you set what sub-server players get sent to upon joining.

**Query Parameters**

- `lobbyName`: The name of the sub-server that players get sent to upon joining.

### GET /server/`id`/proxy/servers

This route lets you get all of the proxy's sub-servers.

**No Parameters**

### POST /server/`id`/proxy/servers

This route lets you add a sub-server.

**Query Parameters**

- `name`: The name of the sub-server, like 'bedwars'.
- `ip`: The IP address of the sub-server. It should be formatted as it is in Minecraft, for example: 'arthmc.xyz:19999'.

### DELETE /server/`id`/proxy/servers

This route lets you delete a sub-server.

**Query Parameters**

- `name`: The name of the sub-server you want to delete.