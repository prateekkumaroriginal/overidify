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
  return (
    <ul className="m-0 list-none p-0">
      {switchers.map((rule, index) => {
        return (
          <li
            className="animate-[rise-in_350ms_both] border-b border-border px-6 transition-colors hover:bg-accent focus-within:bg-accent last:border-b-0 mobile:px-[15px] mobile:min-h-[86px]"
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
              <a
                className="grid min-w-0 flex-1 gap-[5px] py-5 no-underline"
                href={switcherHref(rule)}
              >
                <span className="text-xs font-semibold wrap-anywhere mobile:text-[11px]">{rule.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground wrap-anywhere">{rule.url}</span>
              </a>
              <SwitcherOptionSelect
                switcher={rule}
                disabled={disabled}
                onChange={(optionId) => onSelectOption(rule, optionId)}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
