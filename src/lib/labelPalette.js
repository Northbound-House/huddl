/** Fixed label colors — keys stored on BoardLabel; UI maps to Tailwind classes. */
export const LABEL_COLOR_KEYS = [
  'gray',
  'blue',
  'green',
  'yellow',
  'orange',
  'red',
  'purple',
  'pink',
];

/** @type {Record<string, { bar: string, soft: string, text: string }>} */
export const LABEL_COLOR_STYLES = {
  gray: { bar: 'bg-slate-500', soft: 'bg-slate-500/15', text: 'text-slate-700 dark:text-slate-200' },
  blue: { bar: 'bg-blue-600', soft: 'bg-blue-600/15', text: 'text-blue-800 dark:text-blue-200' },
  green: { bar: 'bg-emerald-600', soft: 'bg-emerald-600/15', text: 'text-emerald-800 dark:text-emerald-200' },
  yellow: { bar: 'bg-amber-500', soft: 'bg-amber-500/20', text: 'text-amber-900 dark:text-amber-100' },
  orange: { bar: 'bg-orange-600', soft: 'bg-orange-600/15', text: 'text-orange-800 dark:text-orange-200' },
  red: { bar: 'bg-red-600', soft: 'bg-red-600/15', text: 'text-red-800 dark:text-red-200' },
  purple: { bar: 'bg-violet-600', soft: 'bg-violet-600/15', text: 'text-violet-800 dark:text-violet-200' },
  pink: { bar: 'bg-pink-600', soft: 'bg-pink-600/15', text: 'text-pink-800 dark:text-pink-200' },
};

export function labelChipClasses(colorKey) {
  const s = LABEL_COLOR_STYLES[colorKey] ?? LABEL_COLOR_STYLES.gray;
  return `${s.soft} ${s.text} border border-border/40`;
}
