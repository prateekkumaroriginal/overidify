import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-auto w-full min-w-0 rounded-md border border-input bg-field px-3 py-[11px] text-xs font-normal text-foreground placeholder:text-muted-foreground placeholder:italic placeholder:opacity-100 hover:border-primary/20 focus:border-ring focus:bg-field focus:ring-3 focus:ring-ring/15 focus:outline-none",
        className
      )}
      {...props}
    />
  )
}

export { Input }
