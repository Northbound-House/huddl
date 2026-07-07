# Huddl

Agile retrospective and sprint planning tool with two deployment targets:

- **jhuddl** - Jack Henry internal (Netlify + localStorage)
- **huddl** - Public (Firebase + Firestore)

---

## Quick Links

- 📖 **[Quick Start](QUICK_START.md)** - Fast reference for building and deploying
- 🚀 **[Deployment Guide](DEPLOYMENT.md)** - Complete deployment documentation
- 🔧 **[Netlify Setup](NETLIFY_SETUP.md)** - Deploy jhuddl to Netlify
- 📦 **[Migration Guide](MIGRATION_GUIDE.md)** - Migrate Jack Henry users from Firebase to Netlify

---

## Two Deployments

| | jhuddl (Jack Henry) | huddl (Public) |
|---|---|---|
| **Target** | Jack Henry employees only | General public |
| **Auth** | `@jackhenry.com` Google OAuth | Any email Google OAuth |
| **Backend** | None (localStorage) | Firebase (Firestore) |
| **Hosting** | Netlify | Firebase Hosting |
| **URL** | `jhuddl.netlify.app` | `app.huddl.cloud` |
| **Cost** | $0 (Netlify free tier) | ~$0 (Firebase free tier) |

---

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
# Install dependencies
npm install

# Create local config
cp .env.example .env.local
# Edit .env.local with your settings (Jack Henry or public mode)

# Start dev server
npm run dev
```

Visit `http://localhost:5173`

### Build

**Jack Henry (jhuddl):**
```bash
npm run build:jackhenry
```

**Public (huddl):**
```bash
npm run build:public
```

---

## Deployment

### jhuddl (Jack Henry → Netlify)

**First time:**
1. Follow **[NETLIFY_SETUP.md](NETLIFY_SETUP.md)** to create the site
2. Connect your Git repo for auto-deploy

**Updates:**
```bash
git push
# Netlify auto-deploys on push
```

**Manual:**
```bash
npm run build:jackhenry
# Drag dist/ to Netlify dashboard
```

### huddl (Public → Firebase)

```bash
npm run deploy:public
```

This deploys:
- Hosting (app.huddl.cloud)
- Firestore rules
- Storage rules

---

## Migration (Firebase → Netlify for Jack Henry)

Moving Jack Henry users from Firebase to Netlify:

1. **[Export](MIGRATION_GUIDE.md#step-1-export-jack-henry-data-from-firebase)** - Extract data from Firebase
2. **[Deploy](MIGRATION_GUIDE.md#step-2-deploy-jhuddl-to-netlify)** - Set up Netlify
3. **[Distribute](MIGRATION_GUIDE.md#step-3-distribute-export-file-to-jack-henry-users)** - Share export file
4. **[Import](MIGRATION_GUIDE.md#step-4-users-import-their-data)** - Users import via `/migrate`
5. **[Verify](MIGRATION_GUIDE.md#step-5-verification-period)** - 2-3 week verification
6. **[Cleanup](MIGRATION_GUIDE.md#step-6-clean-up-jack-henry-data-from-firebase)** - Remove from Firebase

See **[MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)** for complete instructions.

---

## Project Structure

```
.
├── src/
│   ├── api/               # Data layer (Firestore + localStorage)
│   ├── components/        # React components
│   ├── lib/               # Firebase config, auth, utilities
│   ├── pages/             # Route pages
│   │   └── MigratePage.jsx  # Data migration tool
│   └── app.jsx            # Routes and providers
├── scripts/
│   ├── exportJackHenryData.mjs    # Export from Firebase
│   └── cleanupJackHenryData.mjs   # Clean up Firebase
├── functions/             # Firebase Cloud Functions
├── .env.jackhenry        # Jack Henry build config (gitignored)
├── .env.public           # Public build config (gitignored)
├── netlify.toml          # Netlify configuration
├── firebase.json         # Firebase configuration
└── docs/
    ├── QUICK_START.md       # Fast reference
    ├── DEPLOYMENT.md        # Deployment guide
    ├── NETLIFY_SETUP.md     # Netlify setup
    └── MIGRATION_GUIDE.md   # Migration walkthrough
```

---

## Configuration

### Environment Variables

All variables must be prefixed with `VITE_` to be exposed to the client.

**Jack Henry mode** (`.env.jackhenry`):
```bash
VITE_ALLOWED_AUTH_EMAIL_DOMAIN=jackhenry.com
VITE_USE_FIRESTORE=false
# Leave all VITE_FIREBASE_* empty
```

**Public mode** (`.env.public`):
```bash
VITE_ALLOWED_AUTH_EMAIL_DOMAIN=
VITE_USE_FIRESTORE=true
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
# ... (full Firebase config)
```

### Build Modes

Vite's `--mode` flag loads different env files:

- `vite build --mode jackhenry` → loads `.env.jackhenry`
- `vite build --mode public` → loads `.env.public`

---

## Scripts

```bash
# Development
npm run dev                      # Start dev server

# Build
npm run build                    # Default build
npm run build:jackhenry          # Jack Henry build (localStorage)
npm run build:public             # Public build (Firebase)

# Deploy
npm run deploy:jackhenry         # Build and show Netlify instructions
npm run deploy:public            # Build and deploy to Firebase
npm run deploy:functions         # Deploy Cloud Functions only

# Migration
node scripts/exportJackHenryData.mjs           # Export from Firebase
node scripts/cleanupJackHenryData.mjs          # Clean up Firebase
node scripts/cleanupJackHenryData.mjs --dry-run  # Preview cleanup

# Data management
npm run reset:firestore          # Reset Firestore test data
```

---

## Features

- **Retrospectives** - Mad/Sad/Glad, Start/Stop/Continue
- **Sprint Boards** - Kanban-style with drag & drop
- **Teams & Organizations** - Multi-team support
- **Labels & Categories** - Color-coded organization
- **Google OAuth** - Sign in with Google
- **Dark Mode** - Auto-detects system preference
- **Offline-capable** - localStorage mode works offline

---

## Tech Stack

- **Frontend:** React, TailwindCSS, Vite
- **Backend (public):** Firebase (Firestore, Auth, Storage, Functions)
- **Backend (Jack Henry):** None (browser localStorage)
- **Hosting:** Firebase Hosting (public), Netlify (Jack Henry)

---

## License

Private / Internal Use

---

## Support

- **Public deployment:** Firebase Console
- **Jack Henry deployment:** Netlify Dashboard
- **Build issues:** Check `npm run dev` locally first
- **Migration issues:** See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md#troubleshooting)
