import type { SwitchRule } from '../lib/types'
import { SwitchRuleOptionSelect } from './SwitchRuleOptionSelect'
import { RuleCard } from './RuleCard'
import type { RuleSelection } from './RuleSelection'
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
    <ul className="m-0 grid list-none gap-3.5 p-0">
      {switchRules.map((rule, index) => (
        <RuleCard key={rule.id} rule={rule} href={switchRuleHref(rule)} index={index}
          pending={pending} selection={selection} actions={actions} onToggle={(enabled) => onToggle(rule, enabled)}>
          <SwitchRuleOptionSelect switchRule={rule} pending={pending} className="mt-1.5"
            onChange={(optionId) => onSelectOption(rule, optionId)} />
        </RuleCard>
      ))}
    </ul>
  )
}
