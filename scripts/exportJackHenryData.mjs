/**
 * Export Jack Henry user data from Firebase for migration to Netlify (localStorage).
 *
 * Usage:
 *   node scripts/exportJackHenryData.mjs
 *
 * Exports ALL users with @jackhenry.com emails and their associated data to:
 *   - scripts/export-jackhenry-YYYY-MM-DD.json (full export by user)
 *   - scripts/export-jackhenry-combined-YYYY-MM-DD.json (combined localStorage format)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize Firebase Admin
const serviceAccountPath = join(__dirname, '../functions/service-account.json');
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch (err) {
  console.error('❌ Could not load service account JSON from:', serviceAccountPath);
  console.error('   Download it from Firebase Console → Project settings → Service accounts');
  console.error('   Save as functions/service-account.json');
  process.exit(1);
}

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();
const auth = getAuth();

const JACK_HENRY_DOMAIN = 'jackhenry.com';

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isJackHenryEmail(email) {
  const e = normalizeEmail(email);
  return e.includes('@') && e.endsWith('@' + JACK_HENRY_DOMAIN);
}

/**
 * Get all Jack Henry users from Firebase Auth
 */
async function getJackHenryUsers() {
  const users = [];
  let nextPageToken;

  do {
    const result = await auth.listUsers(1000, nextPageToken);
    for (const user of result.users) {
      if (user.email && isJackHenryEmail(user.email)) {
        users.push({
          uid: user.uid,
          email: normalizeEmail(user.email),
          displayName: user.displayName || null,
          photoURL: user.photoURL || null,
        });
      }
    }
    nextPageToken = result.pageToken;
  } while (nextPageToken);

  return users;
}

/**
 * Export data for a collection with a query filter
 */
