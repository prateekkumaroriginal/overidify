import { Switch } from '@/components/ui/switch'

type ToggleSwitchProps = {
  checked: boolean
  label: string
  onChange: (nextValue: boolean) => void
  disabled?: boolean
}

export function ToggleSwitch({
  checked,
  label,
  onChange,
  disabled = false,
}: ToggleSwitchProps) {
  return (
    <Switch
      checked={checked}
      aria-label={label}
      disabled={disabled}
      onCheckedChange={onChange}
    />
  )
}
