import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import {
  GripHorizontal,
  GripVertical,
  MessageSquare,
  MoreVertical,
  Pencil,
  Plus,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { emailInList } from '@/lib/email';
import CardDetailDialog from '@/components/board/CardDetailDialog';
import ItemCardContextMenu from '@/components/board/ItemCardContextMenu';
import VoterAvatars from '@/components/board/VoterAvatars';
import { LABEL_COLOR_STYLES, labelChipClasses } from '@/lib/labelPalette';
import { conversationCount, getItemTitle } from '@/lib/itemModel';

export default function BoardColumnComponent({
  column,
  cards,
  columnProvided,
  columnSnapshot,
  onAddCard,
  onVote,
  onDeleteCard,
  onAddComment,
  onCommentVote,
  onUpdateCardContent,
  onPatchCard,
  onCreateBoardLabel,
  onUpdateBoardLabel,
  boardLabels = [],
  focusItemId = null,
  getItemDeepLink,
  onItemDetailOpen,
  onItemDetailClose,
  onRenameColumn,
  onDeleteColumn,
  currentUser,
  currentUserEmail,
  photoByEmail = {},
  readOnly = false,
  /** Only Huddl Board administrators (Circle Leads or personal owner) may delete Sections. */
  canDeleteColumn = false,
}) {
  const [draft, setDraft] = useState('');
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [detailCardId, setDetailCardId] = useState(null);
  /** Right-click menu: position + which Item (by id) */
  const [cardMenu, setCardMenu] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(column.title);
  const editTextareaRef = useRef(null);
  const addCardTextareaRef = useRef(null);
  const titleInputRef = useRef(null);
  const singleClickTimerRef = useRef(null);

  const sorted = useMemo(() => [...cards].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [cards]);
  const detailCard = detailCardId ? sorted.find((c) => c.id === detailCardId) : null;

  const labelById = useMemo(() => {
    const m = {};
    for (const lb of boardLabels) m[lb.id] = lb;
    return m;
  }, [boardLabels]);

  const contextMenuCard = useMemo(
    () => (cardMenu?.cardId ? sorted.find((c) => c.id === cardMenu.cardId) ?? null : null),
    [cardMenu?.cardId, sorted]
  );

  useEffect(() => {
    if (!cardMenu?.cardId) return;
    if (!sorted.some((c) => c.id === cardMenu.cardId)) setCardMenu(null);
  }, [sorted, cardMenu?.cardId]);

  useEffect(() => {
    if (!focusItemId) return;
    if (sorted.some((c) => c.id === focusItemId)) {
      setDetailCardId(focusItemId);
    }
  }, [focusItemId, sorted]);

  useEffect(() => {
    setTitleDraft(column.title);
  }, [column.title]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    if (editingCardId && editTextareaRef.current) {
      editTextareaRef.current.focus();
      editTextareaRef.current.select();
    }
  }, [editingCardId]);

  useEffect(() => {
    if (addCardOpen && addCardTextareaRef.current) {
      addCardTextareaRef.current.focus();
    }
  }, [addCardOpen]);

  useEffect(() => {
    if (detailCardId && !sorted.some((c) => c.id === detailCardId)) {
      setDetailCardId(null);
      onItemDetailClose?.();
    }
  }, [sorted, detailCardId, onItemDetailClose]);

  useEffect(() => {
    return () => {
      if (singleClickTimerRef.current) clearTimeout(singleClickTimerRef.current);
    };
  }, []);

  const openItemDetail = (cardId) => {
    setDetailCardId(cardId);
    onItemDetailOpen?.(cardId);
  };

  const beginEdit = (card) => {
    setDetailCardId(null);
    onItemDetailClose?.();
    setEditingCardId(card.id);
    setEditDraft(getItemTitle(card));
  };

  const cancelEdit = () => {
    setEditingCardId(null);
    setEditDraft('');
  };

  const saveEdit = async (card) => {
    const next = editDraft.trim();
    if (!next) return;
    await onUpdateCardContent(card.id, editDraft);
    setEditingCardId(null);
    setEditDraft('');
  };

  const handleCardBodyClick = (e, card) => {
    if (readOnly) {
      openItemDetail(card.id);
      return;
    }
    if (e.detail === 2) {
      e.preventDefault();
      if (singleClickTimerRef.current) {
        clearTimeout(singleClickTimerRef.current);
        singleClickTimerRef.current = null;
      }
      beginEdit(card);
      return;
    }
    if (e.detail === 1) {
      singleClickTimerRef.current = setTimeout(() => {
        openItemDetail(card.id);
        singleClickTimerRef.current = null;
      }, 280);
    }
  };

  const handleSubmitCard = async (e) => {
    e.preventDefault();
    if (readOnly) return;
    const text = draft.trim();
    if (!text) return;
    await onAddCard(column.id, text);
    setDraft('');
    setAddCardOpen(false);
  };

  const saveTitle = async () => {
    const t = titleDraft.trim();
    if (!t) {
      setTitleDraft(column.title);
      setEditingTitle(false);
      return;
    }
    if (t !== column.title) {
      await onRenameColumn(column.id, t);
    }
    setEditingTitle(false);
  };

  const cancelTitleEdit = () => {
    setTitleDraft(column.title);
    setEditingTitle(false);
  };

  const rootClass = cn(
    'group/column flex flex-col h-full min-h-0 w-[min(100vw-2rem,320px)] shrink-0 rounded-2xl border border-border/60 bg-card shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]',
    columnSnapshot?.isDragging && 'ring-2 ring-primary/50 shadow-lg opacity-[0.98]'
  );

  return (
    <div
      ref={columnProvided.innerRef}
      {...columnProvided.draggableProps}
      className={rootClass}
    >
      <div className="shrink-0 rounded-t-2xl bg-gradient-to-b from-muted/50 to-muted/20 border-b border-border/50 px-2.5 py-2 flex items-start gap-1">
        {!readOnly ? (
          <button
            type="button"
            className="shrink-0 mt-1 p-2 rounded-xl text-muted-foreground/70 hover:text-muted-foreground hover:bg-background/80 cursor-grab active:cursor-grabbing touch-none opacity-70 group-hover/column:opacity-100 transition-opacity"
            aria-label="Drag to reorder Section"
            title="Drag to reorder Section"
            {...columnProvided.dragHandleProps}
          >
            <GripHorizontal className="w-4 h-4" />
          </button>
        ) : (
          <span className="shrink-0 w-10" aria-hidden />
        )}
        <div className="flex-1 min-w-0 pt-0.5">
          {editingTitle ? (
            <div className="space-y-1.5">
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="w-full font-heading font-semibold text-[15px] leading-snug rounded-xl border-2 border-primary/40 bg-background px-3 py-2 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
                placeholder="Section name"
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelTitleEdit();
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveTitle();
                  }
                }}
                onBlur={() => saveTitle()}
              />
              <p className="text-[10px] text-muted-foreground px-0.5">
                Enter to save · Esc to cancel
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-1 min-w-0">
              <div
                className={cn(
                  'flex-1 min-w-0 text-left rounded-xl px-2.5 py-2 -mx-1',
                  readOnly && 'cursor-default'
                )}
                onDoubleClick={() => !readOnly && setEditingTitle(true)}
                title={readOnly ? undefined : 'Double-click to rename Section'}
                aria-label={`Section: ${column.title}. Double-click to rename.`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="font-heading font-semibold text-[15px] text-foreground tracking-tight truncate">
                    {column.title}
                  </h2>
                  <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground bg-background/70 border border-border/50 px-1.5 py-0.5 rounded-md">
                    {sorted.length}
                  </span>
                </div>
              </div>
              {!readOnly && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-background/90"
                      aria-label="Section options"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 rounded-xl">
                    <DropdownMenuItem
                      className="rounded-lg cursor-pointer"
                      onSelect={() => setEditingTitle(true)}
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      Rename Section
                    </DropdownMenuItem>
                    {canDeleteColumn && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="rounded-lg cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                          onSelect={() => onDeleteColumn(column)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Section…
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
      </div>

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              'flex-1 min-h-0 px-3 pt-3 pb-2 space-y-2 overflow-y-auto overscroll-contain',
              snapshot.isDraggingOver && 'bg-muted/40'
            )}
          >
            {sorted.map((card, index) => (
              <Draggable
                key={card.id}
                draggableId={card.id}
                index={index}
                isDragDisabled={readOnly || editingCardId === card.id}
              >
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    className={cn(
                      'rounded-xl border border-border/70 bg-background/80 p-2 shadow-sm transition-shadow flex gap-1.5',
                      dragSnapshot.isDragging && 'shadow-lg ring-2 ring-primary/30',
                      card.archived_at && 'opacity-75 border-dashed',
                      card.completed_at && 'opacity-90'
                    )}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCardMenu({ cardId: card.id, x: e.clientX, y: e.clientY });
                    }}
                  >
                    {!readOnly ? (
                      <button
                        type="button"
                        className={cn(
                          'shrink-0 mt-0.5 p-1 rounded-lg text-muted-foreground hover:bg-muted/80 cursor-grab active:cursor-grabbing touch-none',
                          editingCardId === card.id && 'opacity-40 pointer-events-none'
                        )}
                        aria-label="Drag to reorder Item"
                        {...dragProvided.dragHandleProps}
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="shrink-0 w-6" aria-hidden />
                    )}

                    <div className="flex-1 min-w-0 pt-0.5">
                      {editingCardId === card.id && !readOnly ? (
                        <div className="space-y-2" onMouseDown={(e) => e.stopPropagation()}>
                          <textarea
                            ref={editTextareaRef}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            rows={4}
                            className="w-full resize-y min-h-[5rem] rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelEdit();
                              }
                              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                saveEdit(card);
                              }
                            }}
                          />
                          <div className="flex gap-2 justify-end">
                            <Button type="button" variant="outline" size="sm" className="rounded-lg h-7 text-xs" onClick={cancelEdit}>
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="rounded-lg h-7 text-xs"
                              disabled={!editDraft.trim()}
                              onClick={() => saveEdit(card)}
                            >
                              Save
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">⌘/Ctrl+Enter to save · Esc to cancel</p>
                        </div>
                      ) : (
                        <>
                          <div
                            tabIndex={0}
                            className="text-left rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer select-none"
                            aria-label="View Item details. Double-click to edit."
                            onClick={(e) => handleCardBodyClick(e, card)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openItemDetail(card.id);
                              }
                            }}
                          >
                            {card.cover_style?.type === 'color' && card.cover_style?.value ? (
                              <div
                                className={cn(
                                  '-mx-0.5 -mt-0.5 mb-2 h-1.5 rounded-md',
                                  LABEL_COLOR_STYLES[card.cover_style.value]?.bar ?? LABEL_COLOR_STYLES.gray.bar
                                )}
                                aria-hidden
                              />
                            ) : null}
                            {(card.label_ids || []).length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1.5">
                                {(card.label_ids || []).map((lid) => {
                                  const lb = labelById[lid];
                                  if (!lb) return null;
                                  return (
                                    <span
                                      key={lid}
                                      className={cn('rounded-full px-1.5 py-px text-[10px] font-medium max-w-[140px] truncate', labelChipClasses(lb.color))}
                                      title={lb.name}
                                    >
                                      {lb.name}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            <p
                              className={cn(
                                'text-sm text-foreground whitespace-pre-wrap leading-snug',
                                card.completed_at && 'line-through text-muted-foreground'
                              )}
                            >
                              {getItemTitle(card)}
                            </p>
                            {card.archived_at && (
                              <span className="mt-1 inline-block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Archived
                              </span>
                            )}
                            <div className="mt-2 space-y-2">
                              <p className="text-[11px] text-muted-foreground w-full min-w-0 break-words leading-snug">
                                {card.author_name}
                              </p>
                              {(!readOnly || conversationCount(card) > 0) && (
                              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 min-h-[1.75rem]">
                                <div className="flex items-center gap-2 min-w-0">
                                  {conversationCount(card) > 0 && (
                                    <span
                                      role="status"
                                      className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
                                      title={`${conversationCount(card)} ${conversationCount(card) === 1 ? 'reply' : 'replies'} — open Item for Conversation`}
                                      aria-label={`${conversationCount(card)} ${conversationCount(card) === 1 ? 'reply' : 'replies'} in Conversation; open Item details to read`}
                                    >
                                      <MessageSquare className="w-3 h-3 text-primary/80" aria-hidden />
                                      {conversationCount(card)}
                                    </span>
                                  )}
                                </div>
                                {!readOnly && (
                                  <div
                                    className="flex items-center gap-0.5 shrink-0 ml-auto"
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => e.stopPropagation()}
                                  >
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 rounded-lg text-muted-foreground"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        beginEdit(card);
                                      }}
                                      aria-label="Edit Item"
                                      title="Edit Item"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                    <div className="flex items-center gap-1 max-w-[min(120px,40vw)]">
                                      {(card.voted_by || []).length > 0 && (
                                        <VoterAvatars
                                          emails={card.voted_by}
                                          sessionUser={currentUser}
                                          photoByEmail={photoByEmail}
                                          size="sm"
                                          max={4}
                                          className="shrink min-w-0"
                                        />
                                      )}
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs rounded-lg shrink-0"
                                        onClick={() => onVote(card)}
                                        title={emailInList(card.voted_by, currentUserEmail) ? 'Remove vote' : 'Vote'}
                                      >
                                        <ThumbsUp
                                          className={cn(
                                            'w-3.5 h-3.5 mr-1',
                                            emailInList(card.voted_by, currentUserEmail) && 'text-primary fill-primary/20'
                                          )}
                                        />
                                        {card.votes ?? 0}
                                      </Button>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive"
                                      onClick={() => onDeleteCard(card.id)}
                                      aria-label="Delete Item"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              )}
                            </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}

                    </div>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {!readOnly && (
        <div className="shrink-0 border-t border-border/60 bg-muted/20 rounded-b-2xl">
          {!addCardOpen ? (
            <div className="p-2">
              <Button
                type="button"
                variant="ghost"
                className="w-full h-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-background/90 [&_svg]:size-5"
                aria-expanded={false}
                aria-label={`Add an Item to ${column.title}`}
                title="Add Item"
                onClick={() => setAddCardOpen(true)}
              >
                <Plus className="w-5 h-5" strokeWidth={2.25} />
                <span className="sr-only">Add Item</span>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmitCard} className="p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span className="min-w-0">
                  Add to <span className="font-medium text-foreground/80">«{column.title}»</span>
                </span>
              </div>
              <textarea
                ref={addCardTextareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write an Item…"
                rows={3}
                className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setDraft('');
                    setAddCardOpen(false);
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (draft.trim()) {
                      void handleSubmitCard(e);
                    }
                  }
                }}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => {
                    setDraft('');
                    setAddCardOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 rounded-xl" disabled={!draft.trim()}>
                  Add Item
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      <ItemCardContextMenu
        open={cardMenu != null && contextMenuCard != null}
        x={cardMenu?.x ?? 0}
        y={cardMenu?.y ?? 0}
        card={contextMenuCard}
        boardLabels={boardLabels}
        readOnly={readOnly}
        currentUserEmail={currentUserEmail}
        onClose={() => setCardMenu(null)}
        onPatchCard={onPatchCard}
        getItemDeepLink={getItemDeepLink}
        onCreateBoardLabel={onCreateBoardLabel}
      />

      <CardDetailDialog
        open={Boolean(detailCard)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailCardId(null);
            onItemDetailClose?.();
          }
        }}
        card={detailCard}
        boardLabels={boardLabels}
        onPatchCard={detailCard && onPatchCard ? (partial) => onPatchCard(detailCard.id, partial) : undefined}
        onCreateLabel={onCreateBoardLabel}
        onUpdateBoardLabel={onUpdateBoardLabel}
        onVote={onVote}
        onDeleteCard={onDeleteCard}
        onAddComment={onAddComment}
        onCommentVote={onCommentVote}
        currentUser={currentUser}
        currentUserEmail={currentUserEmail}
        photoByEmail={photoByEmail}
        readOnly={readOnly}
      />
    </div>
  );
}
