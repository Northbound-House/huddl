import React from 'react';
import { cn } from '@/lib/utils';
import { auth } from '@/lib/firebase';
import { normalizeEmail } from '@/lib/email';
import { initialsFromEmail, voterAvatarColors } from '@/lib/voterDisplay';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** Session + direct Firebase user (context can miss provider photo in edge cases). */
function resolveProfilePhoto(sessionUser) {
  const fromSession = sessionUser?.photoURL;
  if (fromSession) return fromSession;
  try {
    const u = auth?.currentUser;
    if (!u) return null;
    if (u.photoURL) return u.photoURL;
    return u.providerData?.find((p) => p.photoURL)?.photoURL || null;
  } catch {
    return null;
  }
}

/**
 * Overlapping circular avatars for voters (identified by email in `voted_by`).
 * Uses optional `photoByEmail` (from shared `public_profiles`) plus the signed-in user's session photo when they match.
 * Values may be a photo URL string (legacy) or `{ photo_url, display_name }`.
 */
export default function VoterAvatars({
  emails,
  /** When an email matches `sessionUser.email`, `photoURL` is shown (e.g. Google profile). */
  sessionUser,
  /** Normalized email → photo URL string, or profile object from `public_profiles`. */
  photoByEmail = {},
  size = 'sm',
  max = 8,
  className,
  showOverflowCount = true,
  /** When set, each avatar shows this text in a tooltip on hover (e.g. display name). */
  tooltipLabelForEmail,
}) {
  const raw = Array.isArray(emails) ? emails.filter(Boolean) : [];
  const shown = raw.slice(0, max);
  const overflow = showOverflowCount && raw.length > max ? raw.length - max : 0;
  const me = sessionUser?.email ? normalizeEmail(sessionUser.email) : '';
  const myPhoto = resolveProfilePhoto(sessionUser);

  if (raw.length === 0) return null;

  const sizeClasses =
    size === 'xs'
      ? 'h-5 w-5 min-w-[1.25rem] text-[9px] leading-none border-2'
      : size === 'md'
        ? 'h-9 w-9 min-w-[2.25rem] text-xs border-[3px]'
        : 'h-6 w-6 min-w-[1.5rem] text-[10px] leading-none border-2';

  const spaceClass =
    size === 'xs' ? '-space-x-1' : size === 'sm' ? '-space-x-1.5' : '-space-x-2';

  const inner = (
    <div
      className={cn('flex flex-row items-center', spaceClass, className)}
      role="list"
      aria-label={`${raw.length} ${raw.length === 1 ? 'person has' : 'people have'} liked this`}
    >
      {shown.map((email) => {
        const { background, foreground } = voterAvatarColors(email);
        const n = normalizeEmail(email);
        const profileEntry = n && photoByEmail[n] != null ? photoByEmail[n] : null;
        const shared =
          typeof profileEntry === 'string'
            ? profileEntry
            : profileEntry?.photo_url ?? null;
        const showPhoto = Boolean(
          shared || (myPhoto && me && n === me)
        );
        const src = shared || (myPhoto && me && n === me ? myPhoto : null);
        const node = (
          <span
            key={email}
            role="listitem"
            title={tooltipLabelForEmail ? undefined : email}
            className={cn(
              'inline-flex items-center justify-center rounded-full border-background font-semibold shadow-sm ring-1 ring-black/10 overflow-hidden',
              sizeClasses
            )}
            style={showPhoto ? undefined : { backgroundColor: background, color: foreground }}
          >
            {showPhoto && src ? (
              <img src={src} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="select-none pointer-events-none">{initialsFromEmail(email)}</span>
            )}
          </span>
        );
        if (!tooltipLabelForEmail) return node;
        return (
          <Tooltip key={email}>
            <TooltipTrigger asChild>{node}</TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[240px]">
              {tooltipLabelForEmail(email)}
            </TooltipContent>
          </Tooltip>
        );
      })}
      {overflow > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full border-2 border-background bg-muted font-semibold text-muted-foreground shadow-sm ring-1 ring-border/60',
            size === 'md'
              ? 'h-9 min-w-[2.25rem] px-1.5 text-xs'
              : size === 'xs'
                ? 'h-5 min-w-[1.25rem] px-0.5 text-[9px]'
                : 'h-6 min-w-[1.5rem] px-1 text-[10px]'
          )}
          title={`${overflow} more`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );

  if (tooltipLabelForEmail) {
    return (
      <TooltipProvider delayDuration={200}>
        {inner}
      </TooltipProvider>
    );
  }
  return inner;
}
