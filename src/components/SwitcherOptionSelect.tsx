import type { HeaderSwitcher } from '../lib/types'

type SwitcherOptionSelectProps = {
  switcher: HeaderSwitcher
  disabled?: boolean
  onChange: (optionId: string) => void
}

export function SwitcherOptionSelect({ switcher, disabled, onChange }: SwitcherOptionSelectProps) {
  if (switcher.options.length < 2) return null
  return (
    <select
      className="rule-option-select"
      aria-label={`Option for ${switcher.name}`}
      value={switcher.selectedOptionId}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {switcher.options.map((option) => (
        <option key={option.id} value={option.id}>{option.name}</option>
      ))}
    </select>
  )
}
