# CLAUDE.md - Arth Panel

This file provides guidance to Claude Code when working with code in this repository.

## Overview

**Arth Panel** is a lightweight self-hosted Minecraft server management platform consisting of two main components:

- **Quartz** (Backend): Node.js/Express API server for managing servers, authentication, payments, and real-time monitoring
- **Observer** (Frontend): SvelteKit + TailwindCSS web interface for users to manage their Minecraft servers

This monorepo structure keeps both projects in sync and allows coordinated development.

---

## Git Workflow Standards

**File Changes Only**
- Never commit files - only modify them, unless the user explicitly asks for a commit in that request
- Outside of an explicit request, user handles all commits
- Focus exclusively on code changes

**Remote Operations**
- Never push to remote unless explicitly asked
- When user requests a push:
  - Ask for permission first
  - Specify which branch will be pushed
  - Confirm before proceeding
- For wider git operations (branch creation, history changes, rebases):
  - Ask permission and clarify intent first
  - Specify affected branches

**Branch Naming**
- Use format: `claude/feature-name`
- Example: `claude/backup-fix`, `claude/auth-improvement`

**Branch Creation & Tracking**
- When creating a feature branch, ensure it tracks the correct remote branch
- **CRITICAL**: New branches created by Claude must use: `git checkout -b claude/feature-name origin/claude/feature-name`
- Do NOT let a feature branch track `origin/main` - this causes commits to push to main instead of the feature branch
- Verify tracking with: `git branch -vv` (should show `[origin/claude/feature-name]`, not `[origin/main]`)
- If tracking is wrong, fix with: `git branch --set-upstream-to=origin/claude/feature-name claude/feature-name`
- Example of what went wrong: A `claude/backup-fix` branch that tracked `origin/main` caused commits to appear on main remotely while appearing on the feature branch locally

**Merge to Main**
- If merging to main: Always create PR first
- User unlikely to request this, but standard if asked

**Commit Messages**
- Current format acceptable if user requests commits (unlikely)
- Format: "Brief description of changes"

---

## Project Structure

```
panel/
├── quartz/          # Backend API server (Node.js/Express)
└── observer/        # Frontend web interface (SvelteKit)
```

---

## Quartz Backend

### Overview

Quartz is the backend API server that handles:
- Server management and control
- User authentication (email + Discord OAuth)
- Stripe payment processing
- Real-time communication via WebSockets
- Multi-node routing (Ocelot) for distributed deployments
- File management, mods/plugins, and terminal access

### Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MySQL (XDevAPI)
- **Real-time**: Socket.io
- **Payments**: Stripe
- **Deployment**: Docker + FTP support

### Development Commands

```bash
# Install dependencies
npm i

# Start development server with auto-reload
npm run server   # Uses nodemon (runs index.js)

# Start production server
node run
```

### Project Structure

```
quartz/
├── run.js              # Main application entry point (31KB)
├── setup.js            # Initial setup wizard
├── routes/
│   ├── accounts.js     # Authentication and account management
│   ├── info.js         # Server information and details
│   ├── node.js         # Node/Ocelot routing endpoints
│   ├── dashboard.js    # Dashboard statistics
│   ├── checkout.js     # Stripe payment processing
│   ├── curseforge.js   # CurseForge integration
│   ├── referrals.js    # Referral system
│   ├── translate.js    # Translation API
│   ├── admin.js        # Admin dashboard/lookup endpoints
│   ├── support.js      # Support tooling endpoints
│   └── agent.js        # Localhost-only endpoints for AI agents (e.g. Claude Code)
├── scripts/
│   ├── mc.js           # Minecraft server control (start, stop, install)
│   ├── files.js        # File system operations
│   ├── ftp.js          # FTP server setup
│   ├── backups.js      # Server backup management
│   ├── stats.js        # Server statistics collection
│   ├── scraper.js      # Mod/plugin scraping (CurseForge, Modrinth)
│   ├── security.js     # Security utilities
│   ├── utils.js        # General utilities
│   ├── accountLinking.js # Cross-login-method account lookup/linking helpers
│   ├── modpackChecker.js # Automated boot-check of popular modpacks
│   ├── logPrefix.js    # Derives the [script] tag on every console line
│   └── migrations.js   # Database migrations
├── config.txt          # Configuration file (API keys, settings)
└── servers/            # Running server instances
```

