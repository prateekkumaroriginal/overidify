import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-[9px] rounded-[7px] text-xs font-bold no-underline disabled:opacity-45 [&_svg[data-icon=inline-start]]:size-4",
  {
    variants: {
      variant: {
        default: "clerk-button clerk-button-primary",
        destructive: "clerk-button clerk-button-destructive",
        outline: "border bg-card hover:border-primary/20 hover:bg-accent",
        "destructive-outline": "border border-input bg-transparent text-destructive hover:border-destructive/40 hover:bg-destructive/10 [&_svg]:size-4",
        secondary: "clerk-button clerk-button-secondary",
        ghost: "gap-0 rounded-[5px] border-0 bg-transparent text-sm font-normal hover:bg-accent hover:text-foreground",
        link: "gap-0 border-0 bg-transparent font-normal text-foreground underline-offset-[3px] hover:underline",
      },
      size: {
        default: "min-h-[30px] px-3.5 py-0",
        sm: "min-h-[30px] px-2.5 py-0",
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
