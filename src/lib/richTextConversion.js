import { marked } from 'marked';
import TurndownService from 'turndown';

marked.use({
  breaks: true,
  gfm: true,
});

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

/**
 * Normalize stored description to Markdown for editing/display.
 * Trello (and some imports) store HTML; we always convert through turndown so the
 * TipTap pipeline matches plain Markdown items — never inject raw HTML into the editor.
 *
 * @param {string | null | undefined} stored
 * @returns {string}
 */
export function normalizeStoredDescription(stored) {
  const raw = stored == null ? '' : String(stored);
  const s = raw.trim();
  if (!s) return '';
  if (/^\s*</.test(s)) {
    try {
      return turndown.turndown(s).trim();
    } catch {
      return s
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }
  return raw.trim();
}

/**
 * Markdown/plain → HTML for TipTap initial content (always via marked after {@link normalizeStoredDescription}).
 *
 * @param {string | null | undefined} stored
 * @returns {string} HTML for TipTap
 */
export function storedDescriptionToHtml(stored) {
  const md = normalizeStoredDescription(stored);
  if (!md.trim()) return '<p></p>';
  const html = marked.parse(md, { async: false });
  if (typeof html === 'string' && html.trim()) return html;
  return '<p></p>';
}

/**
 * TipTap document → Markdown for persistence (same pipeline as comments / MarkdownContent).
 *
 * @param {string} html from editor.getHTML()
 * @returns {string}
 */
export function htmlToStoredMarkdown(html) {
  const h = String(html || '').trim();
  if (!h || h === '<p></p>') return '';
  try {
    return turndown.turndown(h).trim();
  } catch {
    return '';
  }
}
