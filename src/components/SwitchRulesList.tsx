import type { SwitchRule } from '../lib/types'
import { SwitchRuleOptionSelect } from './SwitchRuleOptionSelect'
import { ToggleSwitch } from './ToggleSwitch'
import { RuleSelectionCheckbox } from './RuleSelection'
import type { RuleSelection } from './RuleSelection'
import { RuleRowActions } from './RuleRowActions'
import type { RuleRowActionHandlers } from './RuleRowActions'

type SwitchRulesListProps = {
  switchRules: SwitchRule[]
  switchRuleHref: (rule: SwitchRule) => string
  onToggle: (rule: SwitchRule, enabled: boolean) => void
  onSelectOption: (rule: SwitchRule, optionId: string) => void
  selection?: RuleSelection
  pending?: boolean
  actions?: RuleRowActionHandlers
}

export function SwitchRulesList({ switchRules, switchRuleHref, onToggle, onSelectOption, pending, selection, actions }: SwitchRulesListProps) {
  return (
    <ul className="m-0 list-none p-0">
      {switchRules.map((rule, index) => {
        return (
          <li
            className="rule-row group/rule animate-[rise-in_350ms_both] border-b border-border px-6 transition-colors hover:bg-accent focus-within:bg-accent last:border-b-0 mobile:px-[15px] mobile:min-h-[86px]"
            key={rule.id}
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
          >
            <div className="flex min-h-20 flex-wrap items-center gap-x-4 mobile:gap-x-2.5">
              <RuleSelectionCheckbox id={rule.id} name={rule.name} selection={selection} />
              <ToggleSwitch
                checked={rule.enabled}
                label={`Enable ${rule.name}`}
                pending={pending}
                onChange={(enabled) => onToggle(rule, enabled)}
              />
              <a
                className="grid min-w-[120px] flex-1 gap-[5px] py-5 no-underline"
                href={switchRuleHref(rule)}
              >
                <span className="text-xs font-semibold wrap-anywhere mobile:text-[11px]">{rule.name}</span>
                <span className="font-sans text-[11px] text-muted-foreground wrap-anywhere">{rule.url}</span>
              </a>
              <SwitchRuleOptionSelect
                switchRule={rule}
                pending={pending}
                onChange={(optionId) => onSelectOption(rule, optionId)}
              />
              <RuleRowActions rule={rule} actions={selection ? undefined : actions} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
