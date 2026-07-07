import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from '@/lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { UserAccessProvider } from '@/context/UserAccessContext';
import {
  TeamsIndexRedirect,
  LegacyTeamDetailRedirect,
  LegacyOrgTeamDetailRedirect,
} from '@/components/TeamRoutesRedirect';
import { isFirebaseConfigured } from '@/lib/firebase';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import MissingFirebaseConfig from '@/components/MissingFirebaseConfig';
import Home from '@/pages/Home';
import Board from '@/pages/Board';
import BoardSettings from '@/pages/BoardSettings';
import Circles from '@/pages/Circles';
import TeamDetail from '@/pages/TeamDetail';
import SignIn from '@/pages/SignIn';
import Profile from '@/pages/Profile';
import WelcomeOnboarding from '@/components/WelcomeOnboarding';
import ArchiveThemeDock from '@/components/ArchiveThemeDock';
import ArchivedHuddlBoards from '@/pages/ArchivedHuddlBoards';
import FeedbackLog from '@/pages/FeedbackLog';
import { MigratePage } from '@/pages/MigratePage';
import ProfileFirstLoginPrompt from '@/components/ProfileFirstLoginPrompt';
import BuildVersionBadge from '@/components/BuildVersionBadge';
import { ThemeProvider } from '@/context/ThemeContext';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, needsSignIn } = useAuth();

  // Only show Firebase config error if Firebase is expected (not in Jack Henry mode)
  const useFirestore = import.meta.env.VITE_USE_FIRESTORE;
  const firestoreDisabled = useFirestore === 'false' || useFirestore === false;

  if (import.meta.env.PROD && !isFirebaseConfigured() && !firestoreDisabled) {
    return <MissingFirebaseConfig />;
  }

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (needsSignIn) {
    return <SignIn />;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/board/:id/settings" element={<BoardSettings />} />
        <Route path="/board/:id" element={<Board />} />
        <Route path="/circles" element={<Circles />} />
        <Route path="/circles/:teamId" element={<TeamDetail />} />
        <Route path="/teams" element={<TeamsIndexRedirect />} />
        <Route path="/teams/:teamId" element={<LegacyTeamDetailRedirect />} />
        <Route path="/orgs/:orgId/teams/:teamId" element={<LegacyOrgTeamDetailRedirect />} />
        <Route path="/orgs/:orgId/teams" element={<Navigate to="/circles" replace />} />
        <Route path="/orgs/:orgId" element={<Navigate to="/circles" replace />} />
        <Route path="/orgs" element={<Navigate to="/circles" replace />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/archived" element={<ArchivedHuddlBoards />} />
        <Route path="/feedback-log" element={<FeedbackLog />} />
        <Route path="/migrate" element={<MigratePage />} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
      <WelcomeOnboarding />
      <ProfileFirstLoginPrompt />
      <ArchiveThemeDock />
    </>
  );
};

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <UserAccessProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <AuthenticatedApp />
            </Router>
            <BuildVersionBadge />
            <Toaster />
          </QueryClientProvider>
        </UserAccessProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
