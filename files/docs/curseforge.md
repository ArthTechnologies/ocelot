# CurseForge

Unlike modrinth, where the frontend can make requests to the API, the backend needs to make requests to CurseForge because you need a key to access CurseForge's API and it is against their terms to share they key with third parties, like users of the frontend. This route won't work if the owner of the quartz instance hasn't setup curseforge.

### GET /curseforge/search

This route lets you search for mods, and returns 15 results.

**Query Parameters**

- `version`: The minecraft version you are using
- `loader`: The software/modloader you are using, like "forge" or "quilt".
- `query`: The text that you are using in your search
- `classId`: CurseForge has different classes, 6 is used to only get mods and 4471 is used to only get modpacks.
- `index`: Optional, this specifies how far down the list of results you are starting at. By default, this is 0.
- `sortField`: Optional, this sorts results by something other than relevance. See https://docs.curseforge.com/#tocS_ModsSearchSortField. 

### GET /curseforge/`id`

This gets the info of a certain mod from an ID.

**No Parameters**

### GET /curseforge/`id`/description

This route gets the description for a particular mod.

### GET /curseforge/`id`/versions

This route gets the various versions for a particular mod.

### GET /cursefforge/`id`/version/`versionId`/changelog

This route gets the changelog for a particular version of a particular mod.

### GET /curseforge/`id`/version/`versionId`

This route gets the info of a certain version of curseforge