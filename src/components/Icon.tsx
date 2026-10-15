import type { LucideIcon, LucideProps } from 'lucide-react'
import { cn } from '../lib/utils'

export function Icon({
  icon: IconComponent,
  className,
  size = 20,
  strokeWidth = 1.6,
  ...props
}: LucideProps & { icon: LucideIcon }) {
  return (
    <IconComponent
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      className={cn('shrink-0 align-middle', className)}
      {...props}
    />
  )
}
