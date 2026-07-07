import React from 'react';
import { normalizeEmail } from '@/lib/email';
import { initialsFromEmail, voterAvatarColors } from '@/lib/voterDisplay';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function onlineUsersSignature(users) {
  return users
    .map(
      (u) =>
        [u.uid, u.email ?? '', u.display_name ?? '', u.photo_url ?? ''].join('\u0001')
    )
    .join('\u0002');
}

/**
 * Header strip: who has this board open right now (presence heartbeat).
 * @param {{ onlineUsers: Array<{ uid: string, email?: string|null, display_name?: string|null, photo_url?: string|null }>, sessionUser: { uid?: string|null, email?: string|null }|null, myPresenceUid: string|null }} props
 */
function BoardOnlineIndicator({ onlineUsers, sessionUser, myPresenceUid }) {
  const max = 6;
  const shown = onlineUsers.slice(0, max);
  const overflow = onlineUsers.length > max ? onlineUsers.length - max : 0;
  const meEmail = sessionUser?.email ? normalizeEmail(sessionUser.email) : '';

  if (onlineUsers.length === 0) return null;

  const labelFor = (u) => {
    const em = u.email ? normalizeEmail(u.email) : '';
    if (u.display_name?.trim()) return u.display_name.trim();
    if (u.email) return u.email;
    return u.uid;
  };

  const tooltipLines = onlineUsers.map((u) => {
    const you = u.uid === myPresenceUid || (meEmail && u.email && normalizeEmail(u.email) === meEmail);
    const base = labelFor(u);
    return you ? `${base} (you)` : base;
  });

  const avatarStack = (
    <div className="flex flex-row items-center -space-x-2">
      {shown.map((u) => {
        const em = u.email || u.uid || '?';
        const { background, foreground } = voterAvatarColors(em);
        const isMe = u.uid === myPresenceUid;
        const src = u.photo_url || null;
        return (
          <span
            key={u.uid}
            className="relative inline-flex h-7 w-7 min-w-[1.75rem] rounded-full border-2 border-card ring-2 ring-emerald-500/90 ring-offset-0"
          >
            {src ? (
              <img
                src={src}
                alt=""
                className="h-full w-full rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                className="flex h-full w-full items-center justify-center rounded-full text-[10px] font-semibold"
                style={{ background, color: foreground }}
              >
                {initialsFromEmail(typeof u.email === 'string' ? u.email : em)}
              </span>
            )}
            {isMe ? (
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border border-card"
                aria-hidden
              />
            ) : null}
          </span>
        );
      })}
      {overflow > 0 ? (
        <span className="relative z-10 inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full border-2 border-card bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
          +{overflow}
        </span>
      ) : null}
    </div>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex items-center gap-2 mr-1 shrink-0 cursor-default"
            role="group"
            aria-label={`${onlineUsers.length} viewing now`}
          >
            <span className="hidden sm:inline text-[11px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
              Online
            </span>
            <span className="inline-flex sm:hidden items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden />
              {onlineUsers.length}
            </span>
            <span className="hidden sm:inline-flex">{avatarStack}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="max-w-xs">
          <p className="text-xs font-medium mb-1.5">Viewing this board</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {tooltipLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function onlineIndicatorPropsEqual(prev, next) {
  return (
    prev.myPresenceUid === next.myPresenceUid &&
    prev.onlineUsers.length === next.onlineUsers.length &&
    onlineUsersSignature(prev.onlineUsers) === onlineUsersSignature(next.onlineUsers) &&
    (prev.sessionUser?.email ?? '') === (next.sessionUser?.email ?? '')
  );
}

export default React.memo(BoardOnlineIndicator, onlineIndicatorPropsEqual);
