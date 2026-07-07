/**
 * Clean up Jack Henry user data from Firebase after successful migration to Netlify.
 *
 * ⚠️  DANGER: This script PERMANENTLY DELETES all Jack Henry data from Firebase.
 * Only run this AFTER you've verified the Netlify migration is successful.
 *
 * Usage:
 *   node scripts/cleanupJackHenryData.mjs [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be deleted without actually deleting
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DRY_RUN = process.argv.includes('--dry-run');

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
        });
      }
    }
    nextPageToken = result.pageToken;
  } while (nextPageToken);

  return users;
}

/**
 * Delete documents in batches
 */
async function batchDelete(collectionName, docs, reason) {
  if (docs.length === 0) {
    console.log(`   ⏭️  Skipping ${collectionName} - nothing to delete`);
    return;
  }

  console.log(`   🗑️  ${collectionName}: ${docs.length} documents (${reason})`);

  if (DRY_RUN) {
    console.log(`      [DRY RUN] Would delete ${docs.length} documents`);
    return;
  }

  const batchSize = 500;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + batchSize);

    for (const doc of chunk) {
      batch.delete(db.collection(collectionName).doc(doc.id));
    }

    await batch.commit();
    console.log(`      ✓ Deleted ${Math.min(i + batchSize, docs.length)}/${docs.length}`);
  }
}

/**
 * Delete users from Firebase Auth
 */
async function deleteUsers(users) {
  if (users.length === 0) {
    console.log('   ⏭️  Skipping user deletion - no users to delete');
    return;
  }

  console.log(`   👤 Firebase Auth: ${users.length} users`);

  if (DRY_RUN) {
    console.log(`      [DRY RUN] Would delete ${users.length} users`);
    return;
  }

  const batchSize = 1000;
  for (let i = 0; i < users.length; i += batchSize) {
    const chunk = users.slice(i, i + batchSize);
    const uids = chunk.map((u) => u.uid);

    const result = await auth.deleteUsers(uids);
    const successCount = uids.length - result.failureCount;

    console.log(`      ✓ Deleted ${successCount}/${uids.length} users`);

    if (result.errors.length > 0) {
      console.error(`      ⚠️  ${result.errors.length} errors:`);
      for (const err of result.errors.slice(0, 5)) {
        console.error(`         - ${err.error.message}`);
      }
    }
  }
}

/**
 * Clean up all Jack Henry data from Firebase
 */
