import { TriangleAlert } from 'lucide-react'
import type { SwitchRule } from '../lib/types'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { cn } from '../lib/utils'
import { displayText } from '../lib/templates'
import type { RuleResolution } from '../lib/resolve-rules'
import { TemplateTextView } from './TemplateText'
import { Icon } from './Icon'

type SwitchRuleOptionSelectProps = {
  switchRule: SwitchRule
  disabled?: boolean
  pending?: boolean
  onChange: (optionId: string) => void
  size?: 'sm' | 'default'
  className?: string
  resolution?: RuleResolution
}

/** Broken options stay selectable; selecting one makes the rule inactive until it is fixed. */
export function SwitchRuleOptionSelect({ switchRule, disabled, pending = false, onChange, size = 'default', className, resolution }: SwitchRuleOptionSelectProps) {
  if (switchRule.options.length < 2) return null
  return (
    <Select
      value={switchRule.selectedOptionId}
      disabled={disabled}
      onValueChange={(optionId) => { if (!pending) onChange(optionId) }}
    >
      <SelectTrigger
        size={size}
        className={cn('w-[132px] mobile:w-28', size === 'sm' && 'w-[104px] mobile:w-[104px]', className)}
        aria-label={`Option for ${displayText(switchRule.name)}`}
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
          {switchRule.options.map((option) => {
            const broken = (resolution?.optionIssues[option.id]?.length ?? 0) > 0
            return <SelectItem key={option.id} value={option.id} textValue={displayText(option.name)}>
              <span className="inline-flex min-w-0 items-center gap-1">
                {broken && <Icon icon={TriangleAlert} size={12} className="shrink-0 text-destructive" />}
                <TemplateTextView value={option.name} className="min-w-0" />
                {broken && <span className="sr-only"> (variable problem)</span>}
              </span>
            </SelectItem>
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
