/** Normalize email for comparisons and Firestore (lowercase, trim). */
export function normalizeEmail(email) {
  if (email == null || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/** Case-insensitive membership for `voted_by` / invite lists. */
export function emailInList(list, email) {
  const me = normalizeEmail(email);
  if (!me || !Array.isArray(list)) return false;
  return list.some((e) => normalizeEmail(e) === me);
}
