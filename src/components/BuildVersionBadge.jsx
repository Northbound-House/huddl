import { cn } from '@/lib/utils';

/** Shown bottom-right; label is set at compile time in `vite.config.js`. */
export default function BuildVersionBadge() {
  const label = import.meta.env.VITE_BUILD_LABEL;
  if (!label) return null;

  return (
    <div
      className={cn(
        'pointer-events-none fixed bottom-2 right-2 z-[60]',
        'text-[10px] leading-tight tracking-tight tabular-nums select-none',
        'text-muted-foreground/50'
      )}
      aria-hidden="true"
    >
      {label}
    </div>
  );
}
