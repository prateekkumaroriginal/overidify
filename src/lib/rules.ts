import { getDomainPattern } from './pattern.ts'
import type {
  HeaderEntry,
  HeaderPair,
  HeaderRule,
  HeaderSwitcher,
  RuleDraft,
  SwitcherDraft,
  SwitcherOption,
} from './types'

export function createHeaderPair(): HeaderPair {
  return { key: '', value: '' }
}

export function createRuleId(): string {
  return crypto.randomUUID()
}

export function createRuleDraft(): RuleDraft {
  return { name: '', url: '*', enabled: true, headers: [createHeaderPair()] }
}

export function createSwitcherOption(name = 'Option 1'): SwitcherOption {
  return { id: createRuleId(), name, headers: [createHeaderPair()] }
}

export function createSwitcherDraft(): SwitcherDraft {
  const option = createSwitcherOption()
  return {
    name: '',
    url: '*',
    enabled: true,
    options: [option],
    selectedOptionId: option.id,
  }
}

export function getSelectedOption(switcher: SwitcherDraft): SwitcherOption {
  return switcher.options.find((option) => option.id === switcher.selectedOptionId) ?? switcher.options[0]
}

export function getEntryHeaders(entry: HeaderEntry): HeaderPair[] {
  return entry.kind === 'rule' ? entry.headers : getSelectedOption(entry).headers
}

function copyHeaders(headers: HeaderPair[]): HeaderPair[] {
  return headers.map((header) => ({ ...header }))
}

export function ruleToDraft(rule: HeaderRule): RuleDraft {
  return {
    name: rule.name,
    url: rule.url,
    enabled: rule.enabled,
    headers: copyHeaders(rule.headers),
  }
}

export function switcherToDraft(switcher: HeaderSwitcher): SwitcherDraft {
  return {
    name: switcher.name,
    url: switcher.url,
    enabled: switcher.enabled,
    selectedOptionId: switcher.selectedOptionId,
    options: switcher.options.map((option) => ({ ...option, headers: copyHeaders(option.headers) })),
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
    if (!header || typeof header !== 'object') return []
    const candidate = header as Partial<HeaderPair>
    const key = typeof candidate.key === 'string' ? candidate.key.trim() : ''
    const value = typeof candidate.value === 'string' ? candidate.value.trim() : ''
    return key && value ? [{ key, value }] : []
  })
}

function normalizeEntry(input: unknown, index: number): HeaderEntry {
  const candidate =
    input && typeof input === 'object'
      ? (input as Omit<Partial<HeaderSwitcher>, 'kind'> & { headers?: unknown; kind?: unknown })
      : {}
  const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : createRuleId()
  const base = {
    id,
    name: typeof candidate.name === 'string' ? candidate.name.trim() : '',
    url: typeof candidate.url === 'string' && candidate.url.trim() ? candidate.url.trim() : '*',
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : true,
    order: typeof candidate.order === 'number' && Number.isFinite(candidate.order) ? candidate.order : index,
  }
  const rawOptions: unknown[] = Array.isArray(candidate.options) ? candidate.options : []
  const defaultOption = rawOptions.length === 1 && rawOptions[0] && typeof rawOptions[0] === 'object'
    ? (rawOptions[0] as Partial<SwitcherOption>)
    : undefined
  // Undo the prior migration of regular rules into a single Default option.
  // Explicit switchers keep their type even when only one option remains.
  const isSwitcher = candidate.kind === 'switcher' || (
    candidate.kind !== 'rule' && rawOptions.length > 0 &&
    !(defaultOption && typeof defaultOption.name === 'string' && defaultOption.name.trim() === 'Default')
  )
  if (!isSwitcher) {
    return {
      ...base,
      kind: 'rule',
      headers: normalizeHeaders(candidate.headers ?? defaultOption?.headers),
    }
  }

  const usedIds = new Set<string>()
  const options: SwitcherOption[] = rawOptions.length
    ? rawOptions.map((input: unknown, optionIndex) => {
        const option = input && typeof input === 'object' ? (input as Partial<SwitcherOption>) : {}
        let optionId = typeof option.id === 'string' && option.id.trim() ? option.id : `${id}-option-${optionIndex + 1}`
        while (usedIds.has(optionId)) optionId += '-copy'
        usedIds.add(optionId)
        return {
          id: optionId,
          name: typeof option.name === 'string' && option.name.trim() ? option.name.trim() : `Option ${optionIndex + 1}`,
          headers: normalizeHeaders(option.headers),
        }
      })
    : [{ id: `${id}-default`, name: 'Option 1', headers: normalizeHeaders(candidate.headers) }]
  return {
    ...base,
    kind: 'switcher',
    url: getDomainPattern(base.url) || base.url,
    options,
    selectedOptionId: options.find((option) => option.id === candidate.selectedOptionId)?.id ?? options[0].id,
  }
}

export function normalizeEntries(input: unknown): HeaderEntry[] {
  if (!Array.isArray(input)) return []
  return input
    .map(normalizeEntry)
    .sort((left, right) => left.order - right.order)
    .map((entry, index) => ({ ...entry, order: index }))
}
