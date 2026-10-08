import * as React from "react"
import { cn } from "@/lib/utils"
import { Switch as SwitchPrimitive } from "radix-ui"

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "group/switch inline-flex h-[19px] w-8 shrink-0 items-center rounded-[20px] border border-[#585858] bg-[#424242] transition-[background,border-color] duration-200 ease-[ease] disabled:cursor-wait disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none ml-0.5 block size-[13px] rounded-full bg-[#f2f2f2] shadow-[0_1px_3px_#00000040] transition-transform duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] data-[state=checked]:translate-x-[13px] data-[state=checked]:bg-[#242424]"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
