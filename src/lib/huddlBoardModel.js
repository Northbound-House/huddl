import { getLayoutById } from '@/lib/huddlLayouts';

/**
 * @param {object | null | undefined} board
 * @returns {boolean}
 */
export function isSessionHuddl(board) {
  if (!board) return false;
  if (board.huddl_type === 'session') return true;
  if (board.huddl_type === 'ongoing') return false;
  // Legacy: only retrospective used session behavior
  return board.ceremony_type === 'retrospective';
}

/**
 * @param {object | null | undefined} board
 * @returns {boolean}
 */
export function isOngoingHuddl(board) {
  if (!board) return false;
  if (board.huddl_type === 'ongoing') return true;
  if (board.huddl_type === 'session') return false;
  return board.ceremony_type !== 'retrospective';
}

/**
 * Primary product label for lists and settings.
 * @param {object | null | undefined} board
 * @returns {string}
 */
export function getHuddlKindLabel(board) {
  if (isSessionHuddl(board)) return 'Session Huddl';
  if (isOngoingHuddl(board)) return 'Ongoing Huddl';
  return 'Huddl Board';
}

/**
 * @param {object | null | undefined} board
 * @returns {string}
 */
export function getLayoutLabelForBoard(board) {
  if (!board?.layout_id) return '';
  const layout = getLayoutById(board.layout_id);
  return layout?.label ? `${layout.label} layout` : '';
}
