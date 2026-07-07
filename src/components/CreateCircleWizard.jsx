import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44, isFirestoreBackend } from '@/api/base44Client';
import { ALLOWED_AUTH_EMAIL_DOMAIN, isCircleInviteEmailAllowed } from '@/lib/authPolicy';
import { normalizeEmail } from '@/lib/email';
import { pickOrganizationIdForNewCircle } from '@/lib/pickOrganizationForNewCircle';
import { useUserAccess } from '@/context/UserAccessContext';
import { Check, ChevronLeft, ChevronRight, Sparkles, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { trackEvent } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { circleDetailPath } from '@/lib/orgPaths';

const STEPS = ['About', 'Name', 'People', 'Review'];

/** Split textarea / commas into normalized unique emails. */
function parseMemberEmails(text) {
  const lines = (text || '').split(/[\n,;]+/);
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const em = normalizeEmail(line.trim());
    if (!em || !em.includes('@')) continue;
    if (seen.has(em)) continue;
    seen.add(em);
    out.push(em);
  }
  return out;
}

function disallowedInviteEmails(parsed) {
  return parsed.filter((e) => !isCircleInviteEmailAllowed(e));
}

export default function CreateCircleWizard({ open, onOpenChange, sessionUser }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refreshAccess, canCreateTeam, orgAdminOrgIds } = useUserAccess();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [memberEmailsRaw, setMemberEmailsRaw] = useState('');

  const createOrgId = useMemo(
    () =>
      pickOrganizationIdForNewCircle({
        uid: sessionUser?.uid ?? null,
        orgAdminOrgIds,
      }),
    [sessionUser?.uid, orgAdminOrgIds]
  );

  const canCreateHere = canCreateTeam && (!isFirestoreBackend || createOrgId != null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setName('');
    setMemberEmailsRaw('');
  }, [open]);

  const createMutation = useMutation({
    mutationFn: async ({ circleName, memberEmails }) => {
      for (const em of memberEmails) {
        if (!isCircleInviteEmailAllowed(em)) {
          throw new Error(
            `Only @${ALLOWED_AUTH_EMAIL_DOMAIN} email addresses can be added to a Circle.`
          );
        }
      }
      const oid = isFirestoreBackend ? createOrgId : null;
      if (isFirestoreBackend && !oid) {
        throw new Error('Could not determine where to create this Circle.');
      }
      const myEmail = normalizeEmail(sessionUser?.email);
      const team = await base44.entities.Team.create({
        name: circleName.trim(),
        organization_id: oid,
        created_by_uid: sessionUser?.uid ?? null,
        created_by_email: myEmail,
      });
      let membersAdded = 0;
      for (const em of memberEmails) {
        if (myEmail && em === myEmail) continue;
        try {
          await base44.entities.TeamMembership.create({
            team_id: team.id,
            email: em,
            role: 'member',
          });
          membersAdded += 1;
        } catch {
          /* duplicate or validation — skip */
        }
      }
      return { team, membersAdded };
    },
    onSuccess: ({ team, membersAdded }) => {
      trackEvent('circle_create', { invite_count: membersAdded, from_flow: 'circles' });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      if (team?.id) {
        queryClient.invalidateQueries({ queryKey: ['team_memberships', team.id] });
      }
      const base =
        normalizeEmail(sessionUser?.email) ? 'Circle created — you’re the Circle Lead' : 'Circle created';
      if (membersAdded > 0) {
        toast.success(base, {
          description: `${membersAdded} email address${membersAdded === 1 ? '' : 'es'} added — those accounts will see this Circle automatically when they sign in with Google using that address.`,
        });
      } else {
        toast.success(base);
      }
      refreshAccess();
      onOpenChange(false);
      if (team?.id) {
        navigate(circleDetailPath(team.id));
      }
    },
    onError: (e) => toast.error(e?.message || 'Could not create Circle'),
  });

  const goNext = useCallback(() => {
    if (step === 1 && !name.trim()) {
      toast.error('Enter a Circle name');
      return;
    }
    if (step === 2) {
      const parsed = parseMemberEmails(memberEmailsRaw);
      const bad = disallowedInviteEmails(parsed);
      if (bad.length) {
        toast.error(
          `Only @${ALLOWED_AUTH_EMAIL_DOMAIN} email addresses can be added to a Circle. Remove or fix: ${bad.join(', ')}`
        );
        return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, [step, name, memberEmailsRaw]);

  const goBack = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error('Enter a Circle name');
      return;
    }
    const memberEmails = parseMemberEmails(memberEmailsRaw);
    const bad = disallowedInviteEmails(memberEmails);
    if (bad.length) {
      toast.error(
        `Only @${ALLOWED_AUTH_EMAIL_DOMAIN} email addresses can be added. Remove or fix: ${bad.join(', ')}`
      );
      return;
    }
    createMutation.mutate({ circleName: name, memberEmails });
  };

  const memberEmailsPreview = useMemo(() => parseMemberEmails(memberEmailsRaw), [memberEmailsRaw]);
  const hasInvalidInvites = useMemo(
    () => disallowedInviteEmails(memberEmailsPreview).length > 0,
    [memberEmailsPreview]
  );
  const disallowedList = useMemo(
    () => disallowedInviteEmails(memberEmailsPreview),
    [memberEmailsPreview]
  );

  const disableNext = (step === 1 && !name.trim()) || (step === 2 && hasInvalidInvites);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-lg max-h-[min(92vh,720px)] w-[calc(100%-1.5rem)] p-0 gap-0',
          'flex flex-col overflow-hidden border-border/80 shadow-xl'
        )}
      >
        <div className="px-6 pt-6 pb-3 border-b border-border/60 shrink-0">
          <DialogHeader className="space-y-3 pr-8">
            <div
              className="flex items-center justify-center gap-1 sm:gap-1.5 flex-nowrap overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="progressbar"
              aria-valuenow={step + 1}
              aria-valuemin={1}
              aria-valuemax={STEPS.length}
              aria-label={`Step ${step + 1} of ${STEPS.length}`}
            >
              {STEPS.map((label, i) => (
                <React.Fragment key={label}>
                  {i > 0 && (
                    <div
                      className={cn('h-px w-3 sm:w-5 shrink-0', i <= step ? 'bg-primary/70' : 'bg-border')}
                      aria-hidden
                    />
                  )}
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11px] sm:text-xs font-medium shrink-0',
                      i === step
                        ? 'bg-primary text-primary-foreground'
                        : i < step
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-muted/40 text-muted-foreground/70'
                    )}
                  >
                    <span className="tabular-nums">{i + 1}</span>
                    <span className="hidden sm:inline"> · {label}</span>
                  </span>
                </React.Fragment>
              ))}
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-xl bg-gradient-to-br from-primary to-accent p-2.5 text-white shadow-sm shrink-0">
                <Users className="w-5 h-5" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-xl sm:text-2xl">Create Circle</DialogTitle>
                <DialogDescription className="text-left text-sm">
                  {step === 0 && 'Circles bring people together to collaborate.'}
                  {step === 1 && 'Give your Circle a name—this is your space to collaborate.'}
                  {step === 2 &&
                    'Invite people to your Circle so you can start working together — or skip and add them later from the Circle page.'}
                  {step === 3 && 'Confirm and open your new Circle.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 min-h-[10rem] space-y-4">
          {step === 0 && (
            <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
              <p>
                A <strong className="text-foreground">Circle</strong> is your group of people collaborating together — for a
                project, class, or company group. Everyone in the Circle can see Huddl Boards you share with that Circle.
              </p>
              <p>
                You’ll be the <strong className="text-foreground">Circle Lead</strong> for this Circle and can add more people by
                email from the Circle page anytime.
              </p>
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 flex gap-3">
                <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />
                <p className="text-xs">
                  Next, you’ll name your Circle, optionally add people’s email addresses, then confirm — similar to
                  starting a new Huddl Board.
                </p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <label htmlFor="circle-wizard-name" className="text-xs font-medium text-muted-foreground">
                Circle name <span className="text-destructive">*</span>
              </label>
              <input
                id="circle-wizard-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Design Circle"
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                autoComplete="off"
                autoFocus
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <label htmlFor="circle-wizard-people-emails" className="text-xs font-medium text-muted-foreground">
                Email addresses <span className="text-muted-foreground/80 font-normal">(optional)</span>
              </label>
              <textarea
                id="circle-wizard-people-emails"
                value={memberEmailsRaw}
                onChange={(e) => setMemberEmailsRaw(e.target.value)}
                placeholder={'name@jackhenry.com\nteammate@jackhenry.com'}
                rows={6}
                className={cn(
                  'mt-1 w-full resize-y min-h-[7rem] rounded-xl border bg-background px-3 py-2.5 text-sm font-mono',
                  hasInvalidInvites ? 'border-destructive' : 'border-input'
                )}
                autoComplete="off"
                autoFocus
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                One email per line (commas work too). For now, only <strong className="text-foreground">@{ALLOWED_AUTH_EMAIL_DOMAIN}</strong>{' '}
                addresses can be invited. When someone signs in with Google using a listed address, they’ll see this
                Circle automatically. You can add more people later from the Circle page.
              </p>
              {hasInvalidInvites && (
                <div
                  role="alert"
                  className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-foreground"
                >
                  <p className="font-medium text-destructive">Use only @{ALLOWED_AUTH_EMAIL_DOMAIN} addresses</p>
                  <p className="mt-1 text-muted-foreground">
                    Remove or fix the following {disallowedList.length === 1 ? 'address' : 'addresses'} before continuing:{' '}
                    <span className="font-mono text-foreground break-all">{disallowedList.join(', ')}</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="rounded-2xl border border-border/60 bg-muted/20 divide-y divide-border/60 overflow-hidden text-sm">
              <div className="px-4 py-3 flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">Circle name</span>
                <span className="font-medium text-right text-foreground">{name.trim() || '—'}</span>
              </div>
              <div className="px-4 py-3 flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                <span className="text-muted-foreground shrink-0">People (by email)</span>
                <span className="font-medium text-right text-foreground sm:max-w-[70%]">
                  {memberEmailsPreview.length === 0 ? (
                    'None — you can add emails later'
                  ) : (
                    <span className="break-all">{memberEmailsPreview.join(', ')}</span>
                  )}
                </span>
              </div>
              <div className="px-4 py-3 flex items-start gap-2 text-xs text-muted-foreground">
                <Check className="w-4 h-4 shrink-0 mt-0.5 text-primary" aria-hidden />
                <span>
                  You’ll open the Circle page next, where you can manage members and add Huddl Boards.
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/60 bg-muted/15 flex-row flex-wrap gap-2 justify-between sm:justify-between sm:space-x-0">
          <div className="flex gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                className="rounded-xl gap-1"
                onClick={goBack}
                disabled={createMutation.isPending}
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step < STEPS.length - 1 ? (
              <Button type="button" className="rounded-xl gap-1" onClick={goNext} disabled={disableNext}>
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                type="button"
                className="rounded-xl min-w-[8rem]"
                onClick={handleCreate}
                disabled={createMutation.isPending || !canCreateHere}
              >
                {createMutation.isPending ? 'Creating…' : 'Create Circle'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
