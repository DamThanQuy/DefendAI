import * as React from "react"
import { cn } from "@/lib/utils"

const variants = {
  default: "bg-gradient-to-r from-teal-600 to-cyan-500 text-white hover:from-teal-500 hover:to-cyan-400 shadow-md shadow-teal-500/20 hover:shadow-lg hover:shadow-teal-500/30",
  destructive: "bg-red-600 text-white hover:bg-red-500 shadow-sm",
  outline: "border border-zinc-700 bg-zinc-900/40 hover:border-teal-500 hover:text-teal-400 text-zinc-200",
  secondary: "bg-zinc-800 text-zinc-200 hover:bg-zinc-700",
  ghost: "hover:bg-zinc-800 hover:text-teal-400 text-zinc-300",
  link: "text-teal-400 underline-offset-4 hover:underline",
}

const sizes = {
  default: "h-10 px-5 py-2",
  sm: "h-9 px-4 text-xs",
  lg: "h-12 px-8 text-base",
  icon: "h-10 w-10",
}

const base = "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:pointer-events-none disabled:opacity-50"

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
