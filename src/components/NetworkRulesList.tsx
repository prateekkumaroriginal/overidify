import type { NetworkRule } from '../lib/network-rules'
import { TemplateTextView } from './TemplateText'
import { RuleCard } from './RuleCard'
import type { RuleSelection } from './RuleSelection'
import type { RuleRowActionHandlers } from './RuleRowActions'
import type { RuleResolution } from '../lib/resolve-rules'

export function NetworkRulesList({ networkRules, pending, onToggle, selection, actions, resolutions }: {
  networkRules: NetworkRule[]
  pending: boolean
  onToggle: (networkRule: NetworkRule, enabled: boolean) => void
  selection?: RuleSelection
  actions?: RuleRowActionHandlers
  resolutions?: Map<string, RuleResolution>
}) {
  return (
    <ul className="m-0 grid list-none gap-3.5 p-0">
      {networkRules.map((networkRule, index) => (
        <RuleCard key={networkRule.id} rule={networkRule} href={`#/network-rules/${encodeURIComponent(networkRule.id)}`}
          index={index} pending={pending} selection={selection} actions={actions} resolution={resolutions?.get(networkRule.id)}
          websiteDetails={`${networkRule.mode === 'bypass' ? 'Bypass server' : 'Call server'} · ${networkRule.status}`}
          onToggle={(enabled) => onToggle(networkRule, enabled)}>
          {networkRule.method === 'ANY' ? 'Any' : networkRule.method} <TemplateTextView value={networkRule.requestUrl} />
        </RuleCard>
      ))}
    </ul>
  )
}
