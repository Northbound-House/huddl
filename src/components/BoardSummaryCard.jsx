import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import BoardContributorAvatars from '@/components/BoardContributorAvatars';
import { formatRelativeTimeAgo } from '@/lib/boardActivity';
import { formatWhenLabel } from '@/lib/cardTimestamps';
import { getHuddlKindLabel, getLayoutLabelForBoard } from '@/lib/huddlBoardModel';
import { cn } from '@/lib/utils';

function BoardActivityTime({ iso }) {
  const [label, setLabel] = useState(() => (iso ? formatRelativeTimeAgo(iso) : null));

  useEffect(() => {
    if (!iso) {
      setLabel(null);
      return undefined;
    }
    setLabel(formatRelativeTimeAgo(iso));
    const id = window.setInterval(() => setLabel(formatRelativeTimeAgo(iso)), 60000);
    return () => window.clearInterval(id);
  }, [iso]);

  if (!iso || !label) return null;

  return (
    <time
      dateTime={iso}
      title={formatWhenLabel(iso) ?? undefined}
      className="text-[10px] text-muted-foreground shrink-0 tabular-nums leading-none text-right max-w-[5.5rem]"
    >
      {label}
    </time>
  );
}

/** Huddl Board preview for home / Circle lists: title, ceremony, Circle scope, contributor avatars. */
export default function BoardSummaryCard({
  board,
  teamLabel,
  contributors = [],
  lastActivityIso = null,
  className,
}) {
  const kindLabel = getHuddlKindLabel(board);
  const layoutSuffix = getLayoutLabelForBoard(board);
  const typeLine = layoutSuffix ? `${kindLabel} · ${layoutSuffix}` : kindLabel;

  return (
    <Link
      to={`/board/${board.id}`}
      className={cn(
        'block rounded-2xl border border-border/60 bg-card p-4 shadow-sm hover:border-primary/40 hover:shadow-md transition-all',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-heading font-semibold text-foreground leading-snug">{board.title}</p>
            {board.is_archived ? (
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground border border-border rounded px-1.5 py-0.5">
                Archived
              </span>
            ) : null}
          </div>
          {board.description ? (
            <p className="text-xs text-muted-foreground line-clamp-2">{board.description}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] text-muted-foreground">
            <span className="rounded-md bg-muted/80 px-2 py-0.5 font-medium text-foreground/90">{typeLine}</span>
            <span
              className={cn(
                'rounded-md px-2 py-0.5 font-medium',
                teamLabel === 'Personal'
                  ? 'bg-primary/10 text-primary'
                  : teamLabel === 'Unassigned'
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-accent/15 text-foreground'
              )}
            >
              {teamLabel}
            </span>
          </div>
        </div>
        <BoardActivityTime iso={lastActivityIso} />
      </div>
      {contributors.length > 0 ? (
        <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
          <BoardContributorAvatars contributors={contributors} max={6} size="sm" className="min-w-0" />
        </div>
      ) : (
        <p className="mt-3 pt-3 border-t border-border/50 text-[11px] text-muted-foreground">No activity yet</p>
      )}
    </Link>
  );
}
