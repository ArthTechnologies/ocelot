# CLAUDE.md - Arth Panel

This file provides guidance to Claude Code when working with code in this repository.

## Overview

**Arth Panel** is a lightweight self-hosted Minecraft server management platform consisting of two main components:

- **Quartz** (Backend): Node.js/Express API server for managing servers, authentication, payments, and real-time monitoring
- **Observer** (Frontend): SvelteKit + TailwindCSS web interface for users to manage their Minecraft servers

This monorepo structure keeps both projects in sync and allows coordinated development.

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
│   └── translate.js    # Translation API
├── scripts/
│   ├── mc.js           # Minecraft server control (start, stop, install)
│   ├── files.js        # File system operations
│   ├── ftp.js          # FTP server setup
│   ├── backups.js      # Server backup management
│   ├── stats.js        # Server statistics collection
│   ├── scraper.js      # Mod/plugin scraping (CurseForge, Modrinth)
│   ├── security.js     # Security utilities
│   ├── utils.js        # General utilities
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

#### Payments (Provider Mode)
- Stripe integration for server subscriptions
- Pricing tiers (Basic, Modded)
- Subscription management
- Billing portal

#### Mods & Plugins
- CurseForge and Modrinth integration
- Automatic mod/plugin downloading and installation
- Modpack support with automatic extraction

#### Multi-Node Support (Ocelot)
- Distribute servers across multiple backend instances
- Node registry and routing
- Load balancing

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
