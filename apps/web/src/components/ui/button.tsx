import * as React from "react"
import { cn } from "@/lib/utils"

const variants = {
  default: "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98] shadow-glow",
  destructive: "bg-critical border border-critical-border text-critical hover:bg-critical/80",
  outline: "border border-border bg-transparent hover:border-primary hover:text-primary text-foreground transition-all duration-200",
  secondary: "bg-muted text-foreground hover:bg-zinc-800",
  ghost: "hover:bg-zinc-800/50 hover:text-primary text-muted-foreground transition-all duration-200",
  link: "text-primary underline-offset-4 hover:underline",
}

const sizes = {
  default: "h-10 px-5 py-2",
  sm: "h-9 px-4 text-xs",
  lg: "h-12 px-8 text-base",
  icon: "h-10 w-10",
}

const base = "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"

type Variant = keyof typeof variants
type Size = keyof typeof sizes

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "default", size = "default", asChild = false, children, ...props },
    ref,
  ) {
    const classes = cn(base, variants[variant], sizes[size], className)

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, {
        ...props,
        className: cn(classes, (children.props as { className?: string }).className),
      } as React.HTMLAttributes<HTMLElement>)
    }

    return (
      <button
        ref={ref}
        className={classes}
        {...props}
      >
        {children}
      </button>
    )
  },
)
