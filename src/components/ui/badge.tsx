import type * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex w-fit items-center justify-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        domain: 'min-w-0 max-w-full border-domain-tag/45 bg-domain-tag/18 px-2.5 font-mono text-[11px] font-normal text-foreground wrap-anywhere',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({ className, variant = 'default', asChild = false, ...props }: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'
  return <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge }
