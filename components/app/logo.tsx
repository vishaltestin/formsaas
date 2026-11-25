import { cn } from "@/lib/utils"

/** Digital Fueled mark: a cobalt tile with a "D" counter and an amber spark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-5 shrink-0", className)} fill="none">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" className="fill-primary" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.75 6.5h4.6a5.5 5.5 0 0 1 0 11h-4.6v-11Zm2.6 2.45v6.1h2a3.05 3.05 0 0 0 0-6.1h-2Z"
        className="fill-primary-foreground"
      />
      <circle cx="17.6" cy="6.6" r="1.75" className="fill-warm" />
    </svg>
  )
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      {!compact && (
        <span>
          Digital <span className="text-primary">Fueled</span>
        </span>
      )}
    </span>
  )
}
