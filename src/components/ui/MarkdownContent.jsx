import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/**
 * Renders Markdown (GFM) as safe HTML — suitable for Item descriptions and Conversation replies (e.g. Trello imports).
 *
 * @param {object} props
 * @param {string} [props.children] — markdown source
 * @param {string} [props.className] — wrapper classes (typography base applied internally)
 * @param {'sm' | 'xs'} [props.size]
 */
export default function MarkdownContent({ children, className, size = 'sm' }) {
  const text = typeof children === 'string' ? children : '';
  if (!text.trim()) return null;

  const proseSize =
    size === 'xs'
      ? 'prose-sm text-xs [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_pre]:my-1 [&_pre]:text-[11px] [&_code]:text-[11px]'
      : 'prose-sm [&_pre]:text-xs [&_code]:text-xs';

  return (
    <div
      className={cn(
        'markdown-content prose dark:prose-invert max-w-none text-foreground',
        proseSize,
        '[&_a]:text-primary [&_a]:break-words [&_blockquote]:border-border [&_code]:rounded [&_code]:bg-muted/80 [&_code]:px-1 [&_code]:py-px [&_pre]:border [&_pre]:border-border/60 [&_pre]:bg-muted/40',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkChildren, ...rest }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
              {linkChildren}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
