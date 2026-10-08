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
    <input
      className="toggle-switch"
      type="checkbox"
      role="switch"
      checked={checked}
      aria-label={label}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
  )
}
