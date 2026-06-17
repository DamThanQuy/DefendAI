import * as React from "react"
import { cn } from "@/lib/utils"

const variants = {
  default: "bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg",
  destructive: "bg-red-500 text-white hover:bg-red-600 shadow-sm",
  outline: "border-2 border-gray-200 bg-transparent hover:border-blue-500 hover:text-blue-600 text-gray-700",
  secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
  ghost: "hover:bg-blue-50 hover:text-blue-600 text-gray-700",
  link: "text-blue-600 underline-offset-4 hover:underline",
}

const sizes = {
  default: "h-10 px-5 py-2",
  sm: "h-9 px-4 text-xs",
  lg: "h-12 px-8 text-base",
  icon: "h-10 w-10",
}

const base = "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50"

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

export { Button }
