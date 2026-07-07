# Netlify Setup Guide for jhuddl

Step-by-step guide to deploy jhuddl to Netlify.

---

## Prerequisites

- ✅ Netlify account (you have one at https://app.netlify.com/teams/csweetwright)
- ✅ This repository pushed to Git (GitHub/GitLab/Bitbucket)
- ✅ `netlify.toml` file (already in this repo)
- ✅ `.env.jackhenry` file (already created, gitignored)

---

## Option 1: Deploy from Git (Recommended)

This enables automatic deployments on every git push.

### Step 1: Create New Site

1. Go to https://app.netlify.com/teams/csweetwright/sites
2. Click **"Add new site"** → **"Import an existing project"**

### Step 2: Connect Repository

1. Choose your Git provider (GitHub/GitLab/Bitbucket)
2. Authorize Netlify to access your repos (if first time)
3. Select this repository from the list

### Step 3: Configure Build Settings

The settings should be **auto-detected from `netlify.toml`**:

- **Site name:** `jhuddl` (or choose your own)
- **Branch to deploy:** `main` (or your default branch)
- **Build command:** `npm run build:jackhenry`
- **Publish directory:** `dist`
- **Node version:** 18

If not auto-detected, enter them manually.

### Step 4: Deploy!

1. Click **"Deploy site"**
2. Wait for build to complete (~2-3 minutes)
3. Your site will be live at: `https://jhuddl.netlify.app` (or `https://YOUR-SITE-NAME.netlify.app`)

### Step 5: (Optional) Custom Domain

1. Go to **Site settings** → **Domain management**
2. Click **"Add custom domain"**
3. Enter your domain (e.g., `jhuddl.jackhenry.com`)
4. Follow DNS configuration instructions
5. Netlify will auto-provision HTTPS certificate

---

## Option 2: Manual Deploy (Drag & Drop)

Use this for quick testing or if you don't want Git auto-deploy.

### Step 1: Build Locally

```bash
npm run build:jackhenry
```

This creates the `dist/` folder.

### Step 2: Deploy to Netlify

1. Go to https://app.netlify.com/teams/csweetwright/sites
2. Drag and drop the `dist/` folder onto the Netlify dashboard
3. Your site will be live at a random URL like `https://random-name-123.netlify.app`

### Step 3: (Optional) Rename Site

1. Go to **Site settings** → **General** → **Site details**
2. Click **"Change site name"**
3. Enter `jhuddl` (or your preferred name)

---

## Post-Deployment

### Verify It Works

1. Visit your Netlify URL
2. Sign in with a `@jackhenry.com` Google account
3. Try signing in with a non-Jack Henry email - should be blocked ✅
4. Check that the app uses localStorage (no Firebase) ✅

### Test Migration Page

1. Visit `https://jhuddl.netlify.app/migrate`
2. Verify the migration page loads
3. Test importing a sample export file (from Step 1 of MIGRATION_GUIDE.md)

### Monitor Builds

- Build logs: https://app.netlify.com/sites/jhuddl/deploys
- Build settings: https://app.netlify.com/sites/jhuddl/settings/deploys

---

## Environment Variables (If Needed)

The Jack Henry build doesn't need environment variables because Firebase config is intentionally empty (to use localStorage).

But if you want to set them anyway:

1. Go to **Site settings** → **Environment variables**
2. Add variables from `.env.jackhenry`:
   - `VITE_ALLOWED_AUTH_EMAIL_DOMAIN` = `jackhenry.com`
   - `VITE_USE_FIRESTORE` = `false`
   - Leave all `VITE_FIREBASE_*` empty

The `netlify.toml` file already handles the build, so you likely don't need to set these.

---

## Troubleshooting

### Build Fails: "Command not found: npm"

Node version not detected. Add to `netlify.toml`:

```toml
[build.environment]
NODE_VERSION = "18"
```

(This is already in your `netlify.toml`, so shouldn't happen)

### Build Fails: "npm install" error

Check build logs for specific error. Common issues:
- Missing `package-lock.json` - commit it to Git
- Node version mismatch - verify Node 18+ in `netlify.toml`

### Site loads but shows Firebase error

This shouldn't happen in Jack Henry build. If it does:
- Verify build command is `npm run build:jackhenry` (not `npm run build`)
- Check `.env.jackhenry` has empty Firebase values
- Rebuild and deploy

### Can't sign in with Jack Henry email

Check browser console for errors. Possible causes:
- Google OAuth not configured properly
- Domain restriction not working - check `VITE_ALLOWED_AUTH_EMAIL_DOMAIN`

### Data doesn't persist after refresh

localStorage is working correctly. But:
- Data only exists in that browser/device
- Clearing browser data will erase it
- Incognito mode won't persist data

---

## Auto-Deploy on Git Push

Once you've set up Option 1 (Deploy from Git):

1. Make code changes
2. Commit and push to your Git repo
3. Netlify automatically rebuilds and deploys
4. Check build progress at https://app.netlify.com/sites/jhuddl/deploys

**Branch deploys:** Netlify can auto-deploy every branch for testing. Enable in Site settings → Build & deploy → Deploy contexts.

---

## Production Checklist

Before sharing with Jack Henry users:

- [ ] Site deployed and accessible
- [ ] Sign-in works with `@jackhenry.com` emails
- [ ] Non-Jack Henry emails are blocked
- [ ] `/migrate` page loads and works
- [ ] Data persists in localStorage after refresh
- [ ] Custom domain configured (optional)
- [ ] HTTPS enabled (automatic with Netlify)
- [ ] Ran test migration with sample export file

---

## Next Steps

1. ✅ Deploy jhuddl to Netlify (this guide)
2. Export Jack Henry data from Firebase (MIGRATION_GUIDE.md Step 1)
3. Share export file with Jack Henry users (MIGRATION_GUIDE.md Step 3)
4. Users import their data (MIGRATION_GUIDE.md Step 4)
5. Verification period (MIGRATION_GUIDE.md Step 5)
6. Clean up Firebase (MIGRATION_GUIDE.md Step 6)

---

## Support

- Netlify Docs: https://docs.netlify.com/
- Your Netlify Dashboard: https://app.netlify.com/teams/csweetwright
- Build logs: https://app.netlify.com/sites/jhuddl/deploys
