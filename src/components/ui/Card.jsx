import * as React from "react"
import { cn } from "../../lib/utils"

const Card = React.forwardRef(({ className, noPadding, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-[var(--border-normal)]",
      !noPadding && "p-5",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef(({ className, title, actions, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 pb-3", className)}
    {...props}
  >
    {title ? (
      <div className="flex items-center justify-between w-full">
        <h3 className="font-bold text-base md:text-lg leading-tight tracking-tight text-[var(--text-primary)]">
          {title}
        </h3>
        {actions}
      </div>
    ) : children}
  </div>
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("font-bold text-base md:text-lg leading-tight tracking-tight text-[var(--text-primary)]", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs text-[var(--text-muted)]", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center pt-0 border-t border-[var(--border-subtle)] mt-4", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export default Card
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
