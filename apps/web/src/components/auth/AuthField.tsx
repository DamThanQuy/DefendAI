"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

type BaseProps = {
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
};

/** Text input with a left icon (Code Candy style). */
export const AuthField = React.forwardRef<
  HTMLInputElement,
  BaseProps & React.InputHTMLAttributes<HTMLInputElement>
>(function AuthField({ icon: Icon, className, ...props }, ref) {
  return (
    <div className="relative">
      {Icon && (
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
      )}
      <input
        ref={ref}
        className={cn(
          "h-12 w-full rounded-xl border border-zinc-300 bg-white pl-11 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400",
          "transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30",
          className,
        )}
        {...props}
      />
    </div>
  );
});

/** Password input with left lock icon + right show/hide toggle. */
export const AuthPasswordField = React.forwardRef<
  HTMLInputElement,
  BaseProps & React.InputHTMLAttributes<HTMLInputElement>
>(function AuthPasswordField({ icon: Icon, className, ...props }, ref) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      {Icon && (
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
      )}
      <input
        ref={ref}
        type={show ? "text" : "password"}
        className={cn(
          "h-12 w-full rounded-xl border border-zinc-300 bg-white pl-11 pr-11 text-sm text-zinc-900 placeholder:text-zinc-400",
          "transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30",
          className,
        )}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors hover:text-violet-600"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
});
