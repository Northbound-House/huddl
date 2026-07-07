#!/usr/bin/env node
/**
 * Deletes retrospective_sessions that have no cards (no card with matching session_id).
 *
 * Credentials (same as reset:firestore):
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"
 *   OR: gcloud auth application-default login
 *
 * If `gcloud auth application-default login` fails or you see PERMISSION_DENIED:
 *   - On the Google consent page you must allow **all** requested access (incl. cloud-platform).
 *   - Or revoke and retry with an explicit scope:
 *       gcloud auth application-default revoke
 *       gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform
 *   - Or use a **service account** JSON (recommended): Firebase Console → Project settings →
 *     Service accounts → Generate new private key, then set GOOGLE_APPLICATION_CREDENTIALS.
 *   - Your Google account must be a member of the GCP project with Firestore access
 *     (e.g. Owner, Editor, or roles/datastore.user).
 *
 * Usage (run each line separately; do not paste comment lines that start with #):
 *   npm run cleanup:empty-retro-sessions -- --dry-run
 *   npm run cleanup:empty-retro-sessions -- --yes
 *
 * Flags:
 *   --dry-run       List sessions that would be deleted; no writes.
 *   --only-closed   Only sessions with closed_at (safer if you want to keep open empty drafts).
 */

import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DEFAULT_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'huddle-ab42f';

function scriptArgv() {
  const out = [];
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('#')) break;
    out.push(a);
  }
  return out;
}

let resolvedProjectId = DEFAULT_PROJECT_ID;

function initAdmin() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    if (!existsSync(credPath)) {
      console.error(
        'GOOGLE_APPLICATION_CREDENTIALS points to a missing file.\n' +
          'See scripts/resetFirestoreTestData.mjs header for setup.\n'
      );
      process.exit(1);
    }
    const json = JSON.parse(readFileSync(credPath, 'utf8'));
    resolvedProjectId = process.env.FIREBASE_PROJECT_ID || json.project_id || DEFAULT_PROJECT_ID;
    initializeApp({ credential: cert(json), projectId: resolvedProjectId });
  } else {
    resolvedProjectId = process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
    initializeApp({ credential: applicationDefault(), projectId: resolvedProjectId });
  }
}

function ask(question) {
  const rl = createInterface({ input, output });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Distinct retrospective session ids that have at least one card (single collection scan).
 * @param {import('firebase-admin/firestore').Firestore} db
 */
async function sessionIdsWithCards(db) {
  const snap = await db.collection('cards').select('session_id').get();
  const ids = new Set();
  for (const d of snap.docs) {
    const sid = d.data().session_id;
    if (typeof sid === 'string' && sid.length) ids.add(sid);
  }
  return ids;
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string[]} ids
 */
async function deleteSessionsInBatches(db, ids) {
  const chunk = 450;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const batch = db.batch();
    for (const id of slice) {
      batch.delete(db.collection('retrospective_sessions').doc(id));
    }
    await batch.commit();
  }
}

async function main() {
  const argv = scriptArgv();
  const dryRun = argv.includes('--dry-run');
  const skipConfirm = argv.includes('--yes') || argv.includes('-y');
  const onlyClosed = argv.includes('--only-closed');

  initAdmin();
  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });

  console.error(`Project: ${resolvedProjectId}`);
  console.error(`Mode: ${onlyClosed ? 'only sessions with closed_at' : 'all empty sessions'}\n`);

  console.error('Loading session ids referenced by cards…');
  const withCards = await sessionIdsWithCards(db);

  const sessionsSnap = await db.collection('retrospective_sessions').get();
  const toDelete = [];

  for (const doc of sessionsSnap.docs) {
    const row = doc.data();
    if (onlyClosed && !row.closed_at) continue;
    if (withCards.has(doc.id)) continue;

    toDelete.push({
      id: doc.id,
      board_id: row.board_id,
      session_date: row.session_date,
      closed_at: row.closed_at ?? null,
    });
  }

  console.error(`Cards scanned: ${withCards.size} session id(s) with ≥1 card.`);
  console.error(`Retrospective sessions scanned: ${sessionsSnap.size}.`);
  console.error(`Empty (no cards): ${toDelete.length}\n`);

  if (toDelete.length === 0) {
    process.exit(0);
  }

  for (const s of toDelete) {
    console.log(
      `${s.id}  board=${s.board_id}  date=${s.session_date}  closed=${s.closed_at ? 'yes' : 'no'}`
    );
  }

  if (dryRun) {
    console.error('\nDry run — no documents deleted.');
    process.exit(0);
  }

  console.error('\nThis will DELETE those retrospective_sessions documents.');
  if (!skipConfirm) {
    const line = await ask('Type DELETE to proceed: ');
    if (line !== 'DELETE') {
      console.error('Aborted.');
      process.exit(1);
    }
  }

  await deleteSessionsInBatches(
    db,
    toDelete.map((s) => s.id)
  );
  console.error(`\nDeleted ${toDelete.length} empty session(s).`);
}

function printPermissionHelp() {
  console.error('\n--- Firestore PERMISSION_DENIED ---');
  console.error('This script needs credentials that can read/write Firestore on the target project.');
  console.error('');
  console.error('Option A — Service account (most reliable):');
  console.error('  Firebase Console → Project settings → Service accounts → Generate new private key');
  console.error('  export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/your-key.json"');
  console.error('');
  console.error('Option B — Application Default Credentials (user login):');
  console.error('  gcloud auth application-default revoke');
  console.error(
    '  gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform'
  );
  console.error('  Complete the browser flow and accept every permission requested.');
  console.error('');
  console.error('Also ensure your account has access to GCP project:', DEFAULT_PROJECT_ID);
}

main().catch((e) => {
  const denied =
    e?.code === 7 ||
    String(e?.message || e?.details || '').includes('PERMISSION_DENIED');
  console.error(e);
  if (denied) printPermissionHelp();
  process.exit(1);
});
