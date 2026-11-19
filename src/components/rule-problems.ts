import { useMemo } from 'react'
import { resolveNetworkRule, resolveRequestHeaderRule } from '../lib/rule-resolution'
import type { RuleCheck, RuleProblem } from '../lib/rule-resolution'
import { indexVariables } from '../lib/variables'
import type { NetworkRuleDraft } from '../lib/network-rules'
import type { HeaderRuleDraft, SwitchRuleDraft } from '../lib/types'
import { useVariables } from './variables-context'

const DRAFT_ID = '00000000-0000-4000-8000-000000000000'
export const TURNED_OFF_NOTE = "This rule can't run with the current variables, so it is saved turned off. Fix the fields below, then turn it on."
export const TURNED_OFF_SAVED = 'Saved turned off: fix the variable problems, then turn the rule on.'

type Draft = { kind: 'header-rule'; value: HeaderRuleDraft } | { kind: 'switch-rule'; value: SwitchRuleDraft } | { kind: 'network-rule'; value: NetworkRuleDraft }
const empty: RuleCheck = { problems: [], optionProblems: {}, domains: [] }

/** Live variable problems in an editor draft. Empty until variables load, so nothing flashes red. */
export function useDraftCheck(draft: Draft): RuleCheck {
  const variables = useVariables()
  return useMemo(() => {
    if (!variables) return empty
    const index = indexVariables(variables)
    if (draft.kind === 'network-rule') return resolveNetworkRule({ ...draft.value, id: DRAFT_ID, order: 0 }, index)
    return resolveRequestHeaderRule(draft.kind === 'header-rule'
      ? { ...draft.value, id: DRAFT_ID, order: 0, kind: 'header-rule' }
      : { ...draft.value, id: DRAFT_ID, order: 0, kind: 'switch-rule' }, index)
  }, [draft.kind, draft.value, variables])
}

export const problemAt = (problems: RuleProblem[], path: (string | number)[]) =>
  problems.find(problem => problem.path.join('.') === path.join('.'))?.message

