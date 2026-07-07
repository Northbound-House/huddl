import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, Bug, Lightbulb, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/** Shared look for archive, theme, and feedback controls in the dock. */
const DOCK_TRIGGER =
  'h-9 w-9 rounded-xl shrink-0 border border-border/80 bg-background/80 backdrop-blur-sm shadow-sm';

/**
 * Fixed bottom-right: archive, theme, and feedback in one row (no overlap).
 */
export default function ArchiveThemeDock({ className }) {
  const { isFirebaseAuth, sessionUser } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [feedbackDialog, setFeedbackDialog] = useState(null);
  const [feedbackBody, setFeedbackBody] = useState('');

  const showArchiveAndTheme = isFirebaseAuth && !!sessionUser?.uid;
  const showFeedback = !!sessionUser?.email;

  const pagePath = `${location.pathname}${location.search || ''}`;

  const submitFeedbackMutation = useMutation({
    mutationFn: async ({ kind, text }) => {
      const email = sessionUser?.email ?? '';
      await base44.entities.ProductFeedback.create({
        kind,
        body: text,
        page_path: pagePath,
        submitter_email: email,
        submitter_uid: sessionUser?.uid ?? null,
      });
    },
    onSuccess: () => {
      toast.success('Thanks — your feedback was sent.');
      setFeedbackDialog(null);
      setFeedbackBody('');
      queryClient.invalidateQueries({ queryKey: ['product_feedback_log'] });
    },
    onError: () => toast.error('Could not send feedback. Try again in a moment.'),
  });

  if (!showArchiveAndTheme && !showFeedback) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          'fixed bottom-10 right-4 z-[100] flex flex-col items-end gap-1.5',
          'pointer-events-none [&_.dock-hit]:pointer-events-auto',
          className
        )}
      >
        <div className="dock-hit flex flex-row items-center gap-2">
          {showArchiveAndTheme && (
            <>
              <Button variant="outline" size="icon" className={DOCK_TRIGGER} asChild>
                <Link to="/archived" aria-label="Archived Huddl Boards" title="Archived Huddl Boards">
                  <Archive className="w-4 h-4" />
                </Link>
              </Button>
              <ThemeSwitcher />
            </>
          )}

          {showFeedback && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex dock-hit">
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className={DOCK_TRIGGER}
                        aria-label="Feedback"
                        title="Feedback"
                      >
                        <MessageSquare className="w-4 h-4" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" align="end" className="max-w-[14rem] text-left leading-relaxed">
                  <span className="font-medium text-foreground">Feedback</span>
                  <span className="block mt-1 text-muted-foreground">
                    Request a feature or report a bug — we read every note.
                  </span>
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent side="top" align="end" className="w-52 rounded-xl">
                <DropdownMenuItem
                  className="gap-2 rounded-lg cursor-pointer"
                  onClick={() => {
                    setFeedbackDialog('feature');
                    setFeedbackBody('');
                  }}
                >
                  <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
                  Request a feature
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 rounded-lg cursor-pointer"
                  onClick={() => {
                    setFeedbackDialog('bug');
                    setFeedbackBody('');
                  }}
                >
                  <Bug className="h-4 w-4 text-destructive" aria-hidden />
                  Report a bug
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {!isFirebaseAuth && showFeedback ? (
          <p className="dock-hit text-[10px] text-muted-foreground max-w-[14rem] text-right leading-snug px-0.5">
            Local mode: feedback is stored only in this browser.
          </p>
        ) : null}

        <Dialog open={feedbackDialog != null} onOpenChange={(o) => !o && setFeedbackDialog(null)}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>{feedbackDialog === 'feature' ? 'Request a feature' : 'Report a bug'}</DialogTitle>
              <DialogDescription>
                {feedbackDialog === 'feature'
                  ? 'Describe what would help you. Include enough context that we can picture it.'
                  : 'What went wrong? Steps to reproduce help us fix it faster.'}
              </DialogDescription>
            </DialogHeader>
            <textarea
              value={feedbackBody}
              onChange={(e) => setFeedbackBody(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder="Your message…"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm resize-none"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Page: <span className="font-mono text-foreground/90 break-all">{pagePath || '/'}</span>
            </p>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setFeedbackDialog(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                onClick={() => {
                  const trimmed = feedbackBody.trim();
                  if (!trimmed) {
                    toast.error('Please add a short description.');
                    return;
                  }
                  submitFeedbackMutation.mutate({ kind: feedbackDialog, text: trimmed });
                }}
                disabled={submitFeedbackMutation.isPending || !feedbackBody.trim()}
              >
                {submitFeedbackMutation.isPending ? 'Sending…' : 'Send'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
