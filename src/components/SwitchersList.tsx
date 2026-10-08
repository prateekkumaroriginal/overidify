import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { getSelectedOption } from '../lib/rules'
import type { HeaderSwitcher } from '../lib/types'
import { SwitcherOptionSelect } from './SwitcherOptionSelect'
import { ToggleSwitch } from './ToggleSwitch'

type SwitchersListProps = {
  switchers: HeaderSwitcher[]
  switcherHref: (rule: HeaderSwitcher) => string
  onToggle: (rule: HeaderSwitcher, enabled: boolean) => void
  onSelectOption: (rule: HeaderSwitcher, optionId: string) => void
  disabled?: boolean
}

export function SwitchersList({ switchers, switcherHref, onToggle, onSelectOption, disabled }: SwitchersListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  function toggleDetails(ruleId: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(ruleId)) next.delete(ruleId)
      else next.add(ruleId)
      return next
    })
  }
  return (
    <ul className="m-0 list-none p-0">
      {switchers.map((rule, index) => {
        const isExpanded = expanded.has(rule.id)
        const option = getSelectedOption(rule)
        const detailsId = `rule-headers-${rule.id}`
        return (
          <li
            className="animate-[rise-in_350ms_both] border-b border-[#343434] px-6 transition-colors hover:bg-[#262626] focus-within:bg-[#262626] last:border-b-0 mobile:px-[15px] mobile:min-h-[86px]"
            key={rule.id}
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
          >
            <div className="flex min-h-20 items-center gap-4 mobile:gap-2.5">
              <ToggleSwitch
                checked={rule.enabled}
                label={`Enable ${rule.name}`}
                disabled={disabled}
                onChange={(enabled) => onToggle(rule, enabled)}
              />
              <Button variant="ghost" className="grid h-auto min-w-0 flex-1 shrink place-items-stretch justify-normal gap-[5px] rounded-none px-0 py-5 text-left whitespace-normal hover:bg-transparent"
                type="button"
                aria-expanded={isExpanded}
                aria-controls={detailsId}
                onClick={() => toggleDetails(rule.id)}
              >
                <span className="text-xs font-semibold wrap-anywhere mobile:text-[11px]">{rule.name}</span>
                <span className="font-mono text-[11px] text-[#ababab] wrap-anywhere">{rule.url}</span>
              </Button>
              <SwitcherOptionSelect
                switcher={rule}
                disabled={disabled}
                onChange={(optionId) => onSelectOption(rule, optionId)}
              />
            </div>
            <div className="border-t pt-[15px] pb-[18px] pl-12 mobile:pl-0" id={detailsId} hidden={!isExpanded}>
              <dl className="m-0">
                {option.headers.map((header, headerIndex) => (
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-4 py-[5px] text-xs wrap-anywhere [&_dt]:text-[#aaa] [&_dd]:m-0 [&_dd]:whitespace-pre-wrap" key={headerIndex}>
                    <dt>{header.key}</dt>
                    <dd>{header.value}</dd>
                  </div>
                ))}
              </dl>
              <a className="mt-[13px] inline-block text-xs text-[#bcbcbc] no-underline hover:text-foreground" href={switcherHref(rule)}>Edit switcher</a>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
