/**
 * Helpers for a toolbar that inserts Markdown around the textarea selection.
 */

/**
 * @param {string} value
 * @param {number} selStart
 * @param {number} selEnd
 * @param {string} open
 * @param {string} [close]
 */
export function applyWrap(value, selStart, selEnd, open, close = open) {
  const before = value.slice(0, selStart);
  const selected = value.slice(selStart, selEnd);
  const after = value.slice(selEnd);
  const next = before + open + selected + close + after;
  const caret = selStart + open.length + selected.length + close.length;
  return { next, selStart: caret, selEnd: caret };
}

/**
 * Prefix each line in the block containing the selection (same behavior as most editors).
 * @param {string} value
 * @param {number} selStart
 * @param {number} selEnd
 * @param {string} prefix e.g. '- ' or '1. '
 */
export function applyLinePrefix(value, selStart, selEnd, prefix) {
  const start = value.lastIndexOf('\n', Math.max(0, selStart - 1)) + 1;
  let end = selEnd;
  const tail = value.slice(selEnd);
  const nl = tail.indexOf('\n');
  if (nl === -1) end = value.length;
  else end = selEnd + nl;

  const chunk = value.slice(start, end);
  const lines = chunk.split('\n');
  const out = lines.map((ln) => (ln.length ? prefix + ln : ln)).join('\n');
  const next = value.slice(0, start) + out + value.slice(end);
  const pos = start + out.length;
  return { next, selStart: pos, selEnd: pos };
}

/**
 * @param {string} value
 * @param {number} selStart
 * @param {number} selEnd
 * @param {string} url
 */
export function applyLink(value, selStart, selEnd, url) {
  const trimmedUrl = String(url || '').trim();
  if (!trimmedUrl) return null;
  const label = value.slice(selStart, selEnd).trim() || 'link';
  const md = `[${label}](${trimmedUrl})`;
  const next = value.slice(0, selStart) + md + value.slice(selEnd);
  const pos = selStart + md.length;
  return { next, selStart: pos, selEnd: pos };
}
