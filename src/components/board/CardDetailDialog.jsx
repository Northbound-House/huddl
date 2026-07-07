import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { History, MessageSquare, MoreVertical, Send, ThumbsUp, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import VoterAvatars from '@/components/board/VoterAvatars';
import ItemEnrichmentPanel from '@/components/board/ItemEnrichmentPanel';
import CardDetailLabelsMenu from '@/components/board/CardDetailLabelsMenu';
import ItemColorPicker from '@/components/board/ItemColorPicker';
import { trackEvent } from '@/lib/analytics';
import MarkdownContent from '@/components/ui/MarkdownContent';
import DescriptionRichTextEditor from '@/components/board/DescriptionRichTextEditor';
import { appendActivityLog, getItemTitle, sortCommentsNewestFirst } from '@/lib/itemModel';
import { formatWhenLabel, getCardCreatedAtIso, getCardUpdatedAtIso } from '@/lib/cardTimestamps';
import { emailInList, normalizeEmail } from '@/lib/email';
import { hueFromString, displayNameFromEmail } from '@/lib/voterDisplay';
import { LABEL_COLOR_STYLES } from '@/lib/labelPalette';

export default function CardDetailDialog({
  open,
  onOpenChange,
  card,
  boardLabels = [],
  onPatchCard,
  onCreateLabel,
  onUpdateBoardLabel,
  onVote,
  onDeleteCard,
  onAddComment,
  onCommentVote,
  currentUser,
  currentUserEmail,
  photoByEmail = {},
  readOnly = false,
}) {
  const [commentDraft, setCommentDraft] = useState('');
  const [commentEditorEpoch, setCommentEditorEpoch] = useState(0);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleInputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setCommentDraft('');
      setCommentEditorEpoch((e) => e + 1);
    }
  }, [open, card?.id]);

  useEffect(() => {
    if (!open) setTitleEditing(false);
  }, [open]);

  useEffect(() => {
    if (!card) return;
    setTitleDraft(getItemTitle(card));
    setTitleEditing(false);
  }, [card?.id]);

  useEffect(() => {
    if (!titleEditing) return;
    const id = requestAnimationFrame(() => titleInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [titleEditing]);

  const commentsRaw = card?.comments || [];
  const commentsDisplay = useMemo(
    () => sortCommentsNewestFirst(commentsRaw),
    [commentsRaw]
  );

  if (!card) return null;

  const createdIso = getCardCreatedAtIso(card);
  const updatedIso = getCardUpdatedAtIso(card);
  const createdLabel = formatWhenLabel(createdIso) ?? 'Not recorded';
  const updatedLabel = updatedIso ? formatWhenLabel(updatedIso) : null;

  const handleSendComment = async () => {
    const text = commentDraft.trim();
    if (!text) return;
    const authorEmail = normalizeEmail(currentUser?.email || '');
    await onAddComment(card, {
      text,
      author_name: currentUser?.full_name || 'Anonymous',
      ...(authorEmail ? { author_email: authorEmail } : {}),
      created_at: new Date().toISOString(),
    });
    setCommentDraft('');
    setCommentEditorEpoch((e) => e + 1);
  };

  const handleDelete = async () => {
    await onDeleteCard(card.id);
    onOpenChange(false);
  };

  const patchWithActivity = async (partial, activitySummary) => {
    if (!onPatchCard) return;
    const next = {
      ...partial,
      updated_at: new Date().toISOString(),
    };
    if (activitySummary) {
      next.activity_log = appendActivityLog(card, {
        summary: activitySummary,
        actor_email: currentUserEmail || currentUser?.email,
      });
    }
    await onPatchCard(next);
  };

  const commitTitle = async () => {
    if (!onPatchCard || readOnly) {
      setTitleEditing(false);
      return;
    }
    const t = titleDraft.trim();
    if (!t) {
      toast.error('Item title cannot be empty');
      setTitleDraft(getItemTitle(card));
      setTitleEditing(false);
      return;
    }
    if (t === getItemTitle(card)) {
      setTitleEditing(false);
      return;
    }
    await patchWithActivity({ title: t, content: t }, 'Updated Item title');
    setTitleEditing(false);
  };

  const authorLabel = card.author_name || 'Unknown';
  const createdByMe =
    Boolean(currentUser?.full_name) && authorLabel === currentUser.full_name;
  const authorPhotoUrl = createdByMe
    ? currentUser?.photoURL || currentUser?.photoUrl || null
    : null;

  const hasVoters = (card.voted_by || []).length > 0;
  const activityLog = card.activity_log || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[calc(100vw-1rem)] sm:max-w-5xl h-[min(90vh,800px)] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b border-border/60 pr-14">
          <div className="flex gap-3 items-start">
            {onPatchCard && !readOnly ? (
              <div className="shrink-0 pt-1">
                <ItemColorPicker
                  variant="swatch"
                  coverStyle={card.cover_style}
                  disabled={readOnly}
                  onSelect={async (key) => {
                    if (key == null) {
                      try {
                        await patchWithActivity(
                          { cover_style: { type: 'none' } },
                          card.cover_style?.type === 'color' ? 'Cleared Item color' : undefined
                        );
                        trackEvent('item_color', { action: 'clear' });
                      } catch {
                        /* silent */
                      }
                    } else {
                      try {
                        await patchWithActivity(
                          { cover_style: { type: 'color', value: key } },
                          'Set Item color'
                        );
                        trackEvent('item_color', { action: 'set', color_key: key });
                      } catch {
                        /* silent */
                      }
                    }
                  }}
                />
              </div>
            ) : (
              <div
                className={cn(
                  'h-6 w-6 shrink-0 rounded-full border-2 border-border/50 shadow-sm ring-1 ring-black/10 mt-1',
                  card.cover_style?.type === 'color' && card.cover_style?.value
                    ? LABEL_COLOR_STYLES[card.cover_style.value]?.bar ?? 'bg-muted'
                    : 'bg-muted'
                )}
                aria-hidden
              />
            )}
            <div className="min-w-0 flex-1 space-y-2 text-left">
              <DialogTitle asChild>
                <div
                  className={cn(
                    'text-left font-heading text-xl sm:text-2xl leading-snug break-words pr-1 min-w-0',
                    !readOnly && onPatchCard && !titleEditing && 'cursor-text select-text'
                  )}
                  title={!readOnly && onPatchCard ? 'Double-click to edit title' : undefined}
                  onDoubleClick={(e) => {
                    if (readOnly || !onPatchCard || titleEditing) return;
                    e.preventDefault();
                    setTitleDraft(getItemTitle(card));
                    setTitleEditing(true);
                  }}
                >
                  {titleEditing ? (
                    <input
                      ref={titleInputRef}
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onBlur={() => void commitTitle()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void commitTitle();
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setTitleDraft(getItemTitle(card));
                          setTitleEditing(false);
                        }
                      }}
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 font-heading text-xl sm:text-2xl leading-snug"
                      aria-label="Item title"
                    />
                  ) : (
                    <span className="block">{getItemTitle(card)}</span>
                  )}
                </div>
              </DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  <span
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-background text-xs font-semibold text-white shadow-sm ring-1 ring-black/10"
                    style={
                      authorPhotoUrl
                        ? undefined
                        : {
                            backgroundColor: `hsl(${hueFromString(authorLabel)} 52% 42%)`,
                          }
                    }
                  >
                    {authorPhotoUrl ? (
                      <img src={authorPhotoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="select-none">
                        {(() => {
                          const p = authorLabel.trim().split(/\s+/).filter(Boolean);
                          if (p.length >= 2) return `${p[0][0]}${p[1][0]}`.toUpperCase();
                          return (p[0] || '?').slice(0, 2).toUpperCase();
                        })()}
                      </span>
                    )}
                  </span>
                  <span className="font-medium text-foreground/90">{authorLabel}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>{createdLabel}</span>
                </div>
              </DialogDescription>
              <div className="pt-0.5 flex flex-wrap items-center gap-1.5">
                <CardDetailLabelsMenu
                  card={card}
                  boardLabels={boardLabels}
                  onPatch={onPatchCard ? (partial) => onPatchCard(partial) : undefined}
                  onCreateLabel={onCreateLabel}
                  onUpdateBoardLabel={onUpdateBoardLabel}
                  currentUser={currentUser}
                  currentUserEmail={currentUserEmail}
                  readOnly={readOnly}
                />
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                      title="Activity history"
                      aria-label="Activity history"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="z-[320] w-80 max-h-64 overflow-y-auto p-2"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                  >
                    <p className="px-1 pb-2 text-[11px] font-medium text-muted-foreground">Activity</p>
                    {activityLog.length === 0 ? (
                      <p className="px-1 text-xs text-muted-foreground">No activity yet.</p>
                    ) : (
                      <ul className="space-y-1.5 text-xs text-muted-foreground">
                        {[...activityLog].reverse().map((entry) => (
                          <li key={entry.id}>
                            <span className="text-foreground/90">{entry.summary}</span>
                            {entry.actor_email ? (
                              <span className="ml-1 opacity-80">· {entry.actor_email}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1 pt-0.5">
              <div className="flex items-center gap-1">
                {!readOnly && (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                        aria-label="Item actions"
                        title="Item actions"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-[320] w-52 rounded-xl p-1">
                      <DropdownMenuItem
                        className="rounded-lg cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                        onSelect={(e) => {
                          e.preventDefault();
                          void handleDelete();
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2 shrink-0" />
                        Delete Item…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-full"
                    onClick={() => onVote(card)}
                    aria-label={emailInList(card.voted_by, currentUserEmail) ? 'Unlike' : 'Like'}
                    title={emailInList(card.voted_by, currentUserEmail) ? 'Unlike' : 'Like'}
                  >
                    <ThumbsUp
                      className={cn(
                        'h-4 w-4',
                        emailInList(card.voted_by, currentUserEmail) && 'text-primary fill-primary/20'
                      )}
                    />
                  </Button>
                )}
                {hasVoters ? (
                  <VoterAvatars
                    emails={card.voted_by}
                    sessionUser={currentUser}
                    photoByEmail={photoByEmail}
                    size="xs"
                    max={20}
                    showOverflowCount
                    tooltipLabelForEmail={(email) => {
                      const n = normalizeEmail(email);
                      const me = currentUserEmail ? normalizeEmail(currentUserEmail) : '';
                      if (me && n === me && currentUser?.full_name?.trim()) {
                        return currentUser.full_name.trim();
                      }
                      const entry = n && photoByEmail[n] != null ? photoByEmail[n] : null;
                      if (entry && typeof entry === 'object' && entry.display_name?.trim()) {
                        return entry.display_name.trim();
                      }
                      return displayNameFromEmail(email) || email;
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row lg:items-stretch">
          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto px-6 py-4 space-y-5 border-b lg:border-b-0 lg:border-r border-border/60">
            {onPatchCard && (
              <ItemEnrichmentPanel
                card={card}
                onPatch={(partial) => onPatchCard(partial)}
                currentUser={currentUser}
                currentUserEmail={currentUserEmail}
                readOnly={readOnly}
              />
            )}
          </div>

          <aside className="w-full lg:w-[min(100%,520px)] lg:min-w-[400px] xl:min-w-[440px] shrink-0 flex flex-col min-h-[min(40vh,320px)] lg:min-h-0 bg-muted/20 border-t lg:border-t-0 lg:border-l border-border/60">
            <div className="px-4 py-3 border-b border-border/50 shrink-0">
              <h3 className="text-sm font-semibold flex items-center gap-2 font-heading">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                Conversation
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Replies and likes for this Item.</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3">
              {commentsDisplay.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages yet. Start the Conversation below.</p>
              ) : (
                <ul className="space-y-3">
                  {commentsDisplay.map((c) => {
                    const originalIndex = commentsRaw.indexOf(c);
                    const commentTime = formatWhenLabel(c.created_at ?? c.createdAt);
                    const likeCount = c.votes ?? c.voted_by?.length ?? 0;
                    return (
                      <li
                        key={`${originalIndex}-${c.created_at ?? ''}`}
                        className="text-sm rounded-lg border border-border/40 bg-background/80 p-3"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-foreground">{c.author_name}</span>
                            {commentTime && (
                              <span className="text-xs text-muted-foreground ml-2">{commentTime}</span>
                            )}
                            <div className="mt-1">
                              <MarkdownContent>{c.text}</MarkdownContent>
                            </div>
                          </div>
                          {!readOnly && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="shrink-0 rounded-lg h-9 w-fit self-start"
                              onClick={() => {
                                if (originalIndex < 0) return;
                                onCommentVote(card, originalIndex);
                              }}
                              title={emailInList(c.voted_by, currentUserEmail) ? 'Unlike' : 'Like in Conversation'}
                            >
                              <ThumbsUp
                                className={cn(
                                  'w-4 h-4 mr-1.5',
                                  emailInList(c.voted_by, currentUserEmail) && 'text-primary fill-primary/20'
                                )}
                              />
                              {likeCount}
                            </Button>
                          )}
                          {readOnly && likeCount > 0 && (
                            <span className="text-xs text-muted-foreground shrink-0">{likeCount} likes</span>
                          )}
                        </div>
                        {(c.voted_by || []).length > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                            <VoterAvatars
                              emails={c.voted_by}
                              sessionUser={currentUser}
                              photoByEmail={photoByEmail}
                              size="sm"
                              max={8}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {!readOnly && (
                <>
                  <div className="mt-auto pt-2 border-t border-border/40 space-y-2">
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 min-w-0">
                        <DescriptionRichTextEditor
                          key={`comment-${card.id}-${commentEditorEpoch}`}
                          cardId={`${card.id}-comment-${commentEditorEpoch}`}
                          markdown={commentDraft}
                          onMarkdownChange={setCommentDraft}
                          readOnly={readOnly}
                          debounceMs={0}
                          compact
                          placeholder="Start a Conversation…"
                          onModEnter={handleSendComment}
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        className="shrink-0 rounded-xl h-10 w-10"
                        onClick={handleSendComment}
                        aria-label="Send Conversation reply"
                        disabled={!commentDraft.trim()}
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Formatting toolbar above · ⌘/Ctrl+Enter to send
                  </p>
                </>
              )}
            </div>
          </aside>
        </div>

        <DialogFooter className="flex flex-row flex-wrap items-center justify-between gap-3 border-t border-border/60 px-6 py-4 shrink-0">
          <div className="min-w-0 flex-1 text-xs text-muted-foreground">
            {updatedLabel ? <span>Updated {updatedLabel}</span> : null}
          </div>
          {readOnly ? (
            <Button type="button" variant="secondary" className="rounded-xl shrink-0" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
