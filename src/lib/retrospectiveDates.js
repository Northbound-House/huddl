/** Local calendar date as YYYY-MM-DD (for retrospective session keys). */
export function getLocalDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** e.g. "Monday, April 20, 2026" */
export function formatRetroLongDate(dateKey) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return '';
  const [y, mo, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Shorter label for lists: "Apr 20, 2026" */
export function formatRetroShortDate(dateKey) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return '';
  const [y, mo, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  return dt.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
