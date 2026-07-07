import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { LABEL_COLOR_KEYS, LABEL_COLOR_STYLES } from '@/lib/labelPalette';

/**
 * Minimal Item accent: slim preview; full palette opens on click.
 * @param {(key: string | null) => void} onSelect — `null` clears accent.
 * @param {'default' | 'swatch'} [variant] — `swatch` is a color circle only (no text on the trigger).
 */
export default function ItemColorPicker({ coverStyle, onSelect, disabled, variant = 'default' }) {
  const [open, setOpen] = useState(false);
  const current = coverStyle?.type === 'color' ? coverStyle.value : null;

  const pick = (key) => {
    onSelect(key);
    setOpen(false);
  };

  const isSwatch = variant === 'swatch';

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          title={isSwatch ? 'Item color' : undefined}
          aria-label={isSwatch ? 'Choose item color' : undefined}
          className={cn(
            isSwatch
              ? cn(
                  'h-6 w-6 shrink-0 rounded-full border-2 border-border/50 shadow-sm ring-1 ring-black/10 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  current ? LABEL_COLOR_STYLES[current]?.bar ?? 'bg-muted' : 'bg-muted',
                  disabled && 'pointer-events-none opacity-50'
                )
              : cn(
                  'flex w-full max-w-[220px] items-center justify-between gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40',
                  disabled && 'pointer-events-none opacity-50'
                )
          )}
        >
          {!isSwatch && (
            <>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className={cn(
                    'h-5 w-5 shrink-0 rounded-full ring-2 ring-border/30',
                    current ? LABEL_COLOR_STYLES[current]?.bar ?? 'bg-muted' : 'bg-muted'
                  )}
                  aria-hidden
                />
                <span className="truncate text-muted-foreground">
                  {current ? 'Accent' : 'No accent'}
                </span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={cn('z-[300] p-2', isSwatch ? 'w-auto' : 'w-56')}
        align="start"
        sideOffset={4}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {!isSwatch && (
          <>
            <p className="px-1 pb-2 text-[11px] font-medium text-muted-foreground">Item color</p>
            <DropdownMenuItem className="cursor-pointer rounded-lg text-xs" onSelect={() => pick(null)}>
              <span
                className={cn(
                  'mr-2 inline-block h-4 w-4 rounded-full bg-muted ring-2 ring-border/40',
                  !current && 'ring-2 ring-primary'
                )}
              />
              None
            </DropdownMenuItem>
          </>
        )}
        {isSwatch && (
          <button
            type="button"
            title="Clear color"
            aria-label="Clear item color"
            onClick={() => pick(null)}
            className={cn(
              'mb-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 bg-muted/30 transition-opacity hover:opacity-90',
              !current && 'ring-2 ring-primary ring-offset-1'
            )}
          />
        )}
        <div className={cn('flex flex-wrap gap-1', !isSwatch && 'mt-2 border-t border-border/60 pt-2')}>
          {LABEL_COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              title={key}
              onClick={() => pick(key)}
              className={cn(
                isSwatch ? 'h-6 w-6 rounded-full border-2' : 'h-8 w-8 rounded-lg border-2',
                'transition-transform hover:scale-105',
                LABEL_COLOR_STYLES[key]?.bar ?? '',
                current === key ? 'ring-2 ring-primary ring-offset-2' : 'border-transparent'
              )}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
