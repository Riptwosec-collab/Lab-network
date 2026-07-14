"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  setTheme(theme: Theme): void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const applyTheme = useCallback((nextTheme: Theme) => {
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    window.localStorage.setItem("netlab-theme", nextTheme);
    setThemeState(nextTheme);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("netlab-theme");
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const frame = window.requestAnimationFrame(() => {
      applyTheme(saved === "dark" || saved === "light" ? saved : preferred);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [applyTheme]);

  const value = useMemo(() => ({ theme, setTheme: applyTheme }), [applyTheme, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useNetLabTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useNetLabTheme must be used within ThemeProvider");
  return context;
}
