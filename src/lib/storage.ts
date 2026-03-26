import type { HeaderPair, HeaderRule, RuleDraft } from './types'

export const STORAGE_KEY = 'headerRules'

export function createHeaderPair(): HeaderPair {
  return { key: '', value: '' }
}

export function createRuleDraft(): RuleDraft {
  return {
    name: '',
    url: '*',
    enabled: true,
    headers: [createHeaderPair()],
  }
}

export function createRuleId(): string {
  return crypto.randomUUID()
}

export function ruleToDraft(rule: HeaderRule): RuleDraft {
  return {
    name: rule.name,
    url: rule.url,
    enabled: rule.enabled,
    headers: rule.headers.map((header) => ({ ...header })),
  }
}

function normalizeHeaderPair(input: unknown): HeaderPair | null {
  if (!input || typeof input !== 'object') {
    return null
  }

  const candidate = input as Partial<HeaderPair>
  const key = typeof candidate.key === 'string' ? candidate.key.trim() : ''
  const value = typeof candidate.value === 'string' ? candidate.value.trim() : ''

  if (!key || !value) {
    return null
  }

  return { key, value }
}

function normalizeRule(input: unknown, index: number): HeaderRule {
  const candidate = input && typeof input === 'object' ? (input as Partial<HeaderRule>) : {}
  const headers = Array.isArray(candidate.headers)
    ? candidate.headers.map(normalizeHeaderPair).filter((header): header is HeaderPair => header !== null)
    : []

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : createRuleId(),
    name: typeof candidate.name === 'string' ? candidate.name.trim() : '',
    url: typeof candidate.url === 'string' && candidate.url.trim() ? candidate.url.trim() : '*',
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : true,
    headers,
    order: typeof candidate.order === 'number' ? candidate.order : index,
  }
}

export function normalizeRules(input: unknown): HeaderRule[] {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map(normalizeRule)
    .sort((left, right) => left.order - right.order)
    .map((rule, index) => ({
      ...rule,
      order: index,
    }))
}

export async function getRules(): Promise<HeaderRule[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEY)
  return normalizeRules(stored[STORAGE_KEY])
}

export async function saveRules(rules: HeaderRule[]): Promise<HeaderRule[]> {
  const normalized = normalizeRules(rules)
  await chrome.storage.local.set({ [STORAGE_KEY]: normalized })
  return normalized
}
