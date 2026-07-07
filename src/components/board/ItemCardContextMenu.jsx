import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, Link2, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LABEL_COLOR_KEYS, LABEL_COLOR_STYLES, labelChipClasses } from '@/lib/labelPalette';
import { trackEvent } from '@/lib/analytics';
import { appendActivityLog } from '@/lib/itemModel';

/**
 * Right-click: copy link, Item color (expandable), labels, quick-add new label.
 */
export default function ItemCardContextMenu({
  open,
  x,
  y,
  card,
  boardLabels = [],
  readOnly,
  currentUserEmail,
  onClose,
  onPatchCard,
  getItemDeepLink,
  onCreateBoardLabel,
}) {
  const ref = useRef(null);
  const [itemColorOpen, setItemColorOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setItemColorOpen(false);
      setNewLabelName('');
    }
  }, [open]);

  if (!open || !card) return null;

  const patch = async (partial, summary) => {
    if (readOnly || !onPatchCard) return;
    const next = { ...partial, updated_at: new Date().toISOString() };
    if (summary) {
      next.activity_log = appendActivityLog(card, {
        summary,
        actor_email: currentUserEmail,
      });
    }
    await onPatchCard(card.id, next);
  };

  const toggleLabel = async (labelId, labelName) => {
    const ids = new Set(card.label_ids || []);
    if (ids.has(labelId)) {
      ids.delete(labelId);
      await patch({ label_ids: [...ids] }, `Removed label ${labelName || ''}`.trim());
      trackEvent('item_label_toggle', { action: 'remove' });
    } else {
      ids.add(labelId);
      await patch({ label_ids: [...ids] }, `Added label ${labelName || ''}`.trim());
      trackEvent('item_label_toggle', { action: 'add' });
    }
  };

  const addNewLabel = async () => {
    const n = newLabelName.trim();
    if (!n || !onCreateBoardLabel) return;
    try {
      const created = await onCreateBoardLabel({ name: n });
      const merged = [...new Set([...(card.label_ids || []), created.id])];
      await patch({ label_ids: merged }, `Added label ${n}`);
      setNewLabelName('');
      toast.success('Label added');
    } catch {
      toast.error('Could not create label');
    }
  };

  const w = typeof window !== 'undefined' ? window.innerWidth : 400;
  const h = typeof window !== 'undefined' ? window.innerHeight : 600;
  const menuW = 280;
  const menuH = 420;
  const left = Math.max(8, Math.min(x, w - menuW - 8));
  const top = Math.max(8, Math.min(y, h - menuH - 8));

  const deepLink = getItemDeepLink ? getItemDeepLink(card.id) : '';

  const copyLink = async () => {
    if (!deepLink) return;
    try {
      await navigator.clipboard.writeText(deepLink);
      toast.success('Link copied');
      onClose();
    } catch {
      toast.error('Could not copy link');
      onClose();
    }
  };

  const selectedIds = new Set(card.label_ids || []);
  const currentAccent = card.cover_style?.type === 'color' ? card.cover_style.value : null;

  const menu = (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[200] w-[min(280px,calc(100vw-16px))] rounded-xl border border-border bg-popover text-popover-foreground shadow-lg p-1.5"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted/80"
        onClick={copyLink}
      >
        <Link2 className="w-4 h-4 shrink-0 text-muted-foreground" />
        <span>Copy link to Item</span>
      </button>

      {!readOnly && (
        <>
          <div className="my-1 h-px bg-border/80" />

          <div className="rounded-lg">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted/80"
              onClick={() => setItemColorOpen((v) => !v)}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Palette className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      'h-4 w-4 shrink-0 rounded-full ring-2 ring-border/30',
                      currentAccent ? LABEL_COLOR_STYLES[currentAccent]?.bar : 'bg-muted'
                    )}
                  />
                  <span className="truncate text-xs text-muted-foreground">Item color</span>
                </span>
              </span>
              <ChevronRight className={cn('h-4 w-4 shrink-0 opacity-50 transition-transform', itemColorOpen && 'rotate-90')} />
            </button>
            {itemColorOpen && (
              <div className="px-2 pb-2 pt-0 flex flex-wrap gap-1 border-t border-border/40 mt-0.5 pt-2">
                <button
                  type="button"
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px] border',
                    !currentAccent ? 'border-primary bg-muted/50' : 'border-border/60 hover:bg-muted/40'
                  )}
                  onClick={async () => {
                    try {
                      await patch(
                        { cover_style: { type: 'none' } },
                        card.cover_style?.type === 'color' ? 'Cleared Item color' : undefined
                      );
                      trackEvent('item_color', { action: 'clear' });
                    } catch {
                      /* silent */
                    }
                  }}
                >
                  None
                </button>
                {LABEL_COLOR_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    title={key}
                    className={cn(
                      'h-7 w-7 rounded-md border-2 transition-transform',
                      LABEL_COLOR_STYLES[key]?.bar ?? '',
                      currentAccent === key ? 'ring-2 ring-primary ring-offset-1 scale-105' : 'border-transparent'
                    )}
                    onClick={async () => {
                      try {
                        await patch(
                          { cover_style: { type: 'color', value: key } },
                          'Set Item color'
                        );
                        trackEvent('item_color', { action: 'set', color_key: key });
                      } catch {
                        /* silent */
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="my-1 h-px bg-border/80" />

          <div className="px-2 py-1 max-h-40 overflow-y-auto">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Labels
            </div>
            {boardLabels.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">No labels yet — add one below.</p>
            ) : (
              <ul className="space-y-0.5">
                {boardLabels.map((lb) => {
                  const on = selectedIds.has(lb.id);
                  return (
                    <li key={lb.id}>
                      <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={on}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/80',
                          on && 'bg-muted/50'
                        )}
                        onClick={() => toggleLabel(lb.id, lb.name)}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            on ? 'border-primary bg-primary/15' : 'border-border'
                          )}
                        >
                          {on && <Check className="w-3 h-3 text-primary" />}
                        </span>
                        <span className={cn('truncate rounded-full px-2 py-0.5 text-[12px]', labelChipClasses(lb.color))}>
                          {lb.name}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {onCreateBoardLabel && (
            <div className="mt-1 border-t border-border/80 pt-2 px-2 pb-1">
              <p className="text-[10px] font-medium text-muted-foreground mb-1.5">New label</p>
              <div className="flex gap-1.5">
                <input
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void addNewLabel();
                    }
                  }}
                  placeholder="Name…"
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                />
                <button
                  type="button"
                  disabled={!newLabelName.trim()}
                  className="shrink-0 rounded-md border border-input bg-muted/40 px-2.5 py-1.5 text-xs font-medium hover:bg-muted/70 disabled:opacity-40"
                  onClick={() => void addNewLabel()}
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  return createPortal(menu, document.body);
}
