import React, { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bug, Lightbulb } from 'lucide-react';
import { base44, isFirestoreBackend } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import MainHeader from '@/components/MainHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isFeedbackLogViewer } from '@/lib/feedbackAccess';
import { writeFeedbackLastReviewedAt } from '@/lib/feedbackLogReview';
import { normalizeEmail } from '@/lib/email';

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export default function FeedbackLog() {
  const { sessionUser } = useAuth();
  const queryClient = useQueryClient();
  const viewer = useMemo(() => isFeedbackLogViewer(sessionUser?.email), [sessionUser?.email]);
  const viewerEmail = sessionUser?.email ?? '';

  useEffect(() => {
    if (!viewer || !viewerEmail) return;
    writeFeedbackLastReviewedAt(viewerEmail);
    queryClient.invalidateQueries({ queryKey: ['product_feedback_log'] });
  }, [viewer, viewerEmail, queryClient]);

  const { data: rows = [], isLoading, isError } = useQuery({
    queryKey: ['product_feedback_log', normalizeEmail(sessionUser?.email)],
    queryFn: () => base44.entities.ProductFeedback.listForLog(sessionUser?.email),
    enabled: viewer && !!sessionUser?.email,
    staleTime: 30_000,
  });

  if (!viewer) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <MainHeader />
        <main className="flex-1 flex flex-col items-center justify-center px-4">
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            This page is only available to the product feedback inbox.
          </p>
          <Button asChild variant="outline" className="rounded-xl mt-6">
            <Link to="/">Back home</Link>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <MainHeader />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" className="rounded-xl shrink-0" asChild>
            <Link to="/" aria-label="Back home">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Feedback log</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Feature requests and bug reports from signed-in users.
              {!isFirestoreBackend ? ' Local dev: entries stay in this browser only.' : null}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">Could not load feedback. Check that you are signed in as the inbox account.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-xl border border-border/60 bg-muted/20 px-4 py-8 text-center">
            No entries yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {r.kind === 'feature' ? (
                    <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                      <Lightbulb className="h-3.5 w-3.5" aria-hidden />
                      Feature
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-medium text-destructive">
                      <Bug className="h-3.5 w-3.5" aria-hidden />
                      Bug
                    </span>
                  )}
                  <span className="text-muted-foreground/60">·</span>
                  <span>{formatWhen(r.created_at)}</span>
                  <span className="text-muted-foreground/60">·</span>
                  <span className="truncate max-w-[12rem] sm:max-w-xs" title={r.submitter_email}>
                    {r.submitter_email}
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{r.body}</p>
                {r.page_path ? (
                  <p className="text-[11px] font-mono text-muted-foreground break-all">Page: {r.page_path}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