### Key Features

#### Server Management
- Create, start, stop, and delete Minecraft servers
- Manage server properties (difficulty, MOTD, player limits)
- Real-time player online/offline tracking
- Terminal access and command execution

#### Authentication
- Email + password registration/login
- Discord OAuth integration
- Token-based API authentication
- Account management

**One email = one account.** Accounts live in `accounts/{type}:{identifier}.json` (`email:`, `google:`, `discord:` — Discord keys by username, not email), but every account stores its billing email in the `email` field, which is what links them.
- All three signup paths in `routes/accounts.js` call `findConflictingAccount()` before creating an account. If the email already exists under a *different* login method, signup is refused with `{ token: -1, duplicateAccount: true, existingLoginMethod, reason }` and the frontend tells the user which method to sign in with. Sign-in paths are never blocked.
- `scripts/accountLinking.js` holds the shared helpers (`findAccountsByEmail`, `groupAccountsByEmail`, `parseAllowedAccounts`, `isAllowedAccount`) used by both the signup guards and the migration.
- Accounts that were already duplicated before this rule are linked by the `mergeDuplicateEmailAccounts` migration, which grants every account in an email group access to every live server the group owns. Access requires *both* the server id in `account.servers` and the account id in the server's `allowedAccounts` string — same contract as `/server/:id/allowAccount` and `utils.hasAccess`.
- The migration also credits `freeServers` by the number of servers it adds to each account. Server creation is gated on `subs + freeServers > servers.length` ([server/index.js](quartz/routes/server/index.js)), so growing `servers.length` without this would strip slots from users who had already paid. This deliberately leaves some merged users slightly ahead — the trade was chosen over the support load of under-crediting.
- A `{id}:freed` entry means the server was moved to `trashbin/` and its numeric id released for reuse, so folder existence alone never proves ownership — always check `server.accountId` before sharing a server.

**Subscription state resolves per email, not per account file.** `logs/subscriptions.json` records subscriptions against the account file that *owns* each server, so a linked account would otherwise see a different answer than its sibling. Anything answering "is this paid for?" must widen to the email group via a `getLinkedAccountFiles(accountName, accountData)` lookup — `routes/info.js` keeps a local copy so the request path carries no dependency on the linking module; `scripts/utils.js` uses the shared one:
- `routes/info.js` matches `sub.owner` against the whole group, so the expired-server card (code 106) shows on both logins instead of only the owner's.
- The same list resolves `trashbin/{id}-{owner}` lookups, since those folders are named after the owning account — without it a linked account reports 104 ("data deleted") for data sitting safely in trashbin.
- `utils.js` writes the `{id}:freed` marker to every linked account holding the id, so both logins land on code 100 rather than one falling through to a bare 101.
- `utils.js` requires `accountLinking` **lazily inside the function** — `accountLinking` imports `readJSON` from `utils.js`, so a top-level import there would create a cycle.

#### Payments (Provider Mode)
- Stripe integration for server subscriptions
- Pricing tiers (Basic, Modded)
- Subscription management
- Billing portal

#### Mods & Plugins
- CurseForge and Modrinth integration
- Automatic mod/plugin downloading and installation
- Modpack support with automatic extraction

