import type { HeaderRule } from '../lib/types'
import { ToggleSwitch } from './ToggleSwitch'

type HeaderRulesListProps = {
  headerRules: HeaderRule[]
  headerRuleHref: (headerRule: HeaderRule) => string
  onToggle: (headerRule: HeaderRule, enabled: boolean) => void
  disabled?: boolean
  openInTab?: boolean
}

export function HeaderRulesList({
  headerRules,
  headerRuleHref,
  onToggle,
  disabled,
  openInTab,
}: HeaderRulesListProps) {
  return (
    <ul className="m-0 list-none p-0">
      {headerRules.map((headerRule, index) => (
        <li
          className="animate-[rise-in_350ms_both] border-b border-border px-6 transition-colors hover:bg-accent focus-within:bg-accent last:border-b-0 mobile:px-[15px] flex min-h-20 items-center gap-4 mobile:gap-2.5"
          key={headerRule.id}
          style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
        >
          <ToggleSwitch
            checked={headerRule.enabled}
            label={`Enable ${headerRule.name}`}
            disabled={disabled}
            onChange={(enabled) => onToggle(headerRule, enabled)}
          />
          <a
            className="flex min-w-0 flex-1 items-center gap-4 py-5 no-underline"
            href={headerRuleHref(headerRule)}
            target={openInTab ? '_blank' : undefined}
            rel={openInTab ? 'noreferrer' : undefined}
          >
            <span className="grid min-w-0 flex-1 gap-[5px]">
              <span className="text-xs font-semibold wrap-anywhere mobile:text-[11px]">{headerRule.name}</span>
              <span className="font-sans text-[11px] text-muted-foreground wrap-anywhere">{headerRule.url}</span>
            </span>
            <span className="min-w-[92px] text-[11px] text-muted-foreground [&>span]:text-[10px] tablet:min-w-[68px] mobile:hidden">
              {headerRule.headers.length}{' '}
              <span>header{headerRule.headers.length === 1 ? '' : 's'}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}
