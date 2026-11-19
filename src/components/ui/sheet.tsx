import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { DialogContent } from './dialog'

export {
  Dialog as Sheet,
  DialogHeader as SheetHeader,
  DialogTitle as SheetTitle,
  DialogTrigger as SheetTrigger,
} from './dialog'

// Share the dialog's focus, dismissal, and close controls with the side panel.
export function SheetContent({ className, ...props }: ComponentProps<typeof DialogContent>) {
  return <DialogContent data-slot="sheet-content" className={cn(
    'inset-y-0 right-0 left-auto flex h-dvh max-h-none w-full max-w-[440px] translate-x-0 translate-y-0 flex-col overflow-hidden rounded-none border-y-0 border-r-0 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
    className,
  )} {...props} />
}
