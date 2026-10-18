import { Switch } from '@/components/ui/switch'

type ToggleSwitchProps = {
  checked: boolean
  label: string
  onChange: (nextValue: boolean) => void
  disabled?: boolean
  pending?: boolean
  size?: 'sm' | 'default'
}

export function ToggleSwitch({
  checked,
  label,
  onChange,
  disabled = false,
  pending = false,
  size = 'default',
}: ToggleSwitchProps) {
  // Keep focus and opacity stable while a save temporarily blocks changes.
  return (
    <Switch
      size={size}
      checked={checked}
      aria-label={label}
      disabled={disabled}
      aria-disabled={disabled || pending}
      aria-busy={pending || undefined}
      className="aria-busy:cursor-wait aria-busy:opacity-100"
      onCheckedChange={(nextValue) => { if (!pending) onChange(nextValue) }}
    />
  )
}
