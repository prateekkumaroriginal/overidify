import type { HeaderRule } from '../lib/types'
import { ToggleSwitch } from './ToggleSwitch'

type RulesListProps = {
  rules: HeaderRule[]
  ruleHref: (rule: HeaderRule) => string
  onToggle: (rule: HeaderRule, enabled: boolean) => void
  disabled?: boolean
  openInTab?: boolean
}

export function RulesList({ rules, ruleHref, onToggle, disabled, openInTab }: RulesListProps) {
  return (
    <ul className="rule-list">
      {rules.map((rule) => (
        <li className="rule-row" key={rule.id}>
          <a className="rule-link" href={ruleHref(rule)} target={openInTab ? '_blank' : undefined} rel={openInTab ? 'noreferrer' : undefined}>
            <span className="rule-name">{rule.name}</span>
            <span className="rule-url">{rule.url}</span>
            <span className="hint">{rule.headers.length} header{rule.headers.length === 1 ? '' : 's'} · {rule.enabled ? 'Enabled' : 'Disabled'}</span>
          </a>
          <ToggleSwitch checked={rule.enabled} label={`Enable ${rule.name}`} disabled={disabled}
            onChange={(enabled) => onToggle(rule, enabled)} />
        </li>
      ))}
    </ul>
  )
}
