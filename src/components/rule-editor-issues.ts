import { useMemo } from 'react'
import type { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form'
import { resolveNetworkRule, resolveRequestHeaderRule } from '../lib/resolve-rules'
import type { IssuePath, RuleIssue, RuleResolution } from '../lib/resolve-rules'
import { renameTemplateReferences } from '../lib/templates'
import type { TemplateText } from '../lib/templates'
import type { NetworkRuleDraft } from '../lib/network-rules'
import type { HeaderRuleDraft, SwitchRuleDraft } from '../lib/types'
import { useVariableRenames, useVariableValues } from './variables-context'

export const INACTIVE_STATUS = 'Saved rules with variable problems stay inactive.'
export const INACTIVE_SAVED = 'Inactive until the variable problems are fixed.'
const DRAFT_ID = '00000000-0000-4000-8000-000000000000'

export const issueKey = (path: IssuePath) => path.join('.')

export type DraftIssues = { byPath: Map<string, string>; blocking: boolean; resolution: RuleResolution }

function collect(resolution: RuleResolution): DraftIssues {
  const byPath = new Map<string, string>()
  const all: RuleIssue[] = [...resolution.issues, ...Object.values(resolution.optionIssues).flat()]
  for (const issue of all) if (!byPath.has(issueKey(issue.path))) byPath.set(issueKey(issue.path), issue.message)
  return { byPath, blocking: resolution.issues.length > 0, resolution }
}

type Draft = { kind: 'header-rule'; value: HeaderRuleDraft } | { kind: 'switch-rule'; value: SwitchRuleDraft } | { kind: 'network-rule'; value: NetworkRuleDraft }

export function resolveDraftIssues(draft: Draft, values: ReadonlyMap<string, string>): DraftIssues {
  if (draft.kind === 'network-rule') return collect(resolveNetworkRule({ ...draft.value, id: DRAFT_ID, order: 0 }, values).resolution)
  const rule = draft.kind === 'header-rule'
    ? { ...draft.value, id: DRAFT_ID, order: 0, kind: 'header-rule' as const }
    : { ...draft.value, id: DRAFT_ID, order: 0, kind: 'switch-rule' as const }
  return collect(resolveRequestHeaderRule(rule, values).resolution)
}

/** Live variable problems for an editor draft, re-evaluated as saved variables change. */
export function useDraftIssues(draft: Draft): DraftIssues {
  const values = useVariableValues()
  return useMemo(() => resolveDraftIssues(draft, values), [draft, values])
}

function isTemplateObject(value: unknown): value is { template: unknown[] } {
  return !!value && typeof value === 'object' && Array.isArray((value as { template?: unknown }).template)
}

function remap<T>(value: T, mapping: Map<string, string>, path: string[] = [], changed: string[] = []): T {
  if (isTemplateObject(value)) {
    const next = renameTemplateReferences(value as TemplateText, mapping)
    if (next !== value) changed.push(path.join('.'))
    return next as T
  }
  if (Array.isArray(value)) return value.map((item, index) => remap(item, mapping, [...path, String(index)], changed)) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item, mapping, [...path, key], changed)])) as T
  return value
}

/** A rename saved elsewhere remaps references in both the draft and its saved baseline, so dirty state is unchanged. */
export function useRenameRemap<Values extends FieldValues>(form: UseFormReturn<Values>, extra?: (mapping: Map<string, string>) => void) {
  useVariableRenames(mapping => {
    const defaults = remap(form.formState.defaultValues, mapping)
    form.reset(defaults as Values, { keepValues: true, keepDirty: true, keepTouched: true, keepErrors: true, keepIsSubmitted: true, keepSubmitCount: true })
    const changed: string[] = []
    const values = form.getValues()
    remap(values, mapping, [], changed)
    for (const path of changed) {
      const current = form.getValues(path as Path<Values>)
      form.setValue(path as Path<Values>, remap(current, mapping) as PathValue<Values, Path<Values>>, { shouldDirty: true })
    }
    extra?.(mapping)
  })
}

/** Domain problems by index, for the website domain field. */
export function domainIssues(issues: DraftIssues): Map<number, string> {
  const result = new Map<number, string>()
  for (const [path, message] of issues.byPath) {
    const match = /^url\.(\d+)$/.exec(path)
    if (match) result.set(Number(match[1]), message)
  }
  return result
}
