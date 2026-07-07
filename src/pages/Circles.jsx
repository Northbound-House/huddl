import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44, isFirestoreBackend } from '@/api/base44Client';
import { fetchVisibleTeams } from '@/api/accessQueries';
import { db } from '@/lib/firebase';
import { ArrowLeft, ChevronRight, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { useUserAccess } from '@/context/UserAccessContext';
import MainHeader from '@/components/MainHeader';
import { circleDetailPath } from '@/lib/orgPaths';
import { pickOrganizationIdForNewCircle } from '@/lib/pickOrganizationForNewCircle';
import { normalizeEmail } from '@/lib/email';
import CreateCircleWizard from '@/components/CreateCircleWizard';

export default function Circles() {
  const { sessionUser, isFirebaseAuth } = useAuth();
  const {
    loading: accessLoading,
    isGlobalAdmin,
    accessibleTeamIds,
    canCreateTeam,
    orgAdminOrgIds,
  } = useUserAccess();

  const [wizardOpen, setWizardOpen] = useState(false);

  const accessKey = isGlobalAdmin
    ? 'all'
    : `${accessibleTeamIds?.join(',') ?? 'none'}:${sessionUser?.uid ?? ''}`;
  const memberKey = normalizeEmail(sessionUser?.email ?? '');

  const { data: teams = [] } = useQuery({
    queryKey: ['teams', 'visible', accessKey, sessionUser?.uid ?? '', memberKey],
    queryFn: async () => {
      if (!isFirestoreBackend) {
        return base44.entities.Team.list('name');
      }
      return fetchVisibleTeams(db, {
        isGlobalAdmin,
        accessibleTeamIds: accessibleTeamIds ?? [],
        creatorUid: sessionUser?.uid ?? null,
        memberEmail: sessionUser?.email ?? null,
        memberUid: sessionUser?.uid ?? null,
      });
    },
    staleTime: 0,
    enabled:
      !accessLoading &&
      (!isFirestoreBackend || (isFirebaseAuth && !!sessionUser?.uid)),
  });

  const sortedTeams = useMemo(
    () =>
      [...teams].sort((a, b) =>
        String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base' })
      ),
    [teams]
  );

  const createOrgId = useMemo(
    () =>
      pickOrganizationIdForNewCircle({
        uid: sessionUser?.uid ?? null,
        orgAdminOrgIds,
      }),
    [sessionUser?.uid, orgAdminOrgIds]
  );

  const canCreateHere = canCreateTeam && (!isFirestoreBackend || createOrgId != null);

  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <MainHeader />
      <header className="border-b border-border/60 bg-card/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link to="/" className="p-2 rounded-xl hover:bg-muted transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Users className="w-6 h-6 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="font-heading text-xl font-bold truncate">Circles</h1>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                Circles bring people together to collaborate.
              </p>
            </div>
          </div>
          {canCreateHere && (
            <Button type="button" className="rounded-xl gap-2 shrink-0" onClick={() => setWizardOpen(true)}>
              <Plus className="w-4 h-4" aria-hidden />
              <span className="hidden sm:inline">Create Circle</span>
              <span className="sm:hidden">Create</span>
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <section>
          <h2 className="font-heading font-semibold mb-3">Your Circles</h2>
          {sortedTeams.length === 0 ? (
            <div className="text-sm text-muted-foreground rounded-2xl border border-dashed border-border/80 p-6 space-y-3">
              <p>
                {canCreateHere
                  ? 'Create your first Circle to start collaborating.'
                  : 'No Circles yet. When you’re invited to a Circle, it’ll show up here after you sign in.'}
              </p>
            </div>
          ) : (
            <ul className="rounded-2xl border border-border/60 bg-card divide-y divide-border/60 overflow-hidden">
              {sortedTeams.map((t) => (
                <li key={t.id}>
                  <Link
                    to={circleDetailPath(t.id)}
                    className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-muted/40 transition-colors"
                  >
                    <span className="font-medium text-foreground">{t.name}</span>
                    <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {canCreateHere && (
        <CreateCircleWizard open={wizardOpen} onOpenChange={setWizardOpen} sessionUser={sessionUser} />
      )}
    </div>
  );
}
