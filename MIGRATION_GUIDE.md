# Jack Henry Migration Guide

This guide walks you through migrating Jack Henry users from Firebase to Netlify (localStorage).

---

## Overview

**From:** Firebase (jhuddl on Firebase)  
**To:** Netlify (jhuddl on Netlify with localStorage)

**Why:** Netlify deployment requires no Firebase setup, uses browser localStorage only, and is completely free.

---

## Step 1: Export Jack Henry Data from Firebase

Run the export script to extract all Jack Henry user data from Firebase.

### Prerequisites

1. Download Firebase service account key:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project (`huddle-ab42f`)
   - Project settings → Service accounts
   - Click "Generate new private key"
   - Save as `functions/service-account.json`

2. Install dependencies:
   ```bash
   cd functions
   npm install
   cd ..
   ```

### Run Export

```bash
node scripts/exportJackHenryData.mjs
```

This creates two files in `scripts/`:
- `export-jackhenry-YYYY-MM-DD.json` - Per-user export (for reference)
- `export-jackhenry-combined-YYYY-MM-DD.json` - **This is the file users will import**

### What Gets Exported

- All users with `@jackhenry.com` emails
- Organizations, teams, and memberships
- Boards, columns, and cards
- Retrospective sessions
- Board labels
- Public profiles
- Product feedback

---

## Step 2: Deploy jhuddl to Netlify

### First Time Setup

1. **Build the Jack Henry version:**
   ```bash
   npm run build:jackhenry
   ```

