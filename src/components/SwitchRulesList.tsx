import type { SwitchRule } from '../lib/types'
import { SwitchRuleOptionSelect } from './SwitchRuleOptionSelect'
import { RuleCard } from './RuleCard'
import type { RuleSelection } from './RuleSelection'
import type { RuleRowActionHandlers } from './RuleRowActions'
import type { RuleResolution } from '../lib/resolve-rules'

type SwitchRulesListProps = {
  switchRules: SwitchRule[]
  switchRuleHref: (rule: SwitchRule) => string
  onToggle: (rule: SwitchRule, enabled: boolean) => void
  onSelectOption: (rule: SwitchRule, optionId: string) => void
  selection?: RuleSelection
  pending?: boolean
  actions?: RuleRowActionHandlers
  resolutions?: Map<string, RuleResolution>
}

export function SwitchRulesList({ switchRules, switchRuleHref, onToggle, onSelectOption, pending, selection, actions, resolutions }: SwitchRulesListProps) {
  return (
    <ul className="m-0 grid list-none gap-3.5 p-0">
      {switchRules.map((rule, index) => (
        <RuleCard key={rule.id} rule={rule} href={switchRuleHref(rule)} index={index}
          pending={pending} selection={selection} actions={actions} resolution={resolutions?.get(rule.id)} onToggle={(enabled) => onToggle(rule, enabled)}>
          <SwitchRuleOptionSelect switchRule={rule} pending={pending} className="mt-1.5" resolution={resolutions?.get(rule.id)}
            onChange={(optionId) => onSelectOption(rule, optionId)} />
        </RuleCard>
      ))}
    </ul>
  )
}
