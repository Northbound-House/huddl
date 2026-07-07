import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44, isFirestoreBackend } from '@/api/base44Client';
import { trackEvent } from '@/lib/analytics';
import { runTrelloBoardImport } from '@/lib/trelloImport';
import { Upload } from 'lucide-react';
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

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {object | null} props.sessionUser
 * @param {boolean} props.isFirebaseAuth
 * @param {boolean} props.accessLoading
 * @param {() => void} [props.refreshAccess]
 */
export default function ImportTrelloBoardDialog({
  open,
  onOpenChange,
  sessionUser,
  isFirebaseAuth,
  accessLoading,
  refreshAccess,
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [lastFileName, setLastFileName] = useState('');

  const canImportPersonal = !isFirestoreBackend || !!sessionUser?.uid;

  const importMutation = useMutation({
    mutationFn: async (/** @type {{ text: string }} */ { text }) => {
      const parsed = JSON.parse(text);
      return runTrelloBoardImport(base44, parsed, {
        ownerUid: sessionUser?.uid ?? null,
        ownerEmail: sessionUser?.email ?? null,
      });
    },
    onSuccess: ({ board, stats }) => {
      trackEvent('trello_board_import', {
        columns: stats.columnCount,
        cards: stats.cardCount,
        comments: stats.commentCount,
      });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      if (board?.id) {
        queryClient.invalidateQueries({ queryKey: ['columns', board.id] });
        queryClient.invalidateQueries({ queryKey: ['cards', board.id] });
      }
      refreshAccess?.();
      toast.success(
        `Imported — ${stats.columnCount} sections, ${stats.cardCount} Items, ${stats.commentCount} comments`
      );
      onOpenChange(false);
      setLastFileName('');
      if (board?.id) {
        navigate(`/board/${board.id}`);
      }
    },
    onError: (e) => {
      toast.error(e?.message || 'Could not import this file');
    },
  });

  const onPickFile = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const onFileChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setLastFileName(file.name);
      try {
        const text = await file.text();
        await importMutation.mutateAsync({ text });
      } catch (err) {
        if (err instanceof SyntaxError) {
          toast.error('Invalid JSON — choose a Trello board export file.');
        }
        /* mutation onError handles runTrelloBoardImport failures */
      }
    },
    [importMutation]
  );

  const busy = importMutation.isPending || accessLoading;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-hidden
        onChange={onFileChange}
      />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import from Trello</DialogTitle>
            <DialogDescription className="text-left text-sm space-y-2">
              <span className="block">
                Upload a <strong>JSON board export</strong> from Trello (Board menu → More → Print and export → Export
                JSON).
              </span>
              <span className="block text-muted-foreground">
                Creates a <strong>personal ongoing</strong> Huddl Board with the same sections and card order. Archived
                lists/cards and attachments are skipped. Comments use plain text (Markdown stays as text); authors show
                as Trello names when available. You can move this board to a Circle later in settings.
              </span>
            </DialogDescription>
          </DialogHeader>
          {!canImportPersonal && isFirebaseAuth ? (
            <p className="text-sm text-destructive">
              Sign in with Google to create a personal imported Huddl Board.
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={busy || !canImportPersonal}
              onClick={onPickFile}
            >
              <Upload className="w-4 h-4 mr-2 shrink-0" />
              {busy ? 'Importing…' : lastFileName ? 'Import another file' : 'Choose JSON file'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
