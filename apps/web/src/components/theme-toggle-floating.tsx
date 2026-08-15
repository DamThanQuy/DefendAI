"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { motion } from "framer-motion";

/**
 * Sliding theme toggle fixed at the bottom-right corner.
 * The knob slides between Sun (light) and Moon (dark).
 */
export function FloatingThemeToggle() {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, x: 24 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ type: "spring", stiffness: 120, damping: 18, delay: 0.3 }}
      className="fixed bottom-5 right-5 z-[100]"
    >
      <button
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className="relative flex h-9 w-16 items-center rounded-full border border-border bg-muted shadow-lg transition-colors hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary/50 overflow-hidden"
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
          {mounted && isDark ? (
            <Moon className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Sun className="h-3.5 w-3.5 text-amber-500" />
          )}
        </span>
      </button>
    </motion.div>
  );
}
