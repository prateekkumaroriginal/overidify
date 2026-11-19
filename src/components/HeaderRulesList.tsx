import type { HeaderRule } from '../lib/types'
import { RuleCard } from './RuleCard'
import type { RuleSelection } from './RuleSelection'
import type { RuleRowActionHandlers } from './RuleRowActions'
import type { RuleResolution } from '../lib/resolve-rules'

type HeaderRulesListProps = {
  headerRules: HeaderRule[]
  headerRuleHref: (headerRule: HeaderRule) => string
  onToggle: (headerRule: HeaderRule, enabled: boolean) => void
  pending?: boolean
  openInTab?: boolean
  selection?: RuleSelection
  actions?: RuleRowActionHandlers
  resolutions?: Map<string, RuleResolution>
}

export function HeaderRulesList({
  headerRules,
  headerRuleHref,
  onToggle,
  pending,
  openInTab,
  selection,
  actions,
  resolutions,
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
          resolution={resolutions?.get(headerRule.id)}
          onToggle={(enabled) => onToggle(headerRule, enabled)}
        >
          {headerRule.headers.length} header{headerRule.headers.length === 1 ? '' : 's'}
        </RuleCard>
      ))}
    </ul>
  )
}
