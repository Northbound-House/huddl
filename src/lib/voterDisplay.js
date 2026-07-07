/** Friendly display from email local-part (for tooltips when no profile name exists). */
export function displayNameFromEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const local = email.split('@')[0]?.trim() || '';
  if (!local) return email;
  const parts = local.split(/[._\-+]+/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((p) => (p.length ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ''))
    .filter(Boolean)
    .join(' ');
}

/** Derive 1–2 initials from an email local-part for avatar labels. */
export function initialsFromEmail(email) {
  if (!email || typeof email !== 'string') return '?';
  const local = email.split('@')[0]?.trim() || '';
  if (!local) return '?';
  const parts = local.split(/[._\-+]+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0];
    const b = parts[1][0];
    if (a && b) return `${a}${b}`.toUpperCase();
  }
  const cleaned = local.replace(/[^a-zA-Z0-9]/g, '');
  if (cleaned.length >= 2) return cleaned.slice(0, 2).toUpperCase();
  if (local.length >= 1) return local.slice(0, 2).toUpperCase();
  return '?';
}

/** Stable hue 0–359 for a string (used for avatar background). */
export function hueFromString(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h = (h * 33 + str.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

export function voterAvatarColors(email) {
  const h = hueFromString(email);
  return {
    background: `hsl(${h} 52% 42%)`,
    foreground: '#fff',
  };
}
