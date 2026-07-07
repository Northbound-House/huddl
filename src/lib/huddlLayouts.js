/**
 * Layout presets: starting Sections only. Independent of Ongoing vs Session Huddl.
 * @type {Record<string, { id: string, label: string, description: string, sectionTitles: string[] }>}
 */
export const HUDDL_LAYOUTS = {
  retro: {
    id: 'retro',
    label: 'Retro',
    description: 'Classic retrospective columns.',
    sectionTitles: [
      'What went well',
      'What could we improve',
      'Kudos + Shoutouts',
      'Action Items',
    ],
  },
  brainstorm: {
    id: 'brainstorm',
    label: 'Brainstorm',
    description: 'Capture ideas and themes, then narrow down.',
    sectionTitles: ['Ideas', 'Themes', 'Next steps'],
  },
  kanban: {
    id: 'kanban',
    label: 'Kanban',
    description: 'Simple flow from backlog to done.',
    sectionTitles: ['To Do', 'In Progress', 'Done'],
  },
  blank: {
    id: 'blank',
    label: 'Blank',
    description: 'No starter Sections — add your own on the Huddl Board.',
    sectionTitles: [],
  },
};

export const HUDDL_LAYOUT_LIST = Object.values(HUDDL_LAYOUTS);

export function getLayoutById(id) {
  return HUDDL_LAYOUTS[id] ?? null;
}
