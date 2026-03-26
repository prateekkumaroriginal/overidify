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
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
        checked
          ? 'border-sky-300/60 bg-sky-400/20'
          : 'border-white/10 bg-white/5'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-white/25'}`}
    >
      <span
        className={`absolute h-5 w-5 rounded-full bg-white shadow-lg transition ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
