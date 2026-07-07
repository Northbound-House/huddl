import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, LayoutGrid, Sparkles, UsersRound } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { useUserAccess } from '@/context/UserAccessContext';
import {
  needsProfilePromptAttention,
  readProfilePromptComplete,
} from '@/lib/profilePrompt';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'huddl.welcome.completed.v1';
const LEGACY_WELCOME_KEY = 'huddle.welcome.completed.v1';

function readStoredUid() {
  try {
    let v = localStorage.getItem(STORAGE_KEY);
    if (!v) {
      v = localStorage.getItem(LEGACY_WELCOME_KEY);
      if (v) {
        localStorage.setItem(STORAGE_KEY, v);
        localStorage.removeItem(LEGACY_WELCOME_KEY);
      }
    }
    return v;
  } catch {
    return null;
  }
}

function writeStoredUid(uid) {
  try {
    localStorage.setItem(STORAGE_KEY, uid);
  } catch {
    /* ignore */
  }
}

const STEP_LABELS = ['Welcome', 'Circles', 'Huddl Boards', 'Done'];

export default function WelcomeOnboarding() {
  const { sessionUser, isFirebaseAuth, firebaseUser } = useAuth();
  const {
    loading: accessLoading,
    memberships,
    canCreateTeam,
    accessibleTeamIds,
  } = useUserAccess();
  const navigate = useNavigate();
  const uid = sessionUser?.uid ?? null;

  const [step, setStep] = useState(0);
  const [storageTick, setStorageTick] = useState(0);
  const [profileGateTick, setProfileGateTick] = useState(0);
  /** If true, completing or closing the dialog marks welcome done for this user (default: skip in future). */
  const [dontShowAgain, setDontShowAgain] = useState(true);
  /** Hides the welcome for this app session when the user opts out of "don't show again" (no localStorage write). */
  const [dismissedWithoutRemember, setDismissedWithoutRemember] = useState(false);

  useEffect(() => {
    const bump = () => setProfileGateTick((t) => t + 1);
    window.addEventListener('huddl-profile-prompt-complete', bump);
    return () => window.removeEventListener('huddl-profile-prompt-complete', bump);
  }, []);

  const isComplete = useMemo(() => {
    if (!uid) return true;
    return readStoredUid() === uid;
  }, [uid, storageTick]);

  useEffect(() => {
    if (!uid) {
      setDismissedWithoutRemember(false);
    }
  }, [uid]);

  const blockWelcomeForProfile = useMemo(() => {
    if (!uid || !firebaseUser) return false;
    return needsProfilePromptAttention(firebaseUser) && !readProfilePromptComplete(uid);
  }, [uid, firebaseUser, profileGateTick]);

  const markComplete = useCallback(
    (rememberDismiss) => {
      if (uid && rememberDismiss) {
        writeStoredUid(uid);
      } else if (uid && !rememberDismiss) {
        setDismissedWithoutRemember(true);
      }
      setStorageTick((t) => t + 1);
    },
    [uid]
  );

  const open = Boolean(
    isFirebaseAuth && uid && !accessLoading && !isComplete && !dismissedWithoutRemember && !blockWelcomeForProfile
  );

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setDontShowAgain(true);
  }, [open, uid]);

  const onOpenChange = (nextOpen) => {
    if (!nextOpen) {
      markComplete(dontShowAgain);
    }
  };

  const displayName =
    sessionUser?.full_name?.trim() ||
    (sessionUser?.email ? sessionUser.email.split('@')[0] : null) ||
    'there';

  const hasTeamMembership = memberships.length > 0;
  const noTeamAccess =
    (accessibleTeamIds?.length ?? 0) === 0 && !hasTeamMembership;

  const goNext = () => setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const finish = () => {
    markComplete(dontShowAgain);
  };

  const goTeamsAndFinish = () => {
    markComplete(dontShowAgain);
    navigate('/circles');
  };

  if (!isFirebaseAuth || !uid) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-xl max-h-[min(92vh,760px)] w-[calc(100%-1.5rem)] p-0 gap-0',
          'flex flex-col overflow-hidden border-border/80 shadow-xl'
        )}
      >
        <div className="px-6 pt-6 pb-3 border-b border-border/60 shrink-0">
          <DialogHeader className="space-y-3 pr-6">
            <div
              className="flex items-center justify-center gap-1 sm:justify-start flex-wrap"
              role="progressbar"
              aria-valuenow={step + 1}
              aria-valuemin={1}
              aria-valuemax={STEP_LABELS.length}
              aria-label={`Step ${step + 1} of ${STEP_LABELS.length}`}
            >
              {STEP_LABELS.map((label, i) => (
                <React.Fragment key={label}>
                  {i > 0 && (
                    <div
                      className={cn(
                        'h-px w-3 sm:w-5 shrink-0',
                        i <= step ? 'bg-primary/70' : 'bg-border'
                      )}
                      aria-hidden
                    />
                  )}
                  <span
                    className={cn(
                      'flex items-center gap-1 rounded-full px-2 py-1 text-[10px] sm:text-xs font-medium',
                      i === step
                        ? 'bg-primary text-primary-foreground'
                        : i < step
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-muted/40 text-muted-foreground/70'
                    )}
                  >
                    <span className="tabular-nums">{i + 1}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </span>
                </React.Fragment>
              ))}
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-xl bg-gradient-to-br from-primary to-accent p-2.5 text-white shadow-sm shrink-0">
                {step === 0 ? (
                  <Sparkles className="w-5 h-5" aria-hidden />
                ) : step === 1 ? (
                  <UsersRound className="w-5 h-5" aria-hidden />
                ) : step === 2 ? (
                  <LayoutGrid className="w-5 h-5" aria-hidden />
                ) : (
                  <CheckCircle2 className="w-5 h-5" aria-hidden />
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-xl sm:text-2xl">
                  {step === 0 && 'Welcome to Huddl'}
                  {step === 1 && 'Circles & access'}
                  {step === 2 && 'Your first Huddl Board'}
                  {step === 3 && "You're ready"}
                </DialogTitle>
                <DialogDescription className="text-left text-sm leading-relaxed">
                  {step === 0 && `Hi ${displayName} — create a Circle and start your first Huddl.`}
                  {step === 1 && 'Circles are the top-level way to organize people and shared Huddl Boards.'}
                  {step === 2 && 'Start a Huddl Board from Home whenever you’re ready.'}
                  {step === 3 && 'Use the header to open Circles or Profile.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 min-h-[12rem] text-sm text-foreground leading-relaxed space-y-4">
          {step === 0 && (
            <>
              <p>
                You’re signed in with Google. Your work is saved to the cloud so you can pick up from any device where
                you use the same account.
              </p>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                <li>
                  <strong className="text-foreground">Circles</strong> are the top-level way to organize people — for a
                  project, class, or company group — and to share Huddl Boards.
                </li>
                <li>
                  <strong className="text-foreground">Personal Huddl Boards</strong> stay private to you — they aren’t
                  shared.
                </li>
              </ul>
            </>
          )}

          {step === 1 && (
            <>
              {canCreateTeam && (
                <>
                  <p>
                    Open{' '}
                    <Link to="/circles" className="text-primary font-medium underline-offset-2 hover:underline">
                      Circles
                    </Link>{' '}
                    to create a group, invite people, and manage membership. Use <strong>Home</strong> for private Huddl
                    Boards that aren’t tied to a Circle.
                  </p>
                  <p className="text-muted-foreground">
                    The Circles page lists every group you belong to; shared Huddl Boards are visible to everyone in
                    those Circles.
                  </p>
                </>
              )}
              {!canCreateTeam && noTeamAccess && (
                <>
                  <p>
                    You’re <strong>not in a Circle</strong> yet — that’s normal. You can still create{' '}
                    <strong>personal Huddl Boards</strong> that stay private to you. To share work, ask someone to invite
                    you, or create a <strong>Circle</strong> from the header.
                  </p>
                  <p className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] dark:bg-amber-500/10 px-3 py-2.5 text-foreground">
                    <strong>To collaborate on a shared Huddl Board,</strong> ask a <strong>Circle Lead</strong> to invite you
                    from their Circle page, or join a Circle you have been invited to.
                  </p>
                </>
              )}
              {!canCreateTeam && !noTeamAccess && (
                <p>
                  You’re already in <strong>one or more Circles</strong>. Open{' '}
                  <Link to="/circles" className="text-primary font-medium underline-offset-2 hover:underline">
                    Circles
                  </Link>{' '}
                  to see rosters, invites, and which Huddl Boards belong to each Circle. When you start a Huddl Board, you
                  can assign it to a Circle so everyone in that Circle can see it.
                </p>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <p>
                From <strong>Home</strong>, use <strong>Start a Huddl Board</strong> to begin. Pick a{' '}
                <strong>template</strong> (for example retrospective vs collaboration), give the Huddl Board a title,
                and choose whether it’s <strong>personal</strong> or tied to a <strong>Circle</strong> you belong to.
              </p>
              <p className="text-muted-foreground">
                <strong>Personal</strong> Huddl Boards are only for you — they aren’t shared. Choose{' '}
                <strong>Circle</strong> when you want to share the Huddl Board with everyone in that Circle.
              </p>
              <p className="text-muted-foreground">
                After you create a Huddl Board, open <strong>Huddl Board settings</strong> anytime to move it between
                personal and Circle access.
              </p>
            </>
          )}

          {step === 3 && (
            <>
              <p>
                Next step: go to{' '}
                <Link to="/" className="text-primary font-medium underline-offset-2 hover:underline">
                  Home
                </Link>{' '}
                and create your first Huddl Board, or visit{' '}
                <Link to="/circles" className="text-primary font-medium underline-offset-2 hover:underline">
                  Circles
                </Link>{' '}
                {canCreateTeam ? 'to set up a Circle.' : 'to see Circles you’re in.'}
              </p>
              <p className="text-muted-foreground text-xs">
                If you leave &quot;Don&apos;t show this again&quot; on when you finish, this intro won&apos;t reappear. To
                see it on a later visit, uncheck the box under <strong>Start using Huddl</strong> before you continue.
              </p>
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-border/60 bg-muted/20">
          <DialogFooter className="px-6 py-4 gap-2 !flex-row flex-wrap !justify-between m-0 !space-x-0 sm:!space-x-0 sm:!flex-row sm:!justify-between">
            {step < 3 ? (
              <>
                <div className="flex gap-2">
                  {step > 0 && (
                    <Button type="button" variant="outline" className="rounded-xl gap-1" onClick={goBack}>
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button type="button" className="rounded-xl gap-1" onClick={goNext}>
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="rounded-xl gap-1" onClick={goBack}>
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  {canCreateTeam && (
                    <Button type="button" variant="secondary" className="rounded-xl" onClick={goTeamsAndFinish}>
                      Open Circles
                    </Button>
                  )}
                  <Button type="button" className="rounded-xl" onClick={finish}>
                    Start using Huddl
                  </Button>
                </div>
              </>
            )}
          </DialogFooter>
          {step === 3 && (
            <div className="px-6 pb-4 pt-1 flex items-center justify-end gap-2.5">
              <input
                type="checkbox"
                id="welcome-dont-show-again"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary focus-visible:ring-1 focus-visible:ring-ring"
              />
              <label
                htmlFor="welcome-dont-show-again"
                className="text-sm text-foreground leading-snug cursor-pointer"
              >
                Don&apos;t show this again
              </label>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