async function cleanupJackHenryData() {
  console.log('🔍 Finding Jack Henry data...\n');

  const jackHenryUsers = await getJackHenryUsers();
  console.log(`✅ Found ${jackHenryUsers.length} Jack Henry users\n`);

  if (jackHenryUsers.length === 0) {
    console.log('⚠️  No Jack Henry users found. Nothing to clean up.');
    return;
  }

  const jackHenryEmails = new Set(jackHenryUsers.map((u) => u.email));
  const jackHenryUids = new Set(jackHenryUsers.map((u) => u.uid));

  // Find all Jack Henry organization memberships
  console.log('📦 Finding Jack Henry organizations...');
  const allOrgMemberships = await db.collection('organization_memberships').get();
  const jackHenryOrgIds = new Set();
  const orgMembershipsToDelete = [];

  for (const doc of allOrgMemberships.docs) {
    const data = doc.data();
    const email = normalizeEmail(data.email);
    if (jackHenryEmails.has(email)) {
      jackHenryOrgIds.add(data.organization_id);
      orgMembershipsToDelete.push({ id: doc.id, ...data });
    }
  }

  console.log(`   Found ${jackHenryOrgIds.size} Jack Henry organizations\n`);

  // Find teams in Jack Henry organizations
  console.log('📦 Finding Jack Henry teams...');
  const jackHenryTeamIds = new Set();
  const teamsToDelete = [];

  if (jackHenryOrgIds.size > 0) {
    const teamsSnapshot = await db.collection('teams').get();
    for (const doc of teamsSnapshot.docs) {
      const data = doc.data();
      if (jackHenryOrgIds.has(data.organization_id)) {
        jackHenryTeamIds.add(doc.id);
        teamsToDelete.push({ id: doc.id, ...data });
      }
    }
  }

  console.log(`   Found ${jackHenryTeamIds.size} Jack Henry teams\n`);

  // Find boards in Jack Henry teams
  console.log('📦 Finding Jack Henry boards...');
  const jackHenryBoardIds = new Set();
  const boardsToDelete = [];

  if (jackHenryTeamIds.size > 0) {
    const boardsSnapshot = await db.collection('boards').get();
    for (const doc of boardsSnapshot.docs) {
      const data = doc.data();
      const boardTeamIds = data.team_ids || (data.team_id ? [data.team_id] : []);
      const isJackHenryBoard = boardTeamIds.some((tid) => jackHenryTeamIds.has(tid));

      if (isJackHenryBoard) {
        jackHenryBoardIds.add(doc.id);
        boardsToDelete.push({ id: doc.id, ...data });
      }
    }
  }

  console.log(`   Found ${jackHenryBoardIds.size} Jack Henry boards\n`);

  // Collect all related data to delete
  const columnsToDelete = [];
  const cardsToDelete = [];
  const retroSessionsToDelete = [];
  const labelsToDelete = [];
  const teamMembershipsToDelete = [];
  const organizationsToDelete = [];
  const publicProfilesToDelete = [];
  const productFeedbackToDelete = [];

  if (jackHenryBoardIds.size > 0) {
    console.log('📦 Finding related board data...');

    const [columns, cards, retros, labels] = await Promise.all([
      db.collection('board_columns').get(),
      db.collection('cards').get(),
      db.collection('retrospective_sessions').get(),
      db.collection('board_labels').get(),
    ]);

    for (const doc of columns.docs) {
      if (jackHenryBoardIds.has(doc.data().board_id)) {
        columnsToDelete.push({ id: doc.id, ...doc.data() });
      }
    }

    for (const doc of cards.docs) {
      if (jackHenryBoardIds.has(doc.data().board_id)) {
        cardsToDelete.push({ id: doc.id, ...doc.data() });
      }
    }

    for (const doc of retros.docs) {
      if (jackHenryBoardIds.has(doc.data().board_id)) {
        retroSessionsToDelete.push({ id: doc.id, ...doc.data() });
      }
    }

    for (const doc of labels.docs) {
      if (jackHenryBoardIds.has(doc.data().board_id)) {
        labelsToDelete.push({ id: doc.id, ...doc.data() });
      }
    }
  }

  if (jackHenryTeamIds.size > 0) {
    const teamMemberships = await db.collection('team_memberships').get();
    for (const doc of teamMemberships.docs) {
      if (jackHenryTeamIds.has(doc.data().team_id)) {
        teamMembershipsToDelete.push({ id: doc.id, ...doc.data() });
      }
    }
  }

  if (jackHenryOrgIds.size > 0) {
    const orgs = await db.collection('organizations').get();
    for (const doc of orgs.docs) {
      if (jackHenryOrgIds.has(doc.id)) {
        organizationsToDelete.push({ id: doc.id, ...doc.data() });
      }
    }
  }

  const [profiles, feedback] = await Promise.all([
    db.collection('public_profiles').get(),
    db.collection('product_feedback').get(),
  ]);

  for (const doc of profiles.docs) {
    const email = normalizeEmail(doc.data().email || doc.id);
    if (jackHenryEmails.has(email)) {
      publicProfilesToDelete.push({ id: doc.id, ...doc.data() });
    }
  }

  for (const doc of feedback.docs) {
    const email = normalizeEmail(doc.data().submitter_email);
    if (jackHenryEmails.has(email)) {
      productFeedbackToDelete.push({ id: doc.id, ...doc.data() });
    }
  }

  // Show summary
  console.log('\n📊 Cleanup Summary:');
  console.log(`   Users: ${jackHenryUsers.length}`);
  console.log(`   Organizations: ${organizationsToDelete.length}`);
  console.log(`   Organization Memberships: ${orgMembershipsToDelete.length}`);
  console.log(`   Teams: ${teamsToDelete.length}`);
  console.log(`   Team Memberships: ${teamMembershipsToDelete.length}`);
  console.log(`   Boards: ${boardsToDelete.length}`);
  console.log(`   Columns: ${columnsToDelete.length}`);
  console.log(`   Cards: ${cardsToDelete.length}`);
  console.log(`   Retrospective Sessions: ${retroSessionsToDelete.length}`);
  console.log(`   Labels: ${labelsToDelete.length}`);
  console.log(`   Public Profiles: ${publicProfilesToDelete.length}`);
  console.log(`   Product Feedback: ${productFeedbackToDelete.length}`);

  console.log('\n' + (DRY_RUN ? '🧪 DRY RUN - No data will be deleted\n' : '⚠️  DELETING DATA...\n'));

  // Confirm deletion (unless dry run)
  if (!DRY_RUN) {
    const totalDocs =
      organizationsToDelete.length +
      orgMembershipsToDelete.length +
      teamsToDelete.length +
      teamMembershipsToDelete.length +
      boardsToDelete.length +
      columnsToDelete.length +
      cardsToDelete.length +
      retroSessionsToDelete.length +
      labelsToDelete.length +
      publicProfilesToDelete.length +
      productFeedbackToDelete.length;

    console.log(`⚠️  WARNING: About to delete ${totalDocs} documents and ${jackHenryUsers.length} users!`);
    console.log('   This action CANNOT be undone.');
    console.log('   Press Ctrl+C to cancel or wait 10 seconds to continue...\n');

    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  // Delete in correct order (children before parents)
  console.log('🗑️  Deleting data...\n');

  await batchDelete('product_feedback', productFeedbackToDelete, 'Jack Henry user feedback');
  await batchDelete('public_profiles', publicProfilesToDelete, 'Jack Henry user profiles');
  await batchDelete('board_labels', labelsToDelete, 'labels on Jack Henry boards');
  await batchDelete('cards', cardsToDelete, 'cards on Jack Henry boards');
  await batchDelete('retrospective_sessions', retroSessionsToDelete, 'retrospective sessions on Jack Henry boards');
  await batchDelete('board_columns', columnsToDelete, 'columns on Jack Henry boards');
  await batchDelete('boards', boardsToDelete, 'Jack Henry boards');
  await batchDelete('team_memberships', teamMembershipsToDelete, 'Jack Henry team memberships');
  await batchDelete('teams', teamsToDelete, 'Jack Henry teams');
  await batchDelete('organization_memberships', orgMembershipsToDelete, 'Jack Henry org memberships');
  await batchDelete('organizations', organizationsToDelete, 'Jack Henry organizations');

  // Delete users last
  await deleteUsers(jackHenryUsers);

  console.log('\n✅ Cleanup complete!');

  if (DRY_RUN) {
    console.log('\n💡 This was a dry run. To actually delete data, run:');
    console.log('   node scripts/cleanupJackHenryData.mjs');
  }
}

// Main execution
async function main() {
  try {
    await cleanupJackHenryData();
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

main();
