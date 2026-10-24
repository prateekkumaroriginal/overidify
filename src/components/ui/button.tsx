import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const ghostStyles = "gap-0 rounded-[5px] border-0 bg-transparent text-sm font-normal hover:bg-accent hover:text-foreground"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-[9px] rounded-[7px] text-xs font-bold no-underline disabled:opacity-45 aria-busy:cursor-wait aria-busy:opacity-100",
  {
    variants: {
      variant: {
        default: "clerk-button clerk-button-primary",
        destructive: "clerk-button clerk-button-destructive",
        outline: "border bg-card hover:border-primary/20 hover:bg-accent",
        "destructive-outline": "border border-input bg-transparent text-destructive hover:border-destructive/40 hover:bg-destructive/10",
        secondary: "clerk-button clerk-button-secondary",
        ghost: ghostStyles,
        "ghost-muted": [ghostStyles, "text-muted-foreground hover:bg-foreground/10"],
        "destructive-ghost": [ghostStyles, "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"],
        option: "gap-0 rounded-none border-0 bg-transparent text-left text-xs font-normal text-muted-foreground whitespace-normal wrap-anywhere hover:bg-transparent aria-pressed:text-primary",
        navigation: "border border-transparent bg-transparent text-xs font-bold hover:bg-transparent",
        link: "gap-0 rounded-none border-0 bg-transparent font-normal text-foreground underline underline-offset-[3px]",
      },
      size: {
        default: "h-[30px] min-h-[30px] px-3.5 py-0 [&_svg]:size-4",
        sm: "h-[30px] min-h-[30px] px-2.5 py-0 [&_svg]:size-4",
        lg: "h-auto min-h-[46px] gap-[9px] px-5 py-[13px] [&_svg]:size-5",
        choice: "h-auto min-h-[30px] gap-4 p-4 [&_svg]:size-5",
        option: "h-auto min-h-[26px] min-w-0 p-2.5",
        inline: "h-auto min-h-0 min-w-0 px-1.5 py-[1px]",
        icon: "size-[30px] min-h-[30px] min-w-[30px] shrink-0 gap-0 p-0 [&_svg]:size-5",
        "icon-sm": "size-[26px] min-h-[26px] min-w-[26px] shrink-0 gap-0 p-0 [&_svg]:size-[15px]",
        "icon-field": "size-[26px] min-h-[26px] min-w-[26px] shrink-0 gap-0 p-0 [&_svg]:size-4",
        "icon-lg": "size-9 min-h-9 min-w-9 shrink-0 gap-0 p-0 [&_svg]:size-5",
        "icon-action": "size-[26px] min-h-[26px] min-w-[26px] shrink-0 gap-0 p-0 [&_svg]:size-[14px]",
      },
    },
    compoundVariants: [
      {
        variant: ["default", "destructive", "secondary"],
        className: "rounded-[6px] border-0 text-[13px] font-medium leading-[24px] text-left whitespace-nowrap [&>svg]:p-px [&>svg]:stroke-2",
      },
      { variant: ["default", "destructive", "secondary"], size: ["default", "sm"], className: "gap-1.5 px-3" },
      { variant: "secondary", size: ["default", "sm"], className: "py-[3px]" },
    ],
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
  const resolvedSize = size ?? "default"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={resolvedSize}
      className={cn(buttonVariants({ variant, size: resolvedSize }), className)}
      {...props}
    />
  )
}

export { Button }
