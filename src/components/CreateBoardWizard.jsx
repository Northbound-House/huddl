import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44, isFirestoreBackend } from '@/api/base44Client';
import { trackEvent } from '@/lib/analytics';
import { normalizeEmail } from '@/lib/email';
import { pickOrganizationIdForNewCircle } from '@/lib/pickOrganizationForNewCircle';
import { useUserAccess } from '@/context/UserAccessContext';
import { HUDDL_LAYOUT_LIST, getLayoutById } from '@/lib/huddlLayouts';
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  LayoutTemplate,
  Lock,
  PlusCircle,
  Sparkles,
  Users,
  Waves,
} from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { boardTeamsWritePayload } from '@/lib/boardTeams';
import SessionScheduleFields from '@/components/board/SessionScheduleFields';
import {
  buildSessionScheduleFromForm,
  formatSessionScheduleSummary,
  isSessionScheduleComplete,
} from '@/lib/sessionSchedule';

const STEPS = ['Name', 'Type', 'Session', 'Layout', 'Access', 'Review'];
const SESSION_STEP_INDEX = 2;

/** @typedef {'ongoing' | 'session'} HuddlType */
/** @typedef {'manual' | 'automatic'} SessionStartMode */

function defaultSessionScheduleForm() {
  return { cadence: 'weekly', weekday: 1, monthlyMode: 'day_of_month', dayOfMonth: 1, biweeklyAnchorDate: null };
}

/**
 * Derives legacy `ceremony_type` for existing Board / session behavior.
 * Session Huddls use retrospective session machinery; Ongoing uses team_collab or blank.
 */
function ceremonyTypeForCreate(huddlType, layoutId, blankBoard) {
  if (huddlType === 'session') return 'retrospective';
  if (blankBoard) return 'blank';
  return 'team_collab';
}

async function createBoardWithColumns({
  title,
  description,
  huddlType,
  layoutId,
  sessionStartMode,
  sessionSchedule,
  visibility,
  selectedTeamIds,
  ownerUid,
  ownerEmail,
  blankBoard,
  sectionTitles,
}) {
  const isPersonal = visibility === 'personal';
  const teamPayload = isPersonal
    ? { team_ids: [], team_id: null }
    : boardTeamsWritePayload(selectedTeamIds);
  const now = new Date().toISOString();
  const ceremonyType = ceremonyTypeForCreate(huddlType, layoutId, blankBoard);

  const board = await base44.entities.Board.create({
    title: title.trim(),
    description: (description || '').trim(),
    ceremony_type: ceremonyType,
    huddl_type: huddlType,
    layout_id: layoutId,
    session_start_mode: huddlType === 'session' ? sessionStartMode : null,
    ...(huddlType === 'session' && sessionStartMode === 'automatic' && sessionSchedule
      ? { session_schedule: sessionSchedule, session_frequency: null }
      : { session_schedule: null, session_frequency: null }),
    ...teamPayload,
    owner_uid: isPersonal ? ownerUid ?? null : null,
    owner_email: isPersonal && !ownerUid && ownerEmail ? ownerEmail : null,
    is_archived: false,
    created_at: now,
    updated_at: now,
  });

  if (!blankBoard && sectionTitles.length) {
    for (let i = 0; i < sectionTitles.length; i++) {
      await base44.entities.BoardColumn.create({
        board_id: board.id,
        title: sectionTitles[i],
        order: i,
      });
    }
  }
  return board;
}

