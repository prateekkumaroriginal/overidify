import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-[9px] rounded-[7px] text-xs font-bold no-underline disabled:opacity-45",
  {
    variants: {
      variant: {
        default: "border border-transparent bg-[#e5e5e5] text-primary-foreground hover:bg-white",
        destructive: "border border-transparent bg-destructive text-background hover:bg-destructive/90",
        outline: "border bg-card hover:border-[#505050] hover:bg-[#2e2e2e]",
        secondary: "border border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "gap-0 rounded-[5px] border-0 bg-transparent text-sm font-normal hover:bg-[#2f2f2f] hover:text-foreground",
        link: "gap-0 border-0 bg-transparent font-normal text-foreground underline-offset-[3px] hover:underline",
      },
      size: {
        default: "min-h-[46px] px-5 py-[13px]",
        sm: "min-h-[35px] px-2.5 py-[7px]",
        icon: "inline-grid min-h-[26px] min-w-[26px] place-items-center p-[5px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size: size ?? (variant === "ghost" || variant === "link" ? "icon" : "default"), className }))}
      {...props}
    />
  )
}

export { Button }