2. **Go to [Netlify](https://app.netlify.com/teams/csweetwright/sites):**
   - Click "Add new site" → "Import an existing project"
   - Connect to your Git repository
   - Select this repository

3. **Build settings** (auto-detected from `netlify.toml`):
   - Build command: `npm run build:jackhenry`
   - Publish directory: `dist`
   - Site name: `jhuddl` (or your preferred name)

4. **Deploy!**
   - Netlify will auto-deploy on every git push
   - You'll get a URL like `jhuddl.netlify.app`

5. **Optional: Add custom domain:**
   - In Netlify: Site settings → Domain management
   - Add domain like `jhuddl.yourdomain.com`

### Manual Deployment (Alternative)

```bash
npm run build:jackhenry
# Drag and drop dist/ to Netlify dashboard
```

---

## Step 3: Distribute Export File to Jack Henry Users

Share the combined export file with all Jack Henry users who need their data migrated.

### Distribution Options

**Option A: Direct Download**
- Host the file on a secure internal file share
- Send download link to users via email/Slack

**Option B: Email**
- Email the JSON file directly (if small enough)

**Important:** This file contains all Jack Henry org/team/board data, so treat it as internal-only.

---

## Step 4: Users Import Their Data

Each Jack Henry user needs to import their data on their own device(s).

### Import Instructions (for users)

1. **Open jhuddl on Netlify:**
   - Go to `https://jhuddl.netlify.app` (or your custom domain)
   - Sign in with your `@jackhenry.com` Google account

2. **Navigate to migration page:**
   - Visit `https://jhuddl.netlify.app/migrate`
   - Or click the migration link if provided

3. **Import the export file:**
   - Click "Choose File"
   - Select `export-jackhenry-combined-YYYY-MM-DD.json`
   - Wait for import to complete
   - Click "Go to Dashboard"

4. **Verify your data:**
   - Check that all boards, teams, and cards are present
   - Test creating/editing cards
   - **Important:** If you use multiple devices (work laptop + home computer), repeat this import on each device

### Important Notes for Users

- **Data is stored locally in your browser only** - no cloud backup
- **Each device needs its own import** - data doesn't sync between devices
- **Clearing browser data will erase everything** - export backups regularly
- **To export backup:** Visit `/migrate` → "Export Data" button

---

## Step 5: Verification Period

Give users time to verify the migration worked before cleaning up Firebase.

**Recommended timeline:**
- Week 1: Deploy Netlify, distribute export, users import
- Week 2-3: Users verify everything works, report issues
- Week 4: If no issues, clean up Firebase (Step 6)

### User Verification Checklist

Ask users to verify:
- [ ] Can sign in to jhuddl on Netlify
- [ ] All boards are present
- [ ] All cards are present
- [ ] Can create new cards
- [ ] Can edit existing cards
- [ ] Can drag and drop cards
- [ ] Retrospective sessions are present
- [ ] Team/organization memberships are correct

---

## Step 6: Clean Up Jack Henry Data from Firebase

**⚠️  DANGER:** Only proceed after ALL users have verified their migration.

### Dry Run First (Recommended)

See what would be deleted without actually deleting:

```bash
node scripts/cleanupJackHenryData.mjs --dry-run
```

This shows:
- Number of users to delete
- Number of documents to delete per collection
- No actual deletion happens

### Actual Cleanup

**⚠️  WARNING:** This PERMANENTLY DELETES all Jack Henry data from Firebase. Cannot be undone!

```bash
node scripts/cleanupJackHenryData.mjs
```

The script will:
1. Find all `@jackhenry.com` users
2. Find all their organizations, teams, boards, cards, etc.
3. Show a summary and wait 10 seconds
4. Delete everything

### What Gets Deleted

- All Firebase Auth users with `@jackhenry.com` emails
- All organizations owned by Jack Henry users
- All teams in those organizations
- All boards in those teams
- All cards, columns, retrospective sessions, labels on those boards
- All organization/team memberships for Jack Henry users
- All public profiles for Jack Henry users
- All product feedback from Jack Henry users

---

## Step 7: Update Firebase Rules (Optional)

After cleanup, you can update Firestore rules to prevent Jack Henry domain signups in the future.

This ensures Firebase is only for the public deployment.

---

## Rollback Plan

If something goes wrong BEFORE cleanup (Step 6):

1. **Users still have access to Firebase data** - they can continue using the old deployment
2. **Netlify deployment is separate** - doesn't affect Firebase
3. **Export file is a backup** - users can re-import if needed

If you need to roll back AFTER cleanup (Step 6):

1. **Export files are your backup** - you saved them in Step 1
2. **Users can re-import** - visit `/migrate` on Netlify again
3. **Firebase data is gone** - cannot be recovered (unless you have Firebase backups enabled)

---

## FAQ

**Q: Do users need to do anything special to sign in on Netlify?**  
A: No, they sign in with the same Google account (`@jackhenry.com` email) using "Sign in with Google"

**Q: Will data sync between devices?**  
A: No, localStorage is per-device. Users must import on each device they use.

**Q: What happens if a user clears their browser data?**  
A: They lose all their data. They'll need to re-import the export file or use a backup.

**Q: Can users export backups?**  
A: Yes! Visit `/migrate` and click "Export Data" to download a JSON backup.

**Q: What if a user has data on both Firebase and Netlify?**  
A: They're separate. Netlify import will replace any existing localStorage data.

**Q: Can we migrate back to Firebase later?**  
A: Not easily. The export is one-way. If you clean up Firebase (Step 6), that data is gone.

**Q: What about new Jack Henry users after migration?**  
A: They'll start fresh on Netlify with no data. They won't have access to the old Firebase data.

**Q: Can I test this without affecting production?**  
A: Yes! Deploy to a different Netlify site first (like `jhuddl-staging.netlify.app`) and test with a small group.

---

## Troubleshooting

**Export script fails: "Could not load service account JSON"**  
→ Download service account key from Firebase Console and save as `functions/service-account.json`

**Import fails: "Invalid export file"**  
→ Make sure you're using the `-combined-` file, not the per-user file

**User can't sign in on Netlify**  
→ Verify they're using an `@jackhenry.com` email address. Other domains are blocked.

**Data missing after import**  
→ Check browser console for errors. Try exporting from `/migrate` to see what's in localStorage.

**Netlify build fails**  
→ Check build logs. Make sure Node 18+ is configured in `netlify.toml`.

---

## Timeline Example

**Week 1:**
- Day 1: Run export script
- Day 2: Deploy to Netlify
- Day 3: Send instructions to users
- Days 4-7: Users import and report issues

**Week 2-3:**
- Users verify everything works
- Fix any issues
- Collect feedback

**Week 4:**
- Run cleanup dry-run to see what will be deleted
- Final confirmation from users
- Run actual cleanup script
- Firebase now only has public (non-Jack Henry) data

---

## Support

If users encounter issues during migration:
1. Check this guide first
2. Try export → re-import cycle
3. Check browser console for errors
4. Contact the deployment admin with specific error messages
