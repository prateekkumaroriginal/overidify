import { useState } from 'react'
import { getSelectedOption } from '../lib/rules'
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
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  function toggleDetails(ruleId: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(ruleId)) next.delete(ruleId)
      else next.add(ruleId)
      return next
    })
  }
  return (
    <ul className="rule-list">
      {switchers.map((rule, index) => {
        const isExpanded = expanded.has(rule.id)
        const option = getSelectedOption(rule)
        const detailsId = `rule-headers-${rule.id}`
        return (
          <li
            className={`rule-row switcher-row ${rule.enabled ? '' : 'rule-paused'}`}
            key={rule.id}
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
          >
            <div className="rule-summary">
              <ToggleSwitch
                checked={rule.enabled}
                label={`Enable ${rule.name}`}
                disabled={disabled}
                onChange={(enabled) => onToggle(rule, enabled)}
              />
              <button
                className="rule-description rule-expand"
                type="button"
                aria-expanded={isExpanded}
                aria-controls={detailsId}
                onClick={() => toggleDetails(rule.id)}
              >
                <span className="rule-name">{rule.name}</span>
                <span className="rule-url">{rule.url}</span>
              </button>
              <SwitcherOptionSelect
                switcher={rule}
                disabled={disabled}
                onChange={(optionId) => onSelectOption(rule, optionId)}
              />
            </div>
            <div className="rule-details" id={detailsId} hidden={!isExpanded}>
              <dl className="rule-headers">
                {option.headers.map((header, headerIndex) => (
                  <div className="rule-header-pair" key={headerIndex}>
                    <dt>{header.key}</dt>
                    <dd>{header.value}</dd>
                  </div>
                ))}
              </dl>
              <a className="edit-rule-link" href={switcherHref(rule)}>Edit switcher</a>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
