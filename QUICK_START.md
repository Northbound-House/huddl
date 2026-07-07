# Quick Start: Deploying jhuddl & huddl

## TL;DR

**jhuddl (Jack Henry Internal):**
```bash
npm run build:jackhenry
# Upload dist/ to Netlify (free, no Firebase needed)
```

**huddl (Public):**
```bash
npm run deploy:public
# Deploys to Firebase (requires Firebase project)
```

---

## jhuddl - Jack Henry Deployment (Netlify)

### First Time Setup

1. **Create Netlify site:**
   - Go to [netlify.com](https://netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Connect your Git provider and select this repo

2. **Build settings** (auto-detected from `netlify.toml`):
   - Build command: `npm run build:jackhenry`
   - Publish directory: `dist`
   - Node version: 18

3. **Deploy!**
   - Netlify auto-deploys on every git push
   - Or manually drag & drop `dist/` folder

### Manual Deployment

```bash
# Build
npm run build:jackhenry

# Upload dist/ to Netlify
# (Drag & drop to Netlify dashboard)
```

### What This Gets You
- ✅ Free hosting (Netlify free tier)
- ✅ No Firebase project needed
- ✅ All data in browser localStorage
- ✅ Only `@jackhenry.com` emails can sign in
- ✅ HTTPS with custom domain support
- ✅ Auto-deploy on git push
- ❌ No cloud sync (data stays on device)
- ❌ No file uploads

---

## huddl - Public Deployment (Firebase)

### Prerequisites
- Firebase project already exists: `huddle-ab42f`
- Firebase CLI installed: `npm install -g firebase-tools`
- Authenticated: `firebase login`

### Deploy

```bash
npm run deploy:public
```

This builds with public config and deploys:
- ✅ Hosting to Firebase
- ✅ Firestore rules
- ✅ Storage rules

### What This Gets You
- ✅ Cloud database (Firestore)
- ✅ Cloud storage (profile photos, etc.)
- ✅ Any email domain can sign in
- ✅ Data syncs across devices
- ✅ Firebase Free tier (upgradable)

---

## Cost Comparison

| | jhuddl (Jack Henry) | huddl (Public) |
|---|---|---|
| **Hosting** | $0 (Netlify) | $0 (Firebase free tier) |
| **Database** | $0 (localStorage) | $0 (within free tier) |
| **Storage** | N/A | $0 (within free tier) |
| **Auth** | $0 (Google OAuth) | $0 (Google OAuth) |
| **Total** | **$0** | **~$0** (scales with usage) |

---

## Configuration Files

- `.env.jackhenry` → Jack Henry build config
- `.env.public` → Public build config
- `.env.local` → Your local dev config (gitignored)

All are **gitignored** for security.

---

## Testing Locally

**Jack Henry mode:**
```bash
# Create .env.local with Jack Henry settings
cp .env.jackhenry .env.local
npm run dev
```

**Public mode:**
```bash
# Create .env.local with public settings
cp .env.public .env.local
npm run dev
```

---

## Common Issues

**"Firebase not configured" error in Jack Henry build:**
- ✅ Expected! The app will use localStorage automatically

**Can't sign in with non-Jack Henry email in Jack Henry build:**
- ✅ Working as intended. Only `@jackhenry.com` allowed

**Public build still restricts domain:**
- Check `.env.public` has `VITE_ALLOWED_AUTH_EMAIL_DOMAIN=` (empty)
- Make sure you ran `npm run build:public` not `npm run build:jackhenry`

**Netlify build fails:**
- Node version: Should be auto-detected from `netlify.toml` (Node 18)
- Build command: Should be auto-detected as `npm run build:jackhenry`
- If issues persist, check Netlify build logs for specific errors

---

## Next Steps

1. **Deploy jhuddl** to Netlify now (no Firebase setup needed)
2. **Keep using Firebase** for huddl (already configured)
3. **Update code** once, deploy to both with separate commands

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed documentation.
