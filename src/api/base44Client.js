import { db, isFirebaseConfigured } from '@/lib/firebase';
import { createFirestoreBase44 } from '@/api/firestoreDataClient';
import { localBase44 } from '@/api/localDataClient';

/**
 * Data layer: Firestore when Firebase is configured and VITE_USE_FIRESTORE is not "false".
 * Otherwise localStorage (offline / dev without env).
 */
export const isFirestoreBackend =
  import.meta.env.VITE_USE_FIRESTORE !== 'false' && isFirebaseConfigured() && db != null;

export const base44 = isFirestoreBackend ? createFirestoreBase44(db) : localBase44;
