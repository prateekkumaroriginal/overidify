import type { HeaderRule } from '../lib/types'
import { RuleCard } from './RuleCard'
import type { RuleCheck } from '../lib/rule-resolution'
import type { RuleSelection } from './RuleSelection'
import type { RuleRowActionHandlers } from './RuleRowActions'

type HeaderRulesListProps = {
  headerRules: HeaderRule[]
  headerRuleHref: (headerRule: HeaderRule) => string
  onToggle: (headerRule: HeaderRule, enabled: boolean) => void
  pending?: boolean
  openInTab?: boolean
  selection?: RuleSelection
  actions?: RuleRowActionHandlers
  checks?: ReadonlyMap<string, RuleCheck>
}

export function HeaderRulesList({
  headerRules,
  headerRuleHref,
  onToggle,
  pending,
  openInTab,
  selection,
  actions,
  checks,
}: HeaderRulesListProps) {
  return (
    <ul className="m-0 grid list-none gap-3.5 p-0">
      {headerRules.map((headerRule, index) => (
        <RuleCard
          key={headerRule.id}
          rule={headerRule}
          href={headerRuleHref(headerRule)}
          index={index}
          pending={pending}
          openInTab={openInTab}
          selection={selection}
          actions={actions}
          check={checks?.get(headerRule.id)}
          onToggle={(enabled) => onToggle(headerRule, enabled)}
        >
          {headerRule.headers.length} header{headerRule.headers.length === 1 ? '' : 's'}
        </RuleCard>
      ))}
    </ul>
  )
}
