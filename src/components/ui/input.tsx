import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-auto w-full min-w-0 rounded-md border border-input bg-[#1d1d1d] px-3 py-[11px] text-xs font-normal text-foreground placeholder:text-[#888888] placeholder:italic placeholder:opacity-100 hover:border-[#707070] focus:border-[#919191] focus:bg-[#222222] focus:shadow-[0_0_0_3px_#a5a5a514] focus:outline-none",
        className
      )}
      {...props}
    />
  )
}

export { Input }
