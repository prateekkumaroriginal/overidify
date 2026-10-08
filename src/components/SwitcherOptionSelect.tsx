import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { HeaderSwitcher } from '../lib/types'

type SwitcherOptionSelectProps = {
  switcher: HeaderSwitcher
  disabled?: boolean
  onChange: (optionId: string) => void
}

export function SwitcherOptionSelect({ switcher, disabled, onChange }: SwitcherOptionSelectProps) {
  if (switcher.options.length < 2) return null
  return (
    <NativeSelect
      className="w-[132px] mobile:w-28 mobile:text-[11px]"
      aria-label={`Option for ${switcher.name}`}
      value={switcher.selectedOptionId}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {switcher.options.map((option) => (
        <NativeSelectOption key={option.id} value={option.id}>{option.name}</NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
