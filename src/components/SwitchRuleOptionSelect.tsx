import type { SwitchRule } from '../lib/types'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { cn } from '../lib/utils'

type SwitchRuleOptionSelectProps = {
  switchRule: SwitchRule
  disabled?: boolean
  pending?: boolean
  onChange: (optionId: string) => void
  size?: 'sm' | 'default'
}

export function SwitchRuleOptionSelect({ switchRule, disabled, pending = false, onChange, size = 'default' }: SwitchRuleOptionSelectProps) {
  if (switchRule.options.length < 2) return null
  return (
    <Select
      value={switchRule.selectedOptionId}
      disabled={disabled}
      onValueChange={(optionId) => { if (!pending) onChange(optionId) }}
    >
      <SelectTrigger
        size={size}
        className={cn('w-[132px] mobile:w-28', size === 'sm' && 'w-[104px] mobile:w-[104px]')}
        aria-label={`Option for ${switchRule.name}`}
        aria-disabled={disabled || pending}
        aria-busy={pending || undefined}
        onPointerDown={(event) => { if (pending) event.preventDefault() }}
        onClick={(event) => { if (pending) event.preventDefault() }}
        onKeyDown={(event) => { if (pending && event.key !== 'Tab') event.preventDefault() }}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          {switchRule.options.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
