import { createContext, useEffect, useMemo, useState } from "react";

type Theme = "dark" | "light";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

function getPreferredTheme(): Theme {
  /*
    Keep dark as the stable baseline for MALV surfaces.
    Light-mode token combinations can reduce contrast significantly in key UI screens.
  */
  const saved = typeof window !== "undefined" ? window.localStorage.getItem("malv_theme") : null;
  if (saved === "dark") return "dark";
  return "dark";
}

export function ThemeProvider(props: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme());

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("malv_theme", theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>;
}

