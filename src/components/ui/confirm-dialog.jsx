import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** App-styled confirmation modal (replaces window.confirm). Optional `confirmPhrase` requires typing that word (case-insensitive) to confirm. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'default',
  confirmPending = false,
  confirmDisabled = false,
  confirmPhrase,
  className,
}) {
  const [typedPhrase, setTypedPhrase] = React.useState('');

  React.useEffect(() => {
    if (open) setTypedPhrase('');
  }, [open]);

  const phraseRequired = Boolean(confirmPhrase?.trim());
  const phraseOk =
    !phraseRequired ||
    typedPhrase.trim().toLowerCase() === confirmPhrase.trim().toLowerCase();
  const confirmBlocked = confirmPending || confirmDisabled || !phraseOk;

  const handleConfirm = () => {
    if (confirmBlocked) return;
    onConfirm?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('sm:max-w-md', className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description != null && description !== '' && (
            <DialogDescription asChild>
              <div className="text-left text-sm text-muted-foreground space-y-2 [&_strong]:font-semibold [&_strong]:text-foreground">
                {typeof description === 'string' ? <p>{description}</p> : description}
              </div>
            </DialogDescription>
          )}
        </DialogHeader>
        {phraseRequired && (
          <div className="space-y-2 pt-1">
            <label htmlFor="confirm-dialog-phrase" className="text-sm font-medium text-foreground">
              Type <span className="font-mono text-destructive">{confirmPhrase.trim()}</span> to confirm
            </label>
            <input
              id="confirm-dialog-phrase"
              type="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={typedPhrase}
              onChange={(e) => setTypedPhrase(e.target.value)}
              disabled={confirmPending}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={confirmPhrase.trim()}
            />
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-end flex-col-reverse sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
            disabled={confirmPending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            className="rounded-xl"
            onClick={handleConfirm}
            disabled={confirmBlocked}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
