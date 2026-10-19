import { getDomainPattern } from './pattern.ts'
import { HeaderPairSchema } from './schema-fields.ts'
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
  return { name: '', url: '*', enabled: true, headers: [createHeaderPair()] }
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
    url: rule.url,
    enabled: rule.enabled,
    headers: copyHeaders(rule.headers),
  }
}

export function switchRuleToDraft(switchRule: SwitchRule): SwitchRuleDraft {
  return {
    name: switchRule.name,
    url: switchRule.url,
    enabled: switchRule.enabled,
    selectedOptionId: switchRule.selectedOptionId,
    options: switchRule.options.map((option) => ({ ...option, headers: copyHeaders(option.headers) })),
  }
}

export function sanitizeHeaders(headers: HeaderPair[]): HeaderPair[] {
  return headers
    .map((header) => ({ key: header.key.trim(), value: header.value.trim() }))
    .filter((header) => header.key || header.value)
}

function normalizeHeaders(input: unknown): HeaderPair[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((header: unknown) => {
    const parsed = HeaderPairSchema.safeParse(header)
    if (!parsed.success) return []
    const key = parsed.data.key.trim(), value = parsed.data.value.trim()
    return key && value ? [{ key, value }] : []
  })
}

function normalizeEntry(input: unknown, index: number): RequestHeaderRule[] {
  const parsed = PersistedRequestHeaderRuleSchema.safeParse(input)
  if (!parsed.success) return []
  const candidate = parsed.data
  const id = candidate.id
  const url = candidate.url.trim() || '*'
  const base = {
    id,
    name: candidate.name.trim(),
    url: getDomainPattern(url) || url,
    enabled: candidate.enabled,
    order: candidate.order ?? index,
  }
  if (candidate.kind === 'header-rule') {
    return [{
      ...base,
      kind: 'header-rule',
      headers: normalizeHeaders(candidate.headers),
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
