import type { HeaderRule } from '../lib/types'
import { ToggleSwitch } from './ToggleSwitch'

type RulesListProps = {
  rules: HeaderRule[]
  ruleHref: (rule: HeaderRule) => string
  onToggle: (rule: HeaderRule, enabled: boolean) => void
  disabled?: boolean
  openInTab?: boolean
}

export function RulesList({
  rules,
  ruleHref,
  onToggle,
  disabled,
  openInTab,
}: RulesListProps) {
  return (
    <ul className="m-0 list-none p-0">
      {rules.map((rule, index) => (
        <li
          className="animate-[rise-in_350ms_both] border-b border-[#343434] px-6 transition-colors hover:bg-[#262626] focus-within:bg-[#262626] last:border-b-0 mobile:px-[15px] flex min-h-20 items-center gap-4 mobile:gap-2.5"
          key={rule.id}
          style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
        >
          <ToggleSwitch
            checked={rule.enabled}
            label={`Enable ${rule.name}`}
            disabled={disabled}
            onChange={(enabled) => onToggle(rule, enabled)}
          />
          <a
            className="flex min-w-0 flex-1 items-center gap-4 py-5 no-underline"
            href={ruleHref(rule)}
            target={openInTab ? '_blank' : undefined}
            rel={openInTab ? 'noreferrer' : undefined}
          >
            <span className="grid min-w-0 flex-1 gap-[5px]">
              <span className="text-xs font-semibold wrap-anywhere mobile:text-[11px]">{rule.name}</span>
              <span className="font-mono text-[11px] text-[#ababab] wrap-anywhere">{rule.url}</span>
            </span>
            <span className="min-w-[92px] text-[11px] text-[#b4b4b4] [&>span]:text-[10px] tablet:min-w-[68px] mobile:hidden">
              {rule.headers.length}{' '}
              <span>header{rule.headers.length === 1 ? '' : 's'}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}
