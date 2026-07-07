import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

export const THEME_STORAGE_KEY = 'huddl-theme';

/** Theme ids that enable Tailwind's `dark:` variant (via `class="dark"` on &lt;html&gt;). */
export const DARK_THEME_IDS = new Set(['dark']);

export const THEMES = [
  { id: 'light', label: 'Light', description: 'Clean neutral' },
  { id: 'dark', label: 'Dark', description: 'Easy on the eyes' },
  { id: 'ocean', label: 'Ocean', description: 'Cool cyan & slate' },
  { id: 'forest', label: 'Forest', description: 'Sage & emerald' },
  { id: 'rose', label: 'Rose', description: 'Warm stone & blush' },
];

const ThemeContext = createContext(null);

function applyThemeToDocument(themeId) {
  const root = document.documentElement;
  root.setAttribute('data-theme', themeId);
  if (DARK_THEME_IDS.has(themeId)) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function ThemeProvider({ children }) {
  const { sessionUser, isFirebaseAuth } = useAuth();
  const uid = sessionUser?.uid ?? null;
  const loggedIn = Boolean(isFirebaseAuth && uid);

  const [theme, setThemeState] = useState(() => {
    try {
      const s = localStorage.getItem(THEME_STORAGE_KEY);
      if (s && THEMES.some((t) => t.id === s)) return s;
    } catch {
      /* ignore */
    }
    return 'light';
  });

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  /** Load theme from profile (Firestore / local) when the user signs in — keeps devices in sync. */
  useEffect(() => {
    if (!loggedIn || !base44.entities.UserPreferences?.get) return;
    let cancelled = false;
    (async () => {
      try {
        const prefs = await base44.entities.UserPreferences.get(uid);
        if (cancelled || !prefs?.theme) return;
        if (!THEMES.some((t) => t.id === prefs.theme)) return;
        setThemeState(prefs.theme);
        try {
          localStorage.setItem(THEME_STORAGE_KEY, prefs.theme);
        } catch {
          /* ignore */
        }
        applyThemeToDocument(prefs.theme);
      } catch (e) {
        console.warn('UserPreferences.get', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loggedIn, uid]);

  const setTheme = useCallback(
    (id) => {
      if (!THEMES.some((t) => t.id === id)) return;
      setThemeState(id);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, id);
      } catch {
        /* ignore */
      }
      if (loggedIn && base44.entities.UserPreferences?.set) {
        base44.entities.UserPreferences.set(uid, { theme: id }).catch((e) => {
          console.warn('UserPreferences.set', e);
        });
      }
    },
    [loggedIn, uid]
  );

  const value = useMemo(() => ({ theme, setTheme, themes: THEMES }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
