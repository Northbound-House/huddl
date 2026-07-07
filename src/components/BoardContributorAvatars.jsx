import React from 'react';
import { cn } from '@/lib/utils';
import { contributorAvatarColors } from '@/lib/boardContributors';

/**
 * Overlapping avatars for board contributors (emails + display names from cards).
 */
export default function BoardContributorAvatars({
  contributors = [],
  max = 5,
  size = 'sm',
  className,
  showOverflowCount = true,
}) {
  const raw = Array.isArray(contributors) ? contributors.filter(Boolean) : [];
  const shown = raw.slice(0, max);
  const overflow = showOverflowCount && raw.length > max ? raw.length - max : 0;

  if (raw.length === 0) return null;

  const sizeClasses =
    size === 'md'
      ? 'h-8 w-8 min-w-[2rem] text-[11px] border-[2.5px]'
      : 'h-6 w-6 min-w-[1.5rem] text-[10px] leading-none border-2';

  return (
    <div
      className={cn('flex flex-row items-center', size === 'sm' ? '-space-x-1.5' : '-space-x-2', className)}
      role="list"
      aria-label={`Contributors: ${raw.length}`}
    >
      {shown.map((c) => {
        const { background, foreground } = contributorAvatarColors(c);
        const key = c.kind === 'email' ? `e:${c.email}` : `n:${c.displayName}`;
        return (
          <span
            key={key}
            role="listitem"
            title={c.displayName}
            className={cn(
              'inline-flex items-center justify-center rounded-full border-background font-semibold shadow-sm ring-1 ring-black/10 overflow-hidden',
              sizeClasses
            )}
            style={c.photoURL ? undefined : { backgroundColor: background, color: foreground }}
          >
            {c.photoURL ? (
              <img src={c.photoURL} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="select-none pointer-events-none">{c.initials}</span>
            )}
          </span>
        );
      })}
      {overflow > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full border-2 border-background bg-muted font-semibold text-muted-foreground shadow-sm ring-1 ring-border/60',
            size === 'md' ? 'h-8 min-w-[2rem] px-1 text-[11px]' : 'h-6 min-w-[1.5rem] px-1 text-[10px]'
          )}
          title={`${overflow} more`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
