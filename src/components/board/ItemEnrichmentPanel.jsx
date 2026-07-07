import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import DescriptionRichTextEditor from '@/components/board/DescriptionRichTextEditor';
import { Button } from '@/components/ui/button';
import { appendActivityLog, getItemDescription } from '@/lib/itemModel';

export default function ItemEnrichmentPanel({
  card,
  onPatch,
  currentUser,
  currentUserEmail,
  readOnly = false,
}) {
  const cardRef = useRef(card);
  cardRef.current = card;
  const descriptionEditorRef = useRef(null);
  /** Last saved Markdown aligned with the editor (`null` until first `onDraftChange` establishes canonical form). */
  const baselineDescriptionRef = useRef(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    baselineDescriptionRef.current = null;
    setDirty(false);
  }, [card?.id]);

  const patch = useCallback(
    async (partial, summary) => {
      if (readOnly) return;
      const c = cardRef.current;
      const next = { ...partial, updated_at: new Date().toISOString() };
      if (summary) {
        next.activity_log = appendActivityLog(c, {
          summary,
          actor_email: currentUserEmail || currentUser?.email,
        });
      }
      await onPatch(next);
    },
    [readOnly, currentUserEmail, currentUser?.email, onPatch]
  );

  const handleDraftChange = useCallback((md) => {
    const s = md ?? '';
    if (baselineDescriptionRef.current === null) {
      baselineDescriptionRef.current = s;
      setDirty(false);
      return;
    }
    const a = (baselineDescriptionRef.current || '').trim();
    const b = (s || '').trim();
    setDirty(a !== b);
  }, []);

  const handleSaveDescription = useCallback(async () => {
    if (readOnly || !dirty) return;
    const md = descriptionEditorRef.current?.getMarkdown?.() ?? '';
    const trimmed = (md || '').trim();
    try {
      await patch({ description: trimmed ? md : null }, 'Updated Item details');
      baselineDescriptionRef.current = trimmed ? md : '';
      setDirty(false);
      toast.success('Saved');
    } catch {
      toast.error('Could not save');
    }
  }, [readOnly, dirty, patch]);

  return (
    <div className="space-y-6 text-sm">
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Description</label>
        <DescriptionRichTextEditor
          ref={descriptionEditorRef}
          key={card?.id}
          cardId={card?.id}
          markdown={getItemDescription(card)}
          readOnly={readOnly}
          persistMode="manual"
          onDraftChange={handleDraftChange}
        />
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              className="rounded-xl"
              disabled={!dirty}
              onClick={() => void handleSaveDescription()}
            >
              Save
            </Button>
            <p className="text-[11px] text-muted-foreground">Save when you&apos;re ready.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
