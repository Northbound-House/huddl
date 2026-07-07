# Deployment Guide

This repository supports **two separate deployments** with different configurations:

1. **jhuddl** (Jack Henry Internal) - Lightweight static site with localStorage only
2. **huddl** (Public) - Full Firebase backend with Firestore, Auth, and Storage

---

## jhuddl (Jack Henry Internal Deployment)

**Name:** jhuddl  
**Target:** Jack Henry employees only (`@jackhenry.com` email required)  
**Backend:** None (localStorage only - all data stays in browser)  
**Hosting:** Netlify (free tier)  
**URL:** `https://jhuddl.netlify.app` (or custom domain)

### Build

```bash
npm run build:jackhenry
```

This creates a production build in `dist/` with:
- No Firebase backend (uses localStorage)
- Authentication locked to `@jackhenry.com` domain
- All features working client-side only

### Deploy to Netlify

**Recommended:** Connect your Git repository for automatic deployments on push.

1. Sign up at [netlify.com](https://netlify.com)
2. Click "Add new site" → "Import an existing project"
3. Connect your Git provider (GitHub/GitLab/Bitbucket)
4. Select this repository
5. Build settings (automatically detected from `netlify.toml`):
   - **Build command:** `npm run build:jackhenry`
   - **Publish directory:** `dist`
   - **Node version:** 18
6. Click "Deploy site"

**Manual deployment:**
```bash
npm run build:jackhenry
# Drag and drop dist/ folder to Netlify dashboard
```

**Custom domain:** Add in Site settings → Domain management

The `netlify.toml` file configures:
- Build command and output directory
- SPA routing (redirects all routes to index.html)
- Security headers

### Configuration

The Jack Henry build is configured via `.env.jackhenry`:
- Firebase config is **empty** (forces localStorage mode)
- `VITE_ALLOWED_AUTH_EMAIL_DOMAIN=jackhenry.com` (restricts access)
- `VITE_USE_FIRESTORE=false` (explicit localStorage mode)

**Note:** The `.env.jackhenry` file is gitignored. You'll need to:
1. Copy `.env.jackhenry` (from this repo) to your deployment environment
2. Or set these environment variables in Cloudflare/Netlify dashboard
3. Or the build will use embedded fallback (which won't work without Firebase)

---

## huddl (Public Deployment)

**Name:** huddl  
**Target:** General public (any email domain)  
**Backend:** Firebase (Firestore, Auth, Storage, Functions)  
**Hosting:** Firebase Hosting  
**URL:** `https://app.huddl.cloud`

### Build

```bash
npm run build:public
```

This creates a production build with:
- Full Firebase backend (Firestore, Auth, Storage)
- No domain restrictions on authentication
- Cloud Functions for server-side logic

### Deploy

```bash
npm run deploy:public
```

This will:
1. Build the app with public config
2. Deploy to Firebase Hosting
3. Deploy Firestore rules
4. Deploy Storage rules

**Separate function deployment** (if needed):
```bash
npm run deploy:functions
```

### Configuration

The public build uses `.env.public`:
- Full Firebase config (API keys, project ID, etc.)
- `VITE_ALLOWED_AUTH_EMAIL_DOMAIN=` (empty = allow all domains)
- `VITE_USE_FIRESTORE=true` (enable Firestore backend)

**Note:** The `.env.public` file is gitignored but contains the actual Firebase config from `src/lib/firebaseClientConfig.js` as fallback.

### Firebase Setup

The public deployment requires:
- Firebase project: `huddle-ab42f`
- Custom domain: `app.huddl.cloud`
- Firebase services enabled:
  - Authentication (Google Sign-In)
  - Firestore Database
  - Cloud Storage
  - Cloud Functions
  - Hosting

---

## Environment Variables

Both builds use Vite's [mode-specific env files](https://vitejs.dev/guide/env-and-mode.html):

- `.env.jackhenry` → loaded when `--mode jackhenry`
- `.env.public` → loaded when `--mode public`
- `.env.local` → your local development overrides (gitignored)

All variables must be prefixed with `VITE_` to be exposed to the client.

---

## Development

**Local development** uses `.env.local`:

```bash
npm run dev
```

Create `.env.local` from `.env.example` and configure for your environment (Jack Henry or public Firebase).

---

## Architecture Differences

| Feature | jhuddl (Jack Henry) | huddl (Public) |
|---------|-----------|--------|
| **Data Storage** | Browser localStorage | Firestore Database |
| **Authentication** | Google OAuth (@jackhenry.com only) | Google OAuth (any domain) |
| **File Uploads** | Not available | Cloud Storage |
| **Server Logic** | None (client-side only) | Cloud Functions |
| **Hosting Cost** | Free (static site) | Firebase Free tier (upgradeable) |
| **Data Persistence** | Per-device only | Cloud (synced across devices) |
| **Backend Setup** | None required | Firebase project required |

---

## Maintenance

### Updating jhuddl (Jack Henry)
1. Make code changes
2. Test locally: `npm run dev` with `.env.local` set to localStorage mode
3. Build: `npm run build:jackhenry`
4. Deploy to Cloudflare Pages/Netlify (auto-deploy on git push if connected)

### Updating huddl (Public)
1. Make code changes
2. Test locally: `npm run dev` with Firebase config in `.env.local`
3. Deploy: `npm run deploy:public`

### Updating Both
Since they share the same codebase, most changes apply to both. Just run both build/deploy commands.

---

## Troubleshooting

**Jack Henry build shows Firebase errors:**
- Ensure `.env.jackhenry` has empty Firebase values
- Check that `VITE_USE_FIRESTORE=false` is set
- The app should fall back to localStorage when Firebase config is missing

**Public build shows domain restriction:**
- Check `.env.public` has `VITE_ALLOWED_AUTH_EMAIL_DOMAIN=` (empty)
- Or remove that line entirely to allow all domains

**Authentication not working:**
- Jack Henry: Ensure user email ends with `@jackhenry.com`
- Public: Check Firebase Authentication is enabled and Google provider is configured

**Data not persisting in Jack Henry build:**
- localStorage is per-device and per-browser
- Clearing browser data will erase all Huddl data
- No cloud backup - this is expected behavior for the Jack Henry deployment
