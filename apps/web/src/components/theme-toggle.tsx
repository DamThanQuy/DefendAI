"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  if (!mounted) {
    return (
      <div
        className={`h-9 w-16 shrink-0 rounded-full border border-border bg-muted/60 ${className}`}
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`relative flex h-9 w-16 shrink-0 items-center rounded-full border border-border bg-muted shadow-sm transition-colors hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/50 overflow-hidden ${className}`}
      aria-label="Toggle light / dark mode"
      title={isDark ? "Chuyển sang Light mode" : "Chuyển sang Dark mode"}
    >
      {/* track icons */}
      <Sun className="absolute left-2 h-4 w-4 text-amber-500" />
      <Moon className="absolute right-2 h-4 w-4 text-primary" />
      {/* sliding knob */}
      <span
        className={`absolute top-1 flex h-7 w-7 items-center justify-center rounded-full bg-background shadow-md transition-transform duration-300 ease-in-out ${
          isDark ? "translate-x-8" : "translate-x-1"
        }`}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Sun className="h-3.5 w-3.5 text-amber-500" />
        )}
      </span>
    </button>
  );
}
