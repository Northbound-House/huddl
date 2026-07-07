import React, { useMemo, useRef, useState } from 'react';
import { Check, Tag } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LABEL_COLOR_KEYS, LABEL_COLOR_STYLES, labelChipClasses } from '@/lib/labelPalette';
import { trackEvent } from '@/lib/analytics';
import { appendActivityLog } from '@/lib/itemModel';

/**
 * Trello-style labels: compact chips in the card header + pop-out checklist to toggle / create / set colors.
 * Label board colors use a Radix submenu (DropdownMenuSub) so nested pickers don’t fight the parent menu.
 */
export default function CardDetailLabelsMenu({
  card,
  boardLabels = [],
  onPatch,
  onCreateLabel,
  onUpdateBoardLabel,
  currentUser,
  currentUserEmail,
  readOnly = false,
}) {
  const [newLabelName, setNewLabelName] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const cardRef = useRef(card);
  cardRef.current = card;

  const labelById = useMemo(() => {
    const m = {};
    for (const l of boardLabels) m[l.id] = l;
    return m;
  }, [boardLabels]);

  const selectedIds = card.label_ids || [];
  const selectedLabels = useMemo(
    () => selectedIds.map((id) => labelById[id]).filter(Boolean),
    [selectedIds, labelById]
  );

  const patch = async (partial, summary) => {
    if (readOnly || !onPatch) return;
    const c = cardRef.current;
    const next = { ...partial, updated_at: new Date().toISOString() };
    if (summary) {
      next.activity_log = appendActivityLog(c, {
        summary,
        actor_email: currentUserEmail || currentUser?.email,
      });
    }
    await onPatch(next);
  };

  const toggleLabel = async (labelId) => {
    const set = new Set(selectedIds);
    if (set.has(labelId)) {
      set.delete(labelId);
      await patch(
        { label_ids: [...set] },
        `Removed label ${labelById[labelId]?.name ?? ''}`.trim()
      );
      trackEvent('item_label_toggle', { action: 'remove' });
    } else {
      set.add(labelId);
      await patch(
        { label_ids: [...set] },
        `Added label ${labelById[labelId]?.name ?? ''}`.trim()
      );
      trackEvent('item_label_toggle', { action: 'add' });
    }
  };

  const addNewLabel = async () => {
    const n = newLabelName.trim();
    if (!n || !onCreateLabel) return;
    const created = await onCreateLabel({ name: n });
    setNewLabelName('');
    const ids = [...new Set([...(card.label_ids || []), created.id])];
    await patch({ label_ids: ids }, `Added label ${n}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
      {selectedLabels.map((lb) => (
        <span
          key={lb.id}
          className={cn(
            'max-w-[140px] truncate rounded-md px-2 py-0.5 text-[11px] font-medium border border-border/40',
            labelChipClasses(lb.color)
          )}
          title={lb.name}
        >
          {lb.name}
        </span>
      ))}

      {!readOnly && typeof onPatch === 'function' && (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0 rounded-lg border-dashed"
              aria-label="Edit labels"
              title="Labels"
            >
              <Tag className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="z-[310] w-72 p-2"
            align="start"
            sideOffset={6}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <p className="px-1 pb-2 text-[11px] font-medium text-muted-foreground">Labels</p>
            <div className="max-h-56 space-y-0.5 overflow-y-auto pr-0.5">
              {boardLabels.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">No labels on this board yet.</p>
              ) : (
                boardLabels.map((lb) => {
                  const on = selectedIds.includes(lb.id);
                  return (
                    <DropdownMenuGroup
                      key={lb.id}
                      className="flex w-full min-w-0 flex-row items-stretch gap-0"
                    >
                      <DropdownMenuItem
                        className="min-w-0 flex-1 cursor-pointer rounded-l-md rounded-r-none px-1.5 py-1.5 focus:bg-accent data-[highlighted]:bg-accent"
                        onSelect={(e) => {
                          e.preventDefault();
                          void toggleLabel(lb.id);
                        }}
                      >
                        <div className="flex w-full min-w-0 items-center gap-2">
                          <Check className={cn('h-4 w-4 shrink-0 text-primary', on ? 'opacity-100' : 'opacity-20')} />
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-xs font-medium',
                              labelChipClasses(lb.color)
                            )}
                          >
                            {lb.name}
                          </span>
                        </div>
                      </DropdownMenuItem>
                      {onUpdateBoardLabel ? (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger
                            className={cn(
                              'flex h-auto min-h-8 w-9 shrink-0 items-center justify-center rounded-l-none rounded-r-md border border-transparent px-0 outline-none',
                              'hover:bg-accent focus:bg-accent data-[state=open]:bg-accent'
                            )}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <span
                              className={cn(
                                'h-5 w-5 rounded-full border border-border/40 ring-1 ring-black/5',
                                LABEL_COLOR_STYLES[lb.color]?.bar ?? 'bg-muted'
                              )}
                              aria-hidden
                            />
                            <span className="sr-only">Label color for {lb.name}</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent
                            className="z-[400] p-2"
                            side="right"
                            align="start"
                            sideOffset={6}
                            alignOffset={0}
                            onCloseAutoFocus={(e) => e.preventDefault()}
                          >
                            <div className="flex flex-wrap gap-1">
                              {LABEL_COLOR_KEYS.map((key) => (
                                <button
                                  key={key}
                                  type="button"
                                  title={key}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void onUpdateBoardLabel(lb.id, { color: key });
                                  }}
                                  className={cn(
                                    'h-7 w-7 rounded-md border-2 transition-transform hover:scale-105',
                                    LABEL_COLOR_STYLES[key]?.bar ?? '',
                                    lb.color === key ? 'ring-2 ring-primary ring-offset-1' : 'border-transparent'
                                  )}
                                />
                              ))}
                            </div>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      ) : null}
                    </DropdownMenuGroup>
                  );
                })
              )}
            </div>

            {onCreateLabel && (
              <>
                <DropdownMenuSeparator />
                <div
                  className="flex gap-1.5 pt-1"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <input
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void addNewLabel();
                      }
                    }}
                    placeholder="Create new label…"
                    className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 shrink-0 px-2 text-xs"
                    disabled={!newLabelName.trim()}
                    onClick={() => void addNewLabel()}
                  >
                    Add
                  </Button>
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
