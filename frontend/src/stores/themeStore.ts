// ============================================================
// Theme Store — 3 themes: dark / light / colorful
// Persisted to localStorage, applied as data-theme on <html>
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light' | 'colorful';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => {
        set({ theme });
        document.documentElement.setAttribute('data-theme', theme);
      },
    }),
    { name: 'companyrun-theme' },
  ),
);

/** Call once on app boot to restore persisted theme */
export function applyStoredTheme() {
  const raw = localStorage.getItem('companyrun-theme');
  let theme: Theme = 'dark';
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { state?: { theme?: string } };
      const t = parsed?.state?.theme;
      if (t === 'dark' || t === 'light' || t === 'colorful') theme = t;
    } catch {
      // ignore
    }
  }
  document.documentElement.setAttribute('data-theme', theme);
}
