import { normalizeWebsiteScope } from './pattern.ts'
import { isBlank, PersistedHeaderPairSchema } from './schema-fields.ts'
import { trimTemplateEdges } from './templates.ts'
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

export function getSelectedOption<Option extends { id: string }>(switchRule: { options: Option[]; selectedOptionId: string }): Option {
  return switchRule.options.find((option) => option.id === switchRule.selectedOptionId) ?? switchRule.options[0]
}

type HeaderSource<Pair> = { kind: 'header-rule'; headers: Pair[] } | { kind: 'switch-rule'; options: { id: string; headers: Pair[] }[]; selectedOptionId: string }
export function getEntryHeaders<Pair>(entry: HeaderSource<Pair>): Pair[] {
  return entry.kind === 'header-rule' ? entry.headers : getSelectedOption(entry).headers
}

function copyHeaders(headers: HeaderPair[]): HeaderPair[] {
  return structuredClone(headers)
}

export function headerRuleToDraft(rule: HeaderRule): HeaderRuleDraft {
  return {
    name: structuredClone(rule.name),
    url: structuredClone(rule.url),
    enabled: rule.enabled,
    headers: copyHeaders(rule.headers),
  }
}

export function switchRuleToDraft(switchRule: SwitchRule): SwitchRuleDraft {
  return {
    name: structuredClone(switchRule.name),
    url: structuredClone(switchRule.url),
    enabled: switchRule.enabled,
    selectedOptionId: switchRule.selectedOptionId,
    options: structuredClone(switchRule.options),
  }
}

export function sanitizeHeaders(headers: HeaderPair[]): HeaderPair[] {
  return headers
    .map((header) => ({ key: trimTemplateEdges(header.key), value: trimTemplateEdges(header.value) }))
    .filter((header) => !isBlank(header.key) || !isBlank(header.value))
}

function normalizeHeaders(input: unknown): HeaderPair[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((header: unknown) => {
    const parsed = PersistedHeaderPairSchema.safeParse(header)
    if (!parsed.success) return []
    const key = trimTemplateEdges(parsed.data.key), value = trimTemplateEdges(parsed.data.value)
    return !isBlank(key) && !isBlank(value) ? [{ key, value }] : []
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
    name: trimTemplateEdges(candidate.name),
    url: normalizeWebsiteScope(url),
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
          name: isBlank(option.name) ? `Option ${optionIndex + 1}` : trimTemplateEdges(option.name),
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