async function exportCollection(collectionName, queryFilter) {
  const snapshot = await queryFilter(db.collection(collectionName)).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Export all data for Jack Henry users
 */
async function exportJackHenryData() {
  console.log('🔍 Finding Jack Henry users...');
  const jackHenryUsers = await getJackHenryUsers();
  console.log(`✅ Found ${jackHenryUsers.length} Jack Henry users`);

  if (jackHenryUsers.length === 0) {
    console.log('⚠️  No Jack Henry users found. Exiting.');
    return null;
  }

  const jackHenryEmails = new Set(jackHenryUsers.map((u) => u.email));
  const jackHenryUids = new Set(jackHenryUsers.map((u) => u.uid));

  console.log('\n📦 Exporting data by user...');

  const userExports = {};

  for (const user of jackHenryUsers) {
    console.log(`  - ${user.email}`);
    userExports[user.email] = {
      user: user,
      data: {
        boards: [],
        columns: [],
        cards: [],
        teams: [],
        team_memberships: [],
        organizations: [],
        organization_memberships: [],
        retrospective_sessions: [],
        public_profiles: [],
        board_labels: [],
        product_feedback: [],
      },
    };
  }

  // Export organizations (where user is a member)
  console.log('\n📦 Exporting organizations...');
  const allOrganizations = await exportCollection('organizations', (q) => q);
  const allOrgMemberships = await exportCollection('organization_memberships', (q) => q);

  const jackHenryOrgIds = new Set();
  for (const membership of allOrgMemberships) {
    const email = normalizeEmail(membership.email);
    if (jackHenryEmails.has(email)) {
      jackHenryOrgIds.add(membership.organization_id);
      userExports[email].data.organization_memberships.push(membership);
    }
  }

  for (const org of allOrganizations) {
    if (jackHenryOrgIds.has(org.id)) {
      for (const email of jackHenryEmails) {
        const memberships = userExports[email].data.organization_memberships;
        if (memberships.some((m) => m.organization_id === org.id)) {
          userExports[email].data.organizations.push(org);
        }
      }
    }
  }

  // Export teams (in Jack Henry organizations)
  console.log('📦 Exporting teams...');
  const allTeams = await exportCollection('teams', (q) => q);
  const allTeamMemberships = await exportCollection('team_memberships', (q) => q);

  const jackHenryTeamIds = new Set();
  for (const team of allTeams) {
    if (jackHenryOrgIds.has(team.organization_id)) {
      jackHenryTeamIds.add(team.id);
      for (const email of jackHenryEmails) {
        if (userExports[email].data.organizations.some((o) => o.id === team.organization_id)) {
          userExports[email].data.teams.push(team);
        }
      }
    }
  }

  for (const membership of allTeamMemberships) {
    const email = normalizeEmail(membership.email);
    if (jackHenryEmails.has(email) && jackHenryTeamIds.has(membership.team_id)) {
      userExports[email].data.team_memberships.push(membership);
    }
  }

  // Export boards (in Jack Henry teams)
  console.log('📦 Exporting boards...');
  const allBoards = await exportCollection('boards', (q) => q);

  const jackHenryBoardIds = new Set();
  for (const board of allBoards) {
    const boardTeamIds = board.team_ids || (board.team_id ? [board.team_id] : []);
    const isJackHenryBoard = boardTeamIds.some((tid) => jackHenryTeamIds.has(tid));

    if (isJackHenryBoard) {
      jackHenryBoardIds.add(board.id);
      for (const email of jackHenryEmails) {
        const userTeams = userExports[email].data.teams;
        if (userTeams.some((t) => boardTeamIds.includes(t.id))) {
          userExports[email].data.boards.push(board);
        }
      }
    }
  }

  // Export columns (for Jack Henry boards)
  console.log('📦 Exporting board columns...');
  const allColumns = await exportCollection('board_columns', (q) => q);
  for (const column of allColumns) {
    if (jackHenryBoardIds.has(column.board_id)) {
      for (const email of jackHenryEmails) {
        if (userExports[email].data.boards.some((b) => b.id === column.board_id)) {
          userExports[email].data.columns.push(column);
        }
      }
    }
  }

  // Export cards (for Jack Henry boards)
  console.log('📦 Exporting cards...');
  const allCards = await exportCollection('cards', (q) => q);
  for (const card of allCards) {
    if (jackHenryBoardIds.has(card.board_id)) {
      for (const email of jackHenryEmails) {
        if (userExports[email].data.boards.some((b) => b.id === card.board_id)) {
          userExports[email].data.cards.push(card);
        }
      }
    }
  }

  // Export retrospective sessions
  console.log('📦 Exporting retrospective sessions...');
  const allRetroSessions = await exportCollection('retrospective_sessions', (q) => q);
  for (const session of allRetroSessions) {
    if (jackHenryBoardIds.has(session.board_id)) {
      for (const email of jackHenryEmails) {
        if (userExports[email].data.boards.some((b) => b.id === session.board_id)) {
          userExports[email].data.retrospective_sessions.push(session);
        }
      }
    }
  }

  // Export board labels
  console.log('📦 Exporting board labels...');
  const allBoardLabels = await exportCollection('board_labels', (q) => q);
  for (const label of allBoardLabels) {
    if (jackHenryBoardIds.has(label.board_id)) {
      for (const email of jackHenryEmails) {
        if (userExports[email].data.boards.some((b) => b.id === label.board_id)) {
          userExports[email].data.board_labels.push(label);
        }
      }
    }
  }

  // Export public profiles (Jack Henry users only)
  console.log('📦 Exporting public profiles...');
  const allProfiles = await exportCollection('public_profiles', (q) => q);
  for (const profile of allProfiles) {
    const email = normalizeEmail(profile.email || profile.id);
    if (jackHenryEmails.has(email)) {
      userExports[email].data.public_profiles.push(profile);
    }
  }

  // Export product feedback
  console.log('📦 Exporting product feedback...');
  const allFeedback = await exportCollection('product_feedback', (q) => q);
  for (const feedback of allFeedback) {
    const email = normalizeEmail(feedback.submitter_email);
    if (jackHenryEmails.has(email)) {
      userExports[email].data.product_feedback.push(feedback);
    }
  }

  return userExports;
}

/**
 * Combine all user exports into a single localStorage-compatible format
 */
function combinedExport(userExports) {
  const combined = {
    boards: [],
    columns: [],
    cards: [],
    teams: [],
    team_memberships: [],
    organizations: [],
    organization_memberships: [],
    retrospective_sessions: [],
    public_profiles: [],
    board_labels: [],
    product_feedback: [],
  };

  // Use Sets to deduplicate by ID
  const seenIds = {};
  for (const key of Object.keys(combined)) {
    seenIds[key] = new Set();
  }

  for (const userEmail in userExports) {
    const userData = userExports[userEmail].data;
    for (const key of Object.keys(combined)) {
      for (const item of userData[key]) {
        if (!seenIds[key].has(item.id)) {
          combined[key].push(item);
          seenIds[key].add(item.id);
        }
      }
    }
  }

  return combined;
}

// Main execution
async function main() {
  try {
    const exports = await exportJackHenryData();

    if (!exports) {
      process.exit(0);
    }

    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Write per-user export
    const perUserFile = join(__dirname, `export-jackhenry-${timestamp}.json`);
    writeFileSync(perUserFile, JSON.stringify(exports, null, 2));
    console.log(`\n✅ Exported by user to: ${perUserFile}`);

    // Write combined export (localStorage format)
    const combined = combinedExport(exports);
    const combinedFile = join(__dirname, `export-jackhenry-combined-${timestamp}.json`);
    writeFileSync(combinedFile, JSON.stringify(combined, null, 2));
    console.log(`✅ Exported combined to: ${combinedFile}`);

    // Stats
    console.log('\n📊 Export Stats:');
    console.log(`   Users: ${Object.keys(exports).length}`);
    console.log(`   Organizations: ${combined.organizations.length}`);
    console.log(`   Teams: ${combined.teams.length}`);
    console.log(`   Boards: ${combined.boards.length}`);
    console.log(`   Cards: ${combined.cards.length}`);
    console.log(`   Retrospective Sessions: ${combined.retrospective_sessions.length}`);
    console.log(`   Labels: ${combined.board_labels.length}`);
    console.log(`   Public Profiles: ${combined.public_profiles.length}`);
    console.log(`   Product Feedback: ${combined.product_feedback.length}`);

    console.log('\n✅ Export complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Download the combined JSON file');
    console.log('   2. Share it with Jack Henry users to import into Netlify deployment');
    console.log('   3. Users will visit /migrate on Netlify to import their data');
  } catch (error) {
    console.error('❌ Export failed:', error);
    process.exit(1);
  }
}

main();
