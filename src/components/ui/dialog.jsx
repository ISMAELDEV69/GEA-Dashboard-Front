import * as React from "react"
import { X } from "lucide-react"
import { cn } from "../../lib/utils"

function Dialog({ open, onOpenChange, children }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10 animate-in fade-in-0 duration-200">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => onOpenChange && onOpenChange(false)}
      />
      {/* Content Container */}
      <div className="relative z-50 w-full max-w-6xl max-h-[90vh] flex flex-col rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-normal)] text-[var(--text-primary)] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {children}
      </div>
    </div>
  )
}

function DialogHeader({ className, children, ...props }) {
  return (
    <div className={cn("flex items-center justify-between p-6 pb-4 border-b border-[var(--border-subtle)]", className)} {...props}>
      {children}
    </div>
  )
}

function DialogTitle({ className, ...props }) {
  return <h2 className={cn("text-lg md:text-xl font-bold tracking-tight text-[var(--text-primary)]", className)} {...props} />
}

function DialogDescription({ className, ...props }) {
  return <p className={cn("text-xs text-[var(--text-muted)] mt-0.5", className)} {...props} />
}

function DialogClose({ onClose }) {
  return (
    <button
      onClick={onClose}
      className="rounded-full p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
    >
      <X className="h-5 w-5" />
      <span className="sr-only">Cerrar</span>
    </button>
  )
}

function DialogContent({ className, children, ...props }) {
  return (
    <div className={cn("flex-1 overflow-y-auto p-6 custom-scrollbar", className)} {...props}>
      {children}
    </div>
  )
}

export { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogContent }
