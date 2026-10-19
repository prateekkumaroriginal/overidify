import { exportRules } from './rule-transfer'
import type { RuleCollection } from './rule-transfer'

export function downloadRules(rules: RuleCollection, name = 'rules') {
  const url = URL.createObjectURL(new Blob([exportRules(rules)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `overidify-${name}-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
