import { normalizeRequestDomains, normalizeWebsiteScope } from './pattern.ts'
import { isBlankTemplate, isStoredTemplate, normalizeStoredTemplate, trimTemplate } from './templates.ts'
import { PersistedRequestHeaderRuleSchema, PersistedSwitchRuleOptionSchema } from './persisted-request-header-schemas.ts'
import type {
  RequestHeaderRule,
  HeaderPair,
  HeaderRule,
  SwitchRule,
  HeaderRuleDraft,
  SwitchRuleDraft,
  SwitchRuleOption,
} from './types'

export function createHeaderPair(): HeaderPair {
  return { key: '', value: '' }
}

export function createRuleId(): string {
  return crypto.randomUUID()
}

export function createHeaderRuleDraft(): HeaderRuleDraft {
  return { name: '', url: '*', enabled: true, headers: [createHeaderPair()], excludedRequestDomains: [] }
}

export function createSwitchRuleOption(name = 'Option 1'): SwitchRuleOption {
  return { id: createRuleId(), name, headers: [createHeaderPair()] }
}

export function createSwitchRuleDraft(): SwitchRuleDraft {
  const option = createSwitchRuleOption()
  return {
    name: '',
    url: '*',
    enabled: true,
    options: [option],
    selectedOptionId: option.id,
  }
}

export function getSelectedOption(switchRule: SwitchRuleDraft): SwitchRuleOption {
  return switchRule.options.find((option) => option.id === switchRule.selectedOptionId) ?? switchRule.options[0]
}

export function getEntryHeaders(entry: RequestHeaderRule): HeaderPair[] {
  return entry.kind === 'header-rule' ? entry.headers : getSelectedOption(entry).headers
}

function copyHeaders(headers: HeaderPair[]): HeaderPair[] {
  return headers.map((header) => ({ ...header }))
}

export function headerRuleToDraft(rule: HeaderRule): HeaderRuleDraft {
  return {
    name: rule.name,
    url: structuredClone(rule.url),
    enabled: rule.enabled,
    headers: copyHeaders(rule.headers),
    excludedRequestDomains: [...rule.excludedRequestDomains ?? []],
  }
}

export function switchRuleToDraft(switchRule: SwitchRule): SwitchRuleDraft {
  return {
    name: switchRule.name,
    url: structuredClone(switchRule.url),
    enabled: switchRule.enabled,
    selectedOptionId: switchRule.selectedOptionId,
    options: switchRule.options.map((option) => ({ ...option, headers: copyHeaders(option.headers) })),
  }
}

export function sanitizeHeaders(headers: HeaderPair[]): HeaderPair[] {
  return headers
    .map((header) => ({ key: trimTemplate(header.key), value: trimTemplate(header.value) }))
    .filter((header) => !isBlankTemplate(header.key) || !isBlankTemplate(header.value))
}

function normalizeHeaders(input: unknown): HeaderPair[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((header: unknown) => {
    if (!header || typeof header !== 'object') return []
    const { key, value } = header as Record<string, unknown>
    if (!isStoredTemplate(key) || !isStoredTemplate(value)) return []
    const pair = { key: trimTemplate(normalizeStoredTemplate(key)), value: trimTemplate(normalizeStoredTemplate(value)) }
    return isBlankTemplate(pair.key) || isBlankTemplate(pair.value) ? [] : [pair]
  })
}

function normalizeEntry(input: unknown, index: number): RequestHeaderRule[] {
  const parsed = PersistedRequestHeaderRuleSchema.safeParse(input)
  if (!parsed.success) return []
  const candidate = parsed.data
  const id = candidate.id
  const url = typeof candidate.url === 'string' ? candidate.url.trim() || '*' : candidate.url
  const base = {
    id,
    name: candidate.name.trim(),
    url: normalizeWebsiteScope(url),
    enabled: candidate.enabled,
    order: candidate.order ?? index,
  }
  if (candidate.kind === 'header-rule') {
    const excludedRequestDomains = normalizeRequestDomains(candidate.excludedRequestDomains)
    return [{
      ...base,
      kind: 'header-rule',
      headers: normalizeHeaders(candidate.headers),
      ...excludedRequestDomains.length ? { excludedRequestDomains } : {},
    }]
  }

  const rawOptions = candidate.options
  const usedIds = new Set<string>()
  if (rawOptions.some(option => !PersistedSwitchRuleOptionSchema.safeParse(option).success)) return []
  const options: SwitchRuleOption[] = rawOptions.length
    ? rawOptions.map((input: unknown, optionIndex) => {
        const option = PersistedSwitchRuleOptionSchema.parse(input)
        let optionId = option.id
        while (usedIds.has(optionId)) optionId = createRuleId()
        usedIds.add(optionId)
        return {
          id: optionId,
          name: option.name.trim() ? option.name.trim() : `Option ${optionIndex + 1}`,
          headers: normalizeHeaders(option.headers),
        }
      })
    : [{ id: createRuleId(), name: 'Option 1', headers: [] }]
  return [{
    ...base,
    kind: 'switch-rule',
    options,
    selectedOptionId: options.find((option) => option.id === candidate.selectedOptionId)?.id ?? options[0].id,
  }]
}

export function normalizeRequestHeaderRules(input: unknown): RequestHeaderRule[] {
  if (!Array.isArray(input)) return []
  return input
    .flatMap(normalizeEntry)
    .sort((left, right) => left.order - right.order)
    .map((entry, index) => ({ ...entry, order: index }))
}
