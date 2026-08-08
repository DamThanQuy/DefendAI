"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-14 h-7 rounded-full bg-muted border border-border opacity-50 cursor-default"></div>
    );
  }

  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative flex items-center w-14 h-7 rounded-full bg-muted border border-border transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer overflow-hidden shadow-inner"
      aria-label="Toggle theme"
    >
      <div 
        className={`absolute left-1 flex items-center justify-center w-5 h-5 rounded-full bg-background shadow-sm transition-transform duration-300 ease-in-out ${
          isDark ? "translate-x-7" : "translate-x-0"
        }`}
      >
        {isDark ? (
          <Moon className="w-3 h-3 text-primary" />
        ) : (
          <Sun className="w-3 h-3 text-amber-500" />
        )}
      </div>
    </button>
  );
}
