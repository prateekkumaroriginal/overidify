import { Switch } from '@/components/ui/switch'

type ToggleSwitchProps = {
  checked: boolean
  label: string
  onChange: (nextValue: boolean) => void
  disabled?: boolean
  size?: 'sm' | 'default'
}

export function ToggleSwitch({
  checked,
  label,
  onChange,
  disabled = false,
  size = 'default',
}: ToggleSwitchProps) {
  return (
    <Switch
      size={size}
      checked={checked}
      aria-label={label}
      disabled={disabled}
      onCheckedChange={onChange}
    />
  )
}