**Server packs are what customers actually install.** When a CurseForge modpack version has a paired server pack (the file's `alternateFileId`), `ModpackVersion.svelte` silently swaps the install's `downloadUrl`/`versionId` over to it and shows a "Server Pack" badge — the client-pack file the version row nominally represents is never downloaded. Server packs bundle every jar directly and carry **no `manifest.json`**, so `downloadModpack()` takes its no-manifest branch: nothing is fetched per-mod, the client-side/conflict filters never run, no `curseforge.index.json` is written (so the in-place update flow can't detect the installed version), and mods sit under their original filenames rather than `cf_{id}_CFMod.jar`. This also means the manual-mod hold never engages — mods whose authors disabled third-party API downloads arrive pre-bundled (packs like DawnCraft ship them with permission), which is why a pack can look "17 mods blocked" through the client manifest yet install completely for customers.

After a modpack install, `mc.js` filters the `mods/` folder twice, in this order:
1. `deleteClientSideMods()` — **deletes** anything matching `assets/clientsidemods.txt`, an unconditional list of client-only mods.
2. `resolveModConflicts()` — **renames to `.jar.disabled`** anything matching a rule in `assets/modconflicts.json`, whose format is `[{ "disable": "radium", "whenPresent": ["modernfix", "improvedmobs"], "reason": "..." }]`. Use this list for mods that only break in the presence of another mod; the rename (rather than a delete) lets an admin restore the jar from the Files tab.

Both match on the file name lowercased with `-`/`_` stripped, so a bare token like `radium` also catches `Radium-mc1.18.2-0.12.2.jar`. Conflict rules only consider live `.jar` files, so a jar already renamed to `.jar.disabled` is neither a trigger nor a target and re-running the check is a no-op. Both run only on the modpack install path — mods uploaded manually afterwards are not filtered.

#### Mods CurseForge Won't Serve (Manual Mod Hold)
A CurseForge author can switch off third-party downloading for their mod, and the panel then has no way to fetch it — `/v1/mods/{id}/files/{fileId}/download-url` answers 403, or 200 with no `data`. Rather than booting a modpack with mods silently missing, `run()` **parks the server before startup** and asks the user to supply those jars.
- **Detection is two-sided.** Before the download loop, `fetchCurseForgeModMeta()` bulk-fetches every mod in the manifest via `POST /v1/mods` (chunked at 100 ids per request — CurseForge doesn't document a cap, so this doesn't assume one) and reads `allowModDistribution`. An explicit `false` skips the per-file lookup entirely. This is purely an optimization, though: `fetchCurseForgeDownloadUrl()` is still the source of truth, so a mod this precheck misses (or gets wrong) is still caught the moment its real download is attempted, via `isThirdPartyBlockedReason` on the failure reason. The flag is per **project**, and a specific file can behave differently than the project-level default.
- Only a distribution block holds a server. Rate limits, CDN failures and 404s stay ordinary `failedMods` entries — a retry can fix those, and demanding a manual upload for a flaky run would be wrong.
- Mods on `clientsidemods.txt` are dropped from the list: `deleteClientSideMods()` would bin them straight after the upload.
- `whenClearToBoot(id, engaged, start)` is the gate. `engaged` is only true when **this** `run()` call started the download (`modpackURL` set and `isNew`), so restarts and the modpack checker (which downloads separately and then calls `run()` with `modpackURL` undefined) can never inherit a stale hold. When engaged it also waits for the download to finish before booting at all, even with nothing blocked — previously the forge/neoforge installer or a Fabric spawn could win the race against a still-downloading pack and boot with an incompletely-populated `mods/`, the same failure mode called out for Fabric in the modpack-checker section above. This closes it for every loader, not just Fabric, and for real customer installs, not just the checker. A download that never settles releases after 30 minutes rather than parking the server forever.
- `getPendingManualMods(id)` only reports a pack once it's actually been **announced** by `whenClearToBoot` — not merely once `downloadModpack()` has finished. `POST /:id/modpack` (reinstalling a modpack on an already-running server, used by `ModpackVersion.svelte`'s in-place update flow) calls `downloadModpack()` directly, without going through `run()`/`whenClearToBoot` at all, so a blocked mod found there is silently missing on the next boot — same as before this feature existed — rather than surfacing a "waiting on mods" modal for a server that was never actually held and has already started.
- While held, the console carries one line the frontend keys on:
  `[Arth Hosting] This server has the following mods that need to be downloaded manually: {"mods":[…]}`
  Each entry has `projectId`, `fileId`, `name`, `fileName`, `logoUrl`, `pageUrl` and `downloadUrl`. **Keep this string stable** — `Terminal.svelte` matches it verbatim and dispatches a `manualModsRequired` window event with the parsed list. State stays `starting` throughout.
- Releasing is `resumeManualMods(id)` (the upload happened) or `releaseManualModsHold(id)` (the user gave up). `stop`/`stopAsync`/`kill`/`killAsync` all release — a held server has no process to send `stop` to, so its state would otherwise never settle back to `false`.
- API: `GET /server/:id/manual-mods` returns the pending list (empty when nothing is held); `POST /server/:id/manual-mods` takes a multer `files` array, writes the jars into `servers/{id}/mods/`, and calls `resumeManualMods`. It deliberately accepts **zero** files — that's the user starting without a mod they couldn't get, and refusing would leave stopping as the only way off the hold. There's no `run()` call on that path; the boot is already waiting inside `whenClearToBoot`.
- Frontend: `ManualModsModal.svelte` (opened from the window event, with a 10s poll of the endpoint as a tab-independent backstop) lists each mod with its CurseForge download link and matches staged files back to the expected `fileName`.

#### Multi-Node Support (Ocelot)
- Distribute servers across multiple backend instances
- Node registry and routing
- Load balancing

#### Panel Console Logging
The console wrapper at the top of `run.js` prints `[timestamp] [tag] message`, where the tag is derived from the **call site** by `scripts/logPrefix.js` — `[mc]`, `[info]`, `[server/files]`, `[quartz]` for run.js, package name for node_modules. Nothing needs to opt in, so new scripts and routes are tagged automatically.
- Do **not** add a second console wrapper. Dedup keys on the raw message; a wrapper that prepends to the message would make every line from a file look like a repeat of the last. Tagging is folded into the existing wrapper for this reason.
- `console.warn`/`console.error` are tagged but never deduped.
- **Never echo a server's console into the panel's.** Server output already goes to `terminalOutput[id]` (which the frontend reads) and, on a crash, to `logs/crash.txt`. Log the *fact* of a failure with the server id, not its output.
- Account objects must never be logged — they carry `password`, `salt` and `token`.

#### Automated Modpack Checks
`scripts/modpackChecker.js` boots the 10 **most-downloaded** modpacks two at a time and records whether each reaches an online state. The two slots drain a shared work queue (each pulls the next pack the moment its current one settles — a slow pack doesn't stall the other slot), and `progress.currentPacks` is **slot-indexed** with `null` for a drained slot, each entry carrying its own `phase`; the stream endpoint and both admin components skip the nulls. Runs **weekly** (Sunday 04:15) as the `checkModpacks` system task, or on demand via the `checkModpacks` console command. Results land in `logs/modpackChecks.json`.
- Coverage: Forge (CurseForge) only, on every version in `FORGE_GAME_VERSIONS` — `1.18.2, 1.12.2, 1.20.1, 1.16.5` — ranked and fetched **per version**. That's ~40 packs, each of which can take two attempts, which is why the schedule is weekly rather than 12-hourly. `run.js` rewrites the cron of an existing `checkModpacks` task on boot, so panels created before the switch move to weekly on their next restart. Fabric is no longer in the batch run, but `resolveFabricPack` is kept so the admin recheck button (`checkOneModpack`) still works on old `mr` rows in the log.
- Ranking is by download count: CurseForge `sortField=6` (TotalDownloads, **not** 2/Popularity, which blends recency and relevance).
- **Forge packs are checked as their server pack when one exists**, mirroring the customer flow (see the server-pack note under Mods & Plugins): `resolveForgePack` walks the fetched file list (newest first) and installs the newest file whose `alternateFileId` resolves to a server pack — even when the very latest file has none — marking the pack (and its result's `mods` object) `serverPack: true`. If no server pack resolves, it falls back to the newest client file rather than skipping the check. Because a server pack has no manifest, the checker can't wait on the index-file rewrite — `waitForModpackInstall` instead polls `mc().isModpackDownloadSettled(id)`, a flag on the per-server download record that every `downloadModpack()` exit path sets. Finishes name the record they belong to, so a download abandoned by an earlier timed-out pack can't settle a newer install in the shared slot. Server-pack results report `expected`/`manifest` as 0 with the real `installed` count (an empty `mods/` after extraction is an outright failure), and the admin modal labels them accordingly.
- Every pack object and result carries `gameVersion`; the log adds `gameVersions` (versions actually covered) alongside the legacy single `gameVersion` field.
- Uses **two reserved server slots** (`modpackCheckServerId` in config.txt, default `50000`, plus that id + 1), each wiped between packs. A slot is refused at startup if it falls inside `[idOffset, idOffset + maxServers)` — the range `/server/reserve` hands to customers — or if `10000 + id + 66` isn't a valid port.
- Its `server.json` carries `adminServer: true` (so the subscription sweeper won't bin it) and `modpackCheck: true` (so `backups.js` won't back up a throwaway world).
- **Install and boot are deliberately sequential.** `run()` normally kicks off `downloadModpack()` and spawns the server concurrently; for Fabric there's no installer step to mask that, so a half-installed pack could reach "Done" and be recorded as a pass. The checker downloads first, waits for the index file to be rewritten with `currentVersionDateAdded` (which only happens after every mod download settles), then calls `run()` with `modpackURL` undefined.
- A missing `assets/jars/<loader>-<version>-*.jar` is reported as `skipped`, not `failed` — the loader jar is the panel's problem, not the pack's. Checked per pack version, so a panel with a Forge 1.18.2 jar but no 1.12.2 one skips only the 1.12.2 packs.
- A failed attempt is **retried once**, killing the container and wiping the slot in between. Per-attempt timeouts are unchanged, so a failing pack costs up to twice the wall time. `attempts` and `firstFailure` are recorded on the result. `skipped` never retries.
- Results carry `mods: { expected, installed, manifest, removedClientSide, disabledByConflict }`. CurseForge serves nothing for mods whose authors disabled third-party downloads, so a pack can install partially and still boot — a pass with far fewer mods than expected is not a healthy pack. `manifest` is what the pack declared; `expected` is that minus the mods the panel itself removed (`clientsidemods.txt`) or disabled (`modconflicts.json`), because those downloaded fine and counting them as missing made every modded pack look like a partial install. `installed` counts live `.jar` files, so a `.jar.disabled` is excluded from both sides.
- The two filters run inside `downloadModpack`, *synchronously* right after the index file is written — and that write is the checker's completion signal, so the filtering is always finished before the checker looks at `mods/`. They record what they took out in `mc.js`'s `modFilterStats`, read back via `getModFilterStats(id)`; `runAttempt` calls `resetModFilterStats(id)` so a retry can't inherit the previous attempt's numbers.
- `GET /admin/modpack-checks` serves the log behind the existing `verifyAdmin` middleware, plus `running`, live `progress`, and `forgeGameVersions`. This drives the admin Modpack Checker modal and stays admin-only since it also carries `consoleTail` and per-mod debug stats. (Search results no longer show a per-pack pass/fail badge for admins — only the public verified checkmark.)
- `GET /modpack-checks` (`routes/modpackChecks.js`) is the public, unauthenticated counterpart: it serves the same `results` array trimmed to `platform, projectId, gameVersion, status, checkedAt` — nothing sensitive — and drives the green "verified" checkmark on a modpack search result (`verified` prop on `ModpackResult.svelte`, populated via `verifiedByPack` in `Modpacks.svelte`) for every visitor, not just admins.
- The **Modpack Checker** button on the admin dashboard opens `ModpackChecksModal.svelte`, which renders the results grouped by loader + game version (with per-row console tail on expand) or, while a run is in flight, its live progress — polling the same endpoint every 5s until `running` goes false.
- Because a Forge pack can now be checked on several versions, `Modpacks.svelte` de-duplicates results per `platform:projectId` (`verifiedByPack`, built by the `buildChecksMap` helper), preferring the result matching the server's own version and otherwise the most recent.

#### Agent Routes (`/agent`)
- Endpoints in `routes/agent.js`, mounted at `/agent`, meant to be called locally by AI coding agents (e.g. Claude Code) working on this repo — not by Observer or any other client
- Locked down by a `localOnly` middleware that rejects any request whose socket isn't `127.0.0.1`/`::1`; since `run.js` never sets `trust proxy`, `req.socket.remoteAddress` can't be spoofed via `X-Forwarded-For`
- Endpoints are read-only by convention — they exist to give an agent visibility into live data (Stripe, accounts, servers) without it needing DB/API credentials of its own
- Current endpoints:
  - `GET /agent/stripe/subscriptions?email=|accountId=|customerId=` — read-only Stripe subscription lookup for a customer
- When adding a new agent endpoint: add it to `routes/agent.js` (inherits `localOnly` automatically), keep it read-only unless there's a specific reason not to, and document it in this list

#### Configuration

The `config.txt` file contains:
```
MYSQL_HOST=
MYSQL_PORT=
MYSQL_USERNAME=
MYSQL_PASSWORD=
MYSQL_DATABASE=
DISCORD_OAUTH_ID=
DISCORD_OAUTH_SECRET=
STRIPE_API_KEY=
STRIPE_WEBHOOK_SECRET=
SERVER_PORT=5000
PROVIDER_MODE=false
DOCKER_MODE=true
```

### API Patterns

Most endpoints require authentication via:
- `Authorization: Bearer [token]` header, or
- `X-User-Token` and `X-User-Email` headers

Example route structure:
```javascript
// routes/accounts.js
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  // Validate credentials
  // Generate token
  // Return token and accountId
});
```

### Common Tasks

#### Adding a New API Endpoint

1. Create function in appropriate route file (`routes/`)
2. Use Express request/response pattern
3. Include authentication check if needed
4. Return JSON response
5. Document in wiki

#### Working with Servers

1. Server instances stored in `servers/` directory
2. Use `scripts/mc.js` for Minecraft server control
3. Use `scripts/files.js` for file operations
4. WebSocket events for real-time updates via Socket.io

#### Database Operations

1. Use MySQL XDevAPI from `@mysql/xdevapi` package
2. Connection typically established in `run.js`
3. Queries should be parameterized for security

---

## Observer Frontend

### Overview

Observer is the user-facing web interface built with SvelteKit. It:
- Provides dashboard for server management
- Handles real-time server monitoring
- Manages authentication and account settings
- Integrates with Stripe for payments
- Allows mod/plugin browsing and installation

### Tech Stack

- **Framework**: SvelteKit with Svelte 3
- **Styling**: TailwindCSS + DaisyUI + SCSS
- **Icons**: Lucide Icons (svelte-lucide)
- **Build**: Vite
- **Type Checking**: TypeScript

### Development Commands

```bash
# Install dependencies
npm i

# Start development server on http://localhost:5173
npm run dev

# Build production version
npm run build

# Preview production build locally
npm run preview

# Type-check Svelte components
npm check

# Type-check in watch mode
npm check:watch
```

### Project Structure

```
observer/
├── src/
│   ├── routes/               # SvelteKit file-based routing
│   │   ├── (login)/          # Protected routes (require auth)
│   │   ├── (nologin)/        # Public routes (auth pages)
│   │   └── (redirects)/      # Utility redirects
│   ├── lib/
│   │   ├── components/       # Reusable Svelte components
│   │   │   ├── ui/           # Generic UI components (Modal, Alert, etc.)
│   │   │   ├── buttons/      # Button variants
│   │   │   ├── pages/        # Page-specific components
│   │   │   └── layout/       # Layout wrapper components
│   │   ├── stores/           # Svelte writable stores (localStorage persisted)
│   │   │   ├── token.ts      # Auth token
│   │   │   ├── accountEmail.ts
│   │   │   └── darkMode.ts   # Theme preference
│   │   └── scripts/
│   │       ├── req.ts        # Main API client (21KB - handles all backend communication)
│   │       ├── i18n.ts       # Internationalization
│   │       ├── utils.ts      # Helper functions
│   │       └── translations.ts
│   └── app.svelte            # Root component
├── static/                    # Static assets
├── .env                       # Environment variables (local development)
└── svelte.config.js           # SvelteKit configuration
```

### Environment Configuration

Configure via `.env` file (development) or Docker environment variables:

```env
PUBLIC_API_URL=http://localhost:5000/    # Quartz backend address
PUBLIC_STRIPE_KEY=pk_...                 # Stripe public key
PUBLIC_STRIPE_PAYMENT_LINK=https://...   # Stripe customer portal
PUBLIC_USING_CURSEFORGE=false            # Enable CurseForge support
PUBLIC_USING_OCELOT=false                # Enable multi-node routing
PUBLIC_LR_URL=https://api.modrinth.com   # Labrinth instance URL
PUBLIC_CUSTOMER_PORTAL_LINK=https://...  # Stripe customer portal link
```

### Key Architecture

#### API Communication (`req.ts`)

Central hub for all backend API calls:
- Reads `PUBLIC_API_URL` environment variable
- Manages authentication headers (token, email/username)
- Handles Ocelot multi-node routing
- Provides typed functions for all endpoints

Pattern:
```javascript
export function getServers(email: string) {
  let url = apiurl + "info/servers?accountId=" + localStorage.getItem("accountId");
  return fetch(url, GET).then(res => res.text()).then(...)
}
```

#### Authentication Flow

1. User logs in via email or Discord OAuth
2. Backend returns `token` and `accountId`
3. Both stored in localStorage
4. All subsequent requests include token/email in headers
5. Stores hydrated from localStorage on app load

#### Component Pattern

```svelte
<script lang="ts">
  import { onMount } from "svelte";

  let data = "";

  onMount(async () => {
    // Fetch data from backend
  });
</script>

<component-html>
  {#if condition}
    <!-- Svelte template -->
  {/if}
</component-html>

<style lang="scss">
  /* component styles */
</style>
```

#### Routing

Uses SvelteKit's file-based routing with group folders:
- `(login)` - Protected routes requiring authentication
- `(nologin)` - Public routes for non-authenticated users
- `(redirects)` - Utility redirect pages

#### Styling

- **TailwindCSS**: Utility-first CSS framework
- **DaisyUI**: Component library built on Tailwind
- **SCSS**: Custom component styles in `components.scss`
- **Dark/Light Mode**: Handled by `theme-change` library

### Common Tasks

#### Adding a New API Endpoint

1. Add function to `req.ts` following existing pattern
2. Use `apiurl` or `getServerNode(id)` for base URL
3. Include token/email in headers
4. Return parsed JSON response

#### Creating a New Page

1. Create route file in `src/routes/` (SvelteKit routing)
2. Create page-specific components in `src/lib/components/pages/`
3. Import API functions from `req.ts`
4. Call in `onMount` hook
5. Use TailwindCSS + DaisyUI classes for styling

#### Debugging API Issues

1. Verify `PUBLIC_API_URL` is set correctly
2. Check token in localStorage via browser console
3. Monitor Network tab for request/response details
4. Check `req.ts` for correct endpoint path construction

### Important Implementation Notes

1. **Browser Guard**: Most functions check `if(browser)` to avoid SSR issues
2. **Error Handling**: API responses parsed as text first, checked for error codes
3. **Request Templates**: GET, POST, DELETE objects contain headers for consistency
4. **Event Dispatching**: Uses `window.dispatchEvent()` for cross-component communication
5. **Localization**: Translation strings exist but i18n may not be fully implemented
6. **Icons**: Lucide Icons (svelte-lucide) for all UI icons

---

## Communication Between Projects

### Frontend → Backend

Observer communicates with Quartz via HTTP/REST API:

```
Observer (http://localhost:5173)
    ↓
Quartz API (http://localhost:5000/api/...)
    ↓
Returns JSON responses
```

**Key API Endpoints** (from Observer's `req.ts`):
- `/api/auth/login` - Authentication
- `/api/info/servers` - List user's servers
- `/api/server/start`, `/api/server/stop` - Server control
- `/api/mods/search` - Mod search (Modrinth/CurseForge)
- `/api/checkout` - Payment processing

### Real-time Updates

Uses WebSockets (Socket.io) for real-time communication:
- Server status changes
- Player online/offline events
- Terminal output streaming
- Console command responses

---

## Deployment

### Docker

Both projects include Dockerfiles for containerized deployment:

**Quartz**:
```bash
docker build -t quartz .
docker run -p 5000:5000 -v ./servers:/app/servers quartz
```

**Observer**:
```bash
docker pull arthmc/observer:latest
docker run -p 3000:3000 -e PUBLIC_API_URL=http://quartz:5000/ arthmc/observer:latest
```

### Non-Docker

Both can run standalone with Node.js:

**Quartz**:
```bash
npm i
node run
```

**Observer**:
```bash
npm i
npm run build
node build
```

---

## Development Workflow

### Making Changes

1. **Backend Changes**:
   - Modify files in `quartz/` (restart server automatically with nodemon)
   - Test endpoints with tools like Postman or curl
   - Check `config.txt` for required settings

2. **Frontend Changes**:
   - Modify files in `observer/` (hot reload in dev mode)
   - Verify `PUBLIC_API_URL` points to running Quartz instance
   - Run type checking: `npm check`

### Testing the Integration

1. Start Quartz backend: `cd quartz && npm run server`
2. Start Observer frontend: `cd observer && npm run dev`
3. Navigate to http://localhost:5173
4. Create account and test server creation

---

## Important Notes

- **Modes**: Quartz supports "Non-provider mode" (single user) and "Provider mode" (multi-tenant with payments)
- **Configuration**: Most settings require restart of Quartz server
- **Database**: Both modes use MySQL; provider mode uses additional features
- **Security**: Use Docker for security if port-forwarding
- **Dependencies**: Requires `zip` and `curl` commands on host system

---

## Useful Resources

- Main Wiki: Check GitHub wiki for API documentation
- Next Branch: Development happens on `next` branch, not `main`
- Contributing: See README files in each project for contribution guidelines
