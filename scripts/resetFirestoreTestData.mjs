#!/usr/bin/env node
/**
 * Full Firestore (default database) reset: deletes every document in every *root* collection.
 *
 * Does NOT touch:
 *   - Firebase Authentication (users / providers)
 *   - Cloud Storage, Realtime Database, Remote Config, etc.
 *
 * This app keeps all data in top-level collections. If you later add subcollections under a doc,
 * extend this script to use recursive deletes for those paths.
 *
 * Credentials (one of):
 *   export GOOGLE_APPLICATION_CREDENTIALS="$HOME/Downloads/your-project-firebase-adminsdk-xxxxx.json"
 *   (path must be real — not a placeholder)
 *   OR: unset GOOGLE_APPLICATION_CREDENTIALS && gcloud auth application-default login
 *
 * Usage:
 *   npm run reset:firestore -- --dry-run
 *   npm run reset:firestore -- --yes
 */

import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DEFAULT_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'huddle-ab42f';

/** Stops at `#` so accidental `npm run … -- --dry-run # comment` tokens do not break flags. */
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
        'GOOGLE_APPLICATION_CREDENTIALS points to a file that does not exist:\n' +
          `  ${credPath}\n\n` +
          'Use the real path to the service account JSON you downloaded from the Firebase Console:\n' +
          '  Project settings (gear) → Service accounts → Generate new private key.\n\n' +
          'Or use Application Default Credentials instead:\n' +
          '  unset GOOGLE_APPLICATION_CREDENTIALS\n' +
          '  gcloud auth application-default login\n'
      );
      if (/path\/to|absolute\/path/i.test(credPath)) {
        console.error(
          '(That path still looks like documentation placeholder text — replace it with your actual JSON file.)\n'
        );
      }
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

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} collectionId
 * @param {number} batchSize
 */
async function deleteCollectionInBatches(db, collectionId, batchSize = 400) {
  const colRef = db.collection(collectionId);
  const query = colRef.limit(batchSize);
  let total = 0;
  for (;;) {
    const snapshot = await query.get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    total += snapshot.size;
    if (snapshot.size < batchSize) break;
  }
  return total;
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

async function main() {
  const argv = scriptArgv();
  const skipConfirm = argv.includes('--yes') || argv.includes('-y');
  const dryRun = argv.includes('--dry-run');

  initAdmin();
  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });

  const refs = await db.listCollections();
  const names = refs.map((r) => r.id).sort();

  console.error(`Project: ${resolvedProjectId} (default Firestore database)`);
  console.error(`Root collections found (${names.length}): ${names.join(', ') || '(none)'}\n`);

  if (dryRun) {
    console.error('Dry run only — no data deleted.');
    process.exit(0);
  }

  console.error('This will DELETE ALL DOCUMENTS in every root collection listed above.');
  console.error('Firebase Auth users are NOT deleted.\n');

  if (!skipConfirm) {
    const line = await ask('Type DELETE to proceed: ');
    if (line !== 'DELETE') {
      console.error('Aborted.');
      process.exit(1);
    }
  }

  for (const name of names) {
    process.stderr.write(`Deleting ${name}… `);
    const n = await deleteCollectionInBatches(db, name);
    console.error(`${n} doc(s)`);
  }

  console.error('\nDone. Firestore default DB has no root documents left (empty collections may still appear in the console until refresh).');
  console.error('Open the app; personal orgs / config will be recreated on demand if your code does that.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
