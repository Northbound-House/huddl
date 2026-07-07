import { UsersRound } from 'lucide-react';

/**
 * Shown in production when VITE_FIREBASE_* vars were not set at build time.
 * Without them the app cannot enforce sign-in or use Firestore.
 */
export default function MissingFirebaseConfig() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-center">
      <div className="p-3 rounded-2xl bg-gradient-to-br from-primary to-accent text-white mb-4">
        <UsersRound className="w-10 h-10" />
      </div>
      <h1 className="font-heading text-xl font-bold text-foreground max-w-md">Huddl — configuration required</h1>
      <p className="text-sm text-muted-foreground mt-2 max-w-md leading-relaxed">
        This deployment is missing Firebase environment variables. Set{' '}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">VITE_FIREBASE_*</code> in your Firebase Hosting build
        (or CI secrets), rebuild, and redeploy so sign-in and data work securely.
      </p>
    </div>
  );
}