export default function CreateBoardWizard({
  open,
  onOpenChange,
  teams = [],
  sessionUser,
  isFirebaseAuth,
  accessLoading,
}) {
  const queryClient = useQueryClient();
  const { refreshAccess, canCreateTeam, orgAdminOrgIds } = useUserAccess();
  const [searchParams] = useSearchParams();
  const initOnceRef = useRef(false);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  /** @type {[HuddlType, function]} */
  const [huddlType, setHuddlType] = useState('ongoing');
  const [layoutId, setLayoutId] = useState('kanban');
  /** @type {[SessionStartMode, function]} */
  const [sessionStartMode, setSessionStartMode] = useState('manual');
  const [sessionScheduleForm, setSessionScheduleForm] = useState(() => defaultSessionScheduleForm());
  const patchSessionScheduleForm = useCallback((patch) => {
    setSessionScheduleForm((prev) => ({ ...prev, ...patch }));
  }, []);
  const builtSessionSchedule = useMemo(
    () => buildSessionScheduleFromForm(sessionScheduleForm),
    [sessionScheduleForm]
  );
  const sessionScheduleComplete =
    sessionStartMode !== 'automatic' || isSessionScheduleComplete(builtSessionSchedule);
  const [visibility, setVisibility] = useState('personal');
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [createCircleOpen, setCreateCircleOpen] = useState(false);
  const [newCircleName, setNewCircleName] = useState('');

  const blankBoard = layoutId === 'blank';
  const layoutPreset = useMemo(() => getLayoutById(layoutId), [layoutId]);
  const sectionTitles = layoutPreset?.sectionTitles ?? [];

  /** Ongoing Huddls skip the Session scheduling step (internal index 2). */
  const visibleSteps = useMemo(
    () => (huddlType === 'session' ? STEPS : STEPS.filter((_, i) => i !== SESSION_STEP_INDEX)),
    [huddlType]
  );

  const displayStepIndex = useMemo(() => {
    if (huddlType === 'session') return step;
    if (step <= 1) return step;
    return step - 1;
  }, [huddlType, step]);

  const createOrgId = useMemo(
    () =>
      pickOrganizationIdForNewCircle({
        uid: sessionUser?.uid ?? null,
        orgAdminOrgIds,
      }),
    [sessionUser?.uid, orgAdminOrgIds]
  );

  const canCreateCircleHere = canCreateTeam && (!isFirestoreBackend || createOrgId != null);

  useEffect(() => {
    if (!open) {
      initOnceRef.current = false;
      return;
    }
    if (accessLoading) return;
    if (initOnceRef.current) return;
    initOnceRef.current = true;
    setStep(0);
    setTitle('');
    setDescription('');
    setHuddlType('ongoing');
    setLayoutId('kanban');
    setSessionStartMode('manual');
    setSessionScheduleForm(defaultSessionScheduleForm());
    const t = searchParams.get('team');
    if (t && teams.some((x) => x.id === t)) {
      setVisibility('teams');
      setSelectedTeamIds([t]);
    } else {
      setVisibility('personal');
      setSelectedTeamIds([]);
    }
  }, [open, accessLoading, teams, searchParams]);

  useEffect(() => {
    if (!open) return;
    if (huddlType === 'ongoing' && step === SESSION_STEP_INDEX) {
      setStep(3);
    }
  }, [open, huddlType, step]);

  useEffect(() => {
    if (!open) setCreateCircleOpen(false);
  }, [open]);

  const createCircleMutation = useMutation({
    mutationFn: async (circleName) => {
      const oid = isFirestoreBackend ? createOrgId : null;
      if (isFirestoreBackend && !oid) {
        throw new Error('Could not determine where to create this Circle.');
      }
      const email = normalizeEmail(sessionUser?.email);
      const team = await base44.entities.Team.create({
        name: circleName.trim(),
        organization_id: oid,
        created_by_uid: sessionUser?.uid ?? null,
        created_by_email: email,
      });
      return team;
    },
    onSuccess: (team) => {
      trackEvent('circle_create', { invite_count: 0, from_flow: 'board_wizard' });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      if (team?.id) {
        queryClient.invalidateQueries({ queryKey: ['team_memberships', team.id] });
      }
      setNewCircleName('');
      setCreateCircleOpen(false);
      setVisibility('teams');
      if (team?.id) {
        setSelectedTeamIds([team.id]);
      }
      toast.success(
        normalizeEmail(sessionUser?.email)
          ? 'Circle created — you’re the Circle Lead'
          : 'Circle created'
      );
      refreshAccess();
    },
    onError: (e) => toast.error(e?.message || 'Could not create Circle'),
  });

  const createMutation = useMutation({
    mutationFn: createBoardWithColumns,
    onSuccess: (board) => {
      const hasTeam = Boolean(
        (board.team_ids && board.team_ids.length > 0) || board.team_id
      );
      trackEvent('board_create', {
        huddl_type: String(board.huddl_type || ''),
        visibility: hasTeam ? 'circle' : 'personal',
        ceremony: String(board.ceremony_type || ''),
        is_session: board.huddl_type === 'session' ? 1 : 0,
      });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      queryClient.invalidateQueries({ queryKey: ['columns', board.id] });
      refreshAccess();
      toast.success('Huddl Board created');
      onOpenChange(false);
      window.location.href = `/board/${board.id}`;
    },
    onError: () => toast.error('Could not create Huddl Board'),
  });

  const selectedTeamLabel = useMemo(() => {
    if (visibility === 'personal') return 'Personal (only me)';
    const names = selectedTeamIds
      .map((id) => teams.find((x) => x.id === id)?.name)
      .filter(Boolean);
    if (!names.length) return 'Circles';
    if (names.length === 1) return names[0];
    return names.join(', ');
  }, [visibility, selectedTeamIds, teams]);

  const toggleWizardTeam = (id) => {
    setSelectedTeamIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const canUsePersonal = !isFirestoreBackend || !!sessionUser?.uid;

  const goNext = useCallback(() => {
    if (step === 0 && !title.trim()) {
      toast.error('Add a Huddl Board title');
      return;
    }
    if (step === 2 && huddlType === 'session' && sessionStartMode === 'automatic' && !sessionScheduleComplete) {
      toast.error('Finish the session schedule (cadence and day)');
      return;
    }
    if (step === 4 && visibility === 'personal' && !canUsePersonal) {
      toast.error('Sign in with Google to create a personal Huddl Board.');
      return;
    }
    if (step === 4 && visibility === 'teams' && selectedTeamIds.length === 0) {
      toast.error('Select at least one Circle');
      return;
    }
    setStep((s) => {
      if (s === 1 && huddlType === 'ongoing') return 3;
      return Math.min(s + 1, STEPS.length - 1);
    });
  }, [step, title, huddlType, sessionStartMode, sessionScheduleComplete, visibility, selectedTeamIds, canUsePersonal]);

  const goBack = useCallback(() => {
    setStep((s) => {
      if (s === 3 && huddlType === 'ongoing') return 1;
      return Math.max(s - 1, 0);
    });
  }, [huddlType]);

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error('Add a Huddl Board title');
      return;
    }
    if (huddlType === 'session' && sessionStartMode === 'automatic' && !sessionScheduleComplete) {
      toast.error('Finish the session schedule (cadence and day)');
      return;
    }
    if (visibility === 'personal' && isFirestoreBackend && !sessionUser?.uid) {
      toast.error('Sign in with Google to create a personal Huddl Board.');
      return;
    }
    if (visibility === 'teams' && selectedTeamIds.length === 0) {
      toast.error('Select at least one Circle');
      return;
    }
    createMutation.mutate({
      title,
      description,
      huddlType,
      layoutId,
      sessionStartMode,
      sessionSchedule: sessionStartMode === 'automatic' ? builtSessionSchedule : null,
      visibility,
      selectedTeamIds,
      ownerUid: sessionUser?.uid ?? null,
      ownerEmail: sessionUser?.email ?? null,
      blankBoard,
      sectionTitles,
    });
  };

  const disableNext =
    accessLoading ||
    (step === 0 && !title.trim()) ||
    (step === 2 && huddlType === 'session' && sessionStartMode === 'automatic' && !sessionScheduleComplete) ||
    (step === 4 && visibility === 'personal' && !canUsePersonal) ||
    (step === 4 && visibility === 'teams' && selectedTeamIds.length === 0);

  const submitNewCircle = (e) => {
    e.preventDefault();
    if (!newCircleName.trim()) {
      toast.error('Enter a Circle name');
      return;
    }
    createCircleMutation.mutate(newCircleName);
  };

  const stepDescription = useMemo(() => {
    switch (step) {
      case 0:
        return 'Give your Huddl Board a name and optional context.';
      case 1:
        return 'How will this Huddl be used over time?';
      case 2:
        return 'Configure how sessions start. Past sessions stay available as read-only history.';
      case 3:
        return 'A layout defines the starting Sections for your Huddl.';
      case 4:
        return 'Choose who can see this Huddl Board.';
      case 5:
        return 'Confirm and open your new Huddl Board.';
      default:
        return '';
    }
  }, [step, huddlType]);

  /** Avoid wrong subtitle if internal step briefly desyncs before redirect. */
  const headerDescription =
    step === SESSION_STEP_INDEX && huddlType !== 'session' ? '' : stepDescription;

  return (
    <>
      <Dialog
        open={createCircleOpen}
        onOpenChange={(next) => {
          setCreateCircleOpen(next);
          if (next) setNewCircleName('');
        }}
      >
        <DialogContent className="sm:max-w-md z-[100] gap-0 p-0 border-border/80 shadow-xl">
          <div className="px-6 pt-6 pb-2">
            <DialogHeader>
              <DialogTitle>Create Circle</DialogTitle>
              <DialogDescription className="text-left text-sm">
                Circles bring people together to collaborate. When you’re done, you’ll return to this Huddl Board setup.
              </DialogDescription>
            </DialogHeader>
          </div>
          <form onSubmit={submitNewCircle} className="px-6 pb-6 space-y-4">
            <div>
              <label htmlFor="wizard-new-circle-name" className="text-xs font-medium text-muted-foreground">
                Circle name <span className="text-destructive">*</span>
              </label>
              <input
                id="wizard-new-circle-name"
                value={newCircleName}
                onChange={(e) => setNewCircleName(e.target.value)}
                placeholder="e.g. Design Circle"
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                autoComplete="off"
                autoFocus
              />
            </div>
            <DialogFooter className="flex-row flex-wrap gap-2 justify-end sm:justify-end sm:space-x-0 pt-0">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => setCreateCircleOpen(false)}
                disabled={createCircleMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl" disabled={createCircleMutation.isPending}>
                {createCircleMutation.isPending ? 'Creating…' : 'Create Circle'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            'max-w-2xl max-h-[min(92vh,760px)] w-[calc(100%-1.5rem)] p-0 gap-0',
            'flex flex-col overflow-hidden border-border/80 shadow-xl'
          )}
        >
          <div className="px-6 pt-6 pb-3 border-b border-border/60 shrink-0">
            <DialogHeader className="space-y-3 pr-8">
              <div
                className="flex items-center justify-center gap-1 sm:gap-1.5 flex-nowrap overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="progressbar"
                aria-valuenow={displayStepIndex + 1}
                aria-valuemin={1}
                aria-valuemax={visibleSteps.length}
                aria-label={`Step ${displayStepIndex + 1} of ${visibleSteps.length}`}
              >
                {visibleSteps.map((label, i) => (
                  <React.Fragment key={`${label}-${i}`}>
                    {i > 0 && (
                      <div
                        className={cn(
                          'h-px w-3 sm:w-5 shrink-0',
                          i <= displayStepIndex ? 'bg-primary/70' : 'bg-border'
                        )}
                        aria-hidden
                      />
                    )}
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-[11px] sm:text-xs font-medium shrink-0',
                        i === displayStepIndex
                          ? 'bg-primary text-primary-foreground'
                          : i < displayStepIndex
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
                  <LayoutGrid className="w-5 h-5" aria-hidden />
                </div>
                <div className="min-w-0 space-y-1">
                  <DialogTitle className="text-xl sm:text-2xl">Start a Huddl Board</DialogTitle>
                  <DialogDescription className="text-left text-sm">{headerDescription}</DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="px-6 py-4 overflow-y-auto flex-1 min-h-[12rem] space-y-4">
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="board-wizard-title" className="text-xs font-medium text-muted-foreground">
                    Huddl Board name <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="board-wizard-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Sprint planning, Team retro, Product roadmap"
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                    autoComplete="off"
                    autoFocus
                  />
                </div>
                <div>
                  <label htmlFor="board-wizard-desc" className="text-xs font-medium text-muted-foreground">
                    Description <span className="text-muted-foreground/80">(optional)</span>
                  </label>
                  <textarea
                    id="board-wizard-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Goal or context"
                    rows={3}
                    className="mt-1 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setHuddlType('ongoing');
                    setLayoutId((id) => (id === 'retro' ? 'kanban' : id));
                  }}
                  className={cn(
                    'w-full text-left rounded-2xl border px-4 py-4 transition-all',
                    'hover:border-primary/50 hover:bg-muted/30',
                    huddlType === 'ongoing'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/25 shadow-sm'
                      : 'border-border/80 bg-card'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'rounded-xl p-2 shrink-0',
                        huddlType === 'ongoing' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <Waves className="w-5 h-5" aria-hidden />
                    </div>
                    <div className="min-w-0 space-y-1 flex-1">
                      <p className="font-heading font-semibold text-foreground">Ongoing Huddl</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        A long-lived Huddl Board for work that continues over time. Best for project tracking, shared
                        planning, and Kanban-style workflows. One live board — no separate session history.
                      </p>
                    </div>
                    {huddlType === 'ongoing' && <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHuddlType('session');
                    setLayoutId('retro');
                  }}
                  className={cn(
                    'w-full text-left rounded-2xl border px-4 py-4 transition-all',
                    'hover:border-primary/50 hover:bg-muted/30',
                    huddlType === 'session'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/25 shadow-sm'
                      : 'border-border/80 bg-card'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'rounded-xl p-2 shrink-0',
                        huddlType === 'session' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <CalendarClock className="w-5 h-5" aria-hidden />
                    </div>
                    <div className="min-w-0 space-y-1 flex-1">
                      <p className="font-heading font-semibold text-foreground">Session Huddl</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        A repeatable Huddl Board for structured collaboration in rounds — retrospectives, brainstorms,
                        or weekly check-ins. Past sessions stay available as read-only history; new sessions start fresh.
                      </p>
                    </div>
                    {huddlType === 'session' && <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
                  </div>
                </button>
              </div>
            )}

            {step === 2 && huddlType === 'session' && (
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">How should sessions start?</p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSessionStartMode('manual')}
                      className={cn(
                        'rounded-xl border px-3 py-3 text-left text-sm transition-colors',
                        sessionStartMode === 'manual'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border/80 hover:bg-muted/40'
                      )}
                    >
                      <span className="font-medium">Manually</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">You start the next session when ready</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSessionStartMode('automatic')}
                      className={cn(
                        'rounded-xl border px-3 py-3 text-left text-sm transition-colors',
                        sessionStartMode === 'automatic'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border/80 hover:bg-muted/40'
                      )}
                    >
                      <span className="font-medium">Automatically</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">Based on a schedule (stored for later)</span>
                    </button>
                  </div>
                </div>
                {sessionStartMode === 'automatic' && (
                  <SessionScheduleFields
                    idPrefix="wizard-session-sched"
                    value={sessionScheduleForm}
                    onChange={patchSessionScheduleForm}
                  />
                )}
                <p className="text-xs text-muted-foreground rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                  Past sessions are saved and viewable anytime in read-only mode. New sessions start fresh from your layout
                  — previous Items are not copied by default.
                </p>
              </div>
            )}

            {step === 3 && (
              <div className="grid gap-3">
                {HUDDL_LAYOUT_LIST.map((layout) => {
                  const Icon = layout.id === 'blank' ? LayoutTemplate : LayoutGrid;
                  const selected = layoutId === layout.id;
                  return (
                    <button
                      key={layout.id}
                      type="button"
                      onClick={() => setLayoutId(layout.id)}
                      className={cn(
                        'w-full text-left rounded-2xl border px-4 py-4 transition-all',
                        'hover:border-primary/50 hover:bg-muted/30',
                        selected
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/25 shadow-sm'
                          : 'border-border/80 bg-card'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'rounded-xl p-2 shrink-0',
                            selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                          )}
                        >
                          <Icon className="w-5 h-5" aria-hidden />
                        </div>
                        <div className="min-w-0 space-y-1 flex-1">
                          <p className="font-heading font-semibold text-foreground">{layout.label} layout</p>
                          <p className="text-sm text-muted-foreground leading-relaxed">{layout.description}</p>
                          {layout.sectionTitles.length > 0 && (
                            <p className="text-xs text-muted-foreground pt-1">
                              Sections: {layout.sectionTitles.join(' · ')}
                            </p>
                          )}
                        </div>
                        {selected && <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                {isFirebaseAuth && !sessionUser?.uid && (
                  <p className="text-sm text-amber-800 dark:text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
                    Sign in with Google to create a <strong>personal</strong> Huddl Board.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setVisibility('personal');
                    setSelectedTeamIds([]);
                  }}
                  className={cn(
                    'w-full flex items-start gap-3 rounded-2xl border px-4 py-4 text-left transition-all',
                    'hover:border-primary/50',
                    visibility === 'personal'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/25'
                      : 'border-border/80'
                  )}
                >
                  <div className="rounded-xl p-2 bg-muted text-muted-foreground shrink-0">
                    <Lock className="w-5 h-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-heading font-semibold">Personal</p>
                    <p className="text-sm text-muted-foreground">
                      Private to you — not shared with other people. To collaborate, choose <strong>Share with a Circle</strong>{' '}
                      below.
                    </p>
                  </div>
                  {visibility === 'personal' && <Check className="w-5 h-5 text-primary shrink-0" />}
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility('teams')}
                  className={cn(
                    'w-full flex items-start gap-3 rounded-2xl border px-4 py-4 text-left transition-all',
                    'hover:border-primary/50',
                    visibility === 'teams'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/25'
                      : 'border-border/80'
                  )}
                >
                  <div className="rounded-xl p-2 bg-muted text-muted-foreground shrink-0">
                    <Users className="w-5 h-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-heading font-semibold">Share with a Circle</p>
                    <p className="text-sm text-muted-foreground">
                      Share this Huddl Board with everyone in the Circle(s) you choose.
                    </p>
                  </div>
                  {visibility === 'teams' && <Check className="w-5 h-5 text-primary shrink-0" />}
                </button>
                {visibility === 'teams' && (
                  <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <p className="text-xs font-medium text-muted-foreground">Your Circles</p>
                      {canCreateCircleHere && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl shrink-0 w-full sm:w-auto gap-1.5"
                          onClick={() => setCreateCircleOpen(true)}
                        >
                          <PlusCircle className="w-4 h-4 shrink-0" aria-hidden />
                          Create a new Circle
                        </Button>
                      )}
                    </div>
                    {teams.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        You’re not in any Circles yet.
                        {canCreateCircleHere ? (
                          <>
                            {' '}
                            Use <strong>Create a new Circle</strong> above, or go back and choose <strong>Personal</strong>.
                          </>
                        ) : (
                          <>
                            {' '}
                            Go back and choose <strong>Personal</strong>, or ask a Circle Lead to invite you.
                          </>
                        )}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {teams.map((t) => {
                          const checked = selectedTeamIds.includes(t.id);
                          return (
                            <li key={t.id} className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                id={`wizard-team-${t.id}`}
                                checked={checked}
                                onChange={() => toggleWizardTeam(t.id)}
                                className="h-4 w-4 rounded border-input"
                              />
                              <label htmlFor={`wizard-team-${t.id}`} className="text-sm cursor-pointer flex-1">
                                {t.name}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="rounded-2xl border border-border/60 bg-muted/20 divide-y divide-border/60 overflow-hidden text-sm">
                <div className="px-4 py-3 flex justify-between gap-4">
                  <span className="text-muted-foreground shrink-0">Name</span>
                  <span className="font-medium text-right text-foreground">{title.trim() || '—'}</span>
                </div>
                {(description || '').trim() ? (
                  <div className="px-4 py-3 flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                    <span className="text-muted-foreground shrink-0">Description</span>
                    <span className="text-foreground text-right sm:text-left">{description.trim()}</span>
                  </div>
                ) : null}
                <div className="px-4 py-3 flex justify-between gap-4">
                  <span className="text-muted-foreground">Huddl type</span>
                  <span className="font-medium text-right">
                    {huddlType === 'ongoing' ? 'Ongoing Huddl' : 'Session Huddl'}
                  </span>
                </div>
                {huddlType === 'session' ? (
                  <div className="px-4 py-3 flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                    <span className="text-muted-foreground shrink-0">Sessions</span>
                    <span className="font-medium text-right sm:text-left">
                      {sessionStartMode === 'manual'
                        ? 'Start manually'
                        : `Automatic · ${formatSessionScheduleSummary(builtSessionSchedule) || '—'}`}
                    </span>
                  </div>
                ) : null}
                <div className="px-4 py-3 flex justify-between gap-4">
                  <span className="text-muted-foreground">Layout</span>
                  <span className="font-medium text-right">{layoutPreset?.label ?? layoutId}</span>
                </div>
                <div className="px-4 py-3 flex justify-between gap-4">
                  <span className="text-muted-foreground">Visibility</span>
                  <span className="font-medium text-right">{selectedTeamLabel}</span>
                </div>
                <div className="px-4 py-3 flex items-start gap-2 text-xs text-muted-foreground">
                  <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-primary" aria-hidden />
                  <span>
                    {blankBoard ? (
                      <>
                        <strong className="text-foreground">No starter Sections</strong> — add Sections from the Huddl Board
                        when you’re ready.
                      </>
                    ) : (
                      <>
                        Starting Sections:{' '}
                        <strong className="text-foreground">{sectionTitles.join(' · ')}</strong>
                      </>
                    )}
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
                  disabled={createMutation.isPending || accessLoading}
                >
                  {createMutation.isPending ? 'Creating…' : 'Create Huddl Board'}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
