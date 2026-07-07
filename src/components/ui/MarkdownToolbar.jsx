import React from 'react';
import {
  Bold,
  Code,
  Italic,
  Link2,
  List,
  ListOrdered,
  Strikethrough,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { applyLinePrefix, applyLink, applyWrap } from '@/lib/markdownToolbar';
import { cn } from '@/lib/utils';

/**
 * Inserts Markdown via buttons so users don’t have to memorize syntax. Stored value stays Markdown-compatible.
 *
 * @param {object} props
 * @param {React.RefObject<HTMLTextAreaElement | null>} props.textareaRef
 * @param {string} props.value
 * @param {(next: string) => void} props.onChange
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.compact] — smaller buttons (e.g. column inline composer)
 * @param {string} [props.className]
 */
export default function MarkdownToolbar({
  textareaRef,
  value,
  onChange,
  disabled = false,
  compact = false,
  className,
}) {
  const focusSelect = (selStart, selEnd) => {
    requestAnimationFrame(() => {
      const el = textareaRef?.current;
      if (!el || typeof el.setSelectionRange !== 'function') return;
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  };

  /**
   * @param {(v: string, s: number, e: number) => { next: string; selStart: number; selEnd: number }} fn
   */
  const run = (fn) => {
    if (disabled) return;
    const el = textareaRef?.current;
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? 0;
    const result = fn(value, s, e);
    onChange(result.next);
    focusSelect(result.selStart, result.selEnd);
  };

  const btnClass = compact ? 'h-7 w-7 rounded-md' : 'h-8 w-8 rounded-lg';
  const iconClass = compact ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className={cn(
        'flex flex-wrap items-center gap-0.5 rounded-lg border border-border/60 bg-muted/35 px-1 py-0.5',
        className
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        className={btnClass}
        title="Bold"
        aria-label="Bold"
        onClick={() => run((v, a, b) => applyWrap(v, a, b, '**'))}
      >
        <Bold className={iconClass} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        className={btnClass}
        title="Italic"
        aria-label="Italic"
        onClick={() => run((v, a, b) => applyWrap(v, a, b, '*'))}
      >
        <Italic className={iconClass} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        className={btnClass}
        title="Strikethrough"
        aria-label="Strikethrough"
        onClick={() => run((v, a, b) => applyWrap(v, a, b, '~~'))}
      >
        <Strikethrough className={iconClass} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        className={btnClass}
        title="Inline code"
        aria-label="Inline code"
        onClick={() => run((v, a, b) => applyWrap(v, a, b, '`'))}
      >
        <Code className={iconClass} />
      </Button>
      <span className="mx-0.5 h-5 w-px bg-border/80 self-center shrink-0" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        className={btnClass}
        title="Bullet list"
        aria-label="Bullet list"
        onClick={() => run((v, a, b) => applyLinePrefix(v, a, b, '- '))}
      >
        <List className={iconClass} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        className={btnClass}
        title="Numbered list"
        aria-label="Numbered list"
        onClick={() => run((v, a, b) => applyLinePrefix(v, a, b, '1. '))}
      >
        <ListOrdered className={iconClass} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        className={btnClass}
        title="Link"
        aria-label="Link"
        onClick={() => {
          const el = textareaRef?.current;
          if (!el || disabled) return;
          const s = el.selectionStart ?? 0;
          const e = el.selectionEnd ?? 0;
          const url = typeof window !== 'undefined' ? window.prompt('Link URL') : '';
          if (url == null || !String(url).trim()) return;
          const res = applyLink(value, s, e, url);
          if (!res) return;
          onChange(res.next);
          focusSelect(res.selStart, res.selEnd);
        }}
      >
        <Link2 className={iconClass} />
      </Button>
    </div>
  );
}
