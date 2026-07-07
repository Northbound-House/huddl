import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, LayoutGrid, LogOut, UserCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { circlesPath } from '@/lib/orgPaths';
import { isFeedbackLogViewer } from '@/lib/feedbackAccess';
import { countNewFeedbackSinceReview, readFeedbackLastReviewedAt } from '@/lib/feedbackLogReview';
import { normalizeEmail } from '@/lib/email';
import { cn } from '@/lib/utils';

/**
 * Global header: primary nav (Circles is the top-level hub).
 */
export default function MainHeader({ className }) {
  const { sessionUser, signOut, isFirebaseAuth } = useAuth();
  const viewerEmail = sessionUser?.email ?? '';
  const isViewer = isFeedbackLogViewer(viewerEmail);

  const { data: feedbackRows = [] } = useQuery({
    queryKey: ['product_feedback_log', normalizeEmail(viewerEmail)],
    queryFn: () => base44.entities.ProductFeedback.listForLog(viewerEmail),
    enabled: isViewer && !!viewerEmail,
    staleTime: 20_000,
    refetchInterval: 90_000,
    refetchOnWindowFocus: true,
  });

  const newFeedbackCount = useMemo(() => {
    if (!isViewer || !viewerEmail) return 0;
    const last = readFeedbackLastReviewedAt(viewerEmail);
    return countNewFeedbackSinceReview(feedbackRows, last);
  }, [isViewer, viewerEmail, feedbackRows]);

  const displayName =
    sessionUser?.full_name?.trim() ||
    (sessionUser?.email ? sessionUser.email.split('@')[0] : null) ||
    'Account';

  return (
    <header
      className={cn(
        'sticky top-0 z-30 w-full border-b border-border/50 bg-card/90 backdrop-blur-md supports-[backdrop-filter]:bg-card/75 shadow-sm',
        className
      )}
    >
      <div className="w-full px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3 min-h-[3.25rem]">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Link
            to="/"
            className="flex items-center gap-2 sm:gap-2.5 min-w-0 rounded-xl hover:bg-muted/60 -ml-1 px-1 py-1 transition-colors"
          >
            <div className="p-1.5 sm:p-2 rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-sm shrink-0">
              <LayoutGrid className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="font-heading text-sm sm:text-base md:text-lg font-bold tracking-tight text-foreground truncate leading-tight">
                Huddl
              </p>
              <p className="hidden md:block text-[11px] text-muted-foreground truncate leading-snug">
                Better work starts with a Huddl.
              </p>
            </div>
          </Link>
        </div>

        <nav className="flex flex-nowrap items-center justify-end gap-1 sm:gap-2 shrink-0" aria-label="Main">
          {isFirebaseAuth && sessionUser && (
            <Link
              to="/profile"
              aria-label={`Profile (${displayName})`}
              className="flex items-center gap-2 rounded-xl pl-1 pr-2 sm:pr-2.5 py-1 min-w-0 max-w-[min(11rem,40vw)] sm:max-w-[14rem] hover:bg-muted/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {sessionUser.photoURL ? (
                <img
                  src={sessionUser.photoURL}
                  alt=""
                  className="w-8 h-8 rounded-full border border-border/80 object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full border border-border/80 bg-muted flex items-center justify-center shrink-0">
                  <UserCircle className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <span className="text-sm font-medium text-foreground truncate hidden sm:inline">
                {displayName}
              </span>
            </Link>
          )}
          {isViewer && (
            <Button variant="outline" size="sm" className="rounded-xl h-9 px-2.5 sm:px-3 shrink-0" asChild>
              <Link
                to="/feedback-log"
                className={cn('gap-1.5 relative', newFeedbackCount > 0 && 'pr-1')}
                aria-label={
                  newFeedbackCount > 0
                    ? `Feedback log, ${newFeedbackCount} new since last reviewed`
                    : 'Feedback log'
                }
              >
                <ClipboardList className="w-4 h-4 shrink-0" aria-hidden />
                <span className="hidden sm:inline">Feedback log</span>
                {newFeedbackCount > 0 ? (
                  <span className="absolute -top-1.5 -right-1 min-h-[1.125rem] min-w-[1.125rem] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold leading-none flex items-center justify-center tabular-nums border-2 border-card shadow-sm">
                    {newFeedbackCount > 9 ? '9+' : newFeedbackCount}
                  </span>
                ) : null}
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" className="rounded-xl h-9 px-2.5 sm:px-3 shrink-0" asChild>
            <Link to={circlesPath()} className="gap-1.5">
              <Users className="w-4 h-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Circles</span>
            </Link>
          </Button>
          {isFirebaseAuth && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-xl h-9 px-2 sm:px-3 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => signOut()}
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4 sm:mr-1.5" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
