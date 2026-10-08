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
    <ul className="rule-list">
      {rules.map((rule, index) => (
        <li
          className={`rule-row regular-rule-row ${rule.enabled ? '' : 'rule-paused'}`}
          key={rule.id}
          style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
        >
          <a
            className="rule-link"
            href={ruleHref(rule)}
            target={openInTab ? '_blank' : undefined}
            rel={openInTab ? 'noreferrer' : undefined}
          >
            <span className="rule-description">
              <span className="rule-name">{rule.name}</span>
              <span className="rule-url">{rule.url}</span>
            </span>
            <span className="header-count">
              {rule.headers.length}{' '}
              <span>header{rule.headers.length === 1 ? '' : 's'}</span>
            </span>
          </a>
          <ToggleSwitch
            checked={rule.enabled}
            label={`Enable ${rule.name}`}
            disabled={disabled}
            onChange={(enabled) => onToggle(rule, enabled)}
          />
        </li>
      ))}
    </ul>
  )
}
