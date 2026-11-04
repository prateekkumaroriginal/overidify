import { matchesPageDomain } from './pattern.ts'
import { getEntryHeaders, getSelectedOption } from './request-header-rules.ts'
import { HeaderLedgerSchema } from './execution-schemas.ts'
import type { ExecutionRule, HeaderInstallation } from './execution-history.ts'
import type { RequestHeaderRule } from './types'

const SESSION_RULE_OFFSET = 1000

export type PageTab = { id?: number; url?: string }

const RESOURCE_TYPES: chrome.declarativeNetRequest.ResourceType[] = [
  // A top-level navigation changes the website; it is not a request made by it.
  chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
  chrome.declarativeNetRequest.ResourceType.STYLESHEET,
  chrome.declarativeNetRequest.ResourceType.SCRIPT,
  chrome.declarativeNetRequest.ResourceType.IMAGE,
  chrome.declarativeNetRequest.ResourceType.FONT,
  chrome.declarativeNetRequest.ResourceType.OBJECT,
  chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
  chrome.declarativeNetRequest.ResourceType.PING,
  chrome.declarativeNetRequest.ResourceType.CSP_REPORT,
  chrome.declarativeNetRequest.ResourceType.MEDIA,
  chrome.declarativeNetRequest.ResourceType.WEBSOCKET,
  chrome.declarativeNetRequest.ResourceType.WEBBUNDLE,
  chrome.declarativeNetRequest.ResourceType.OTHER,
]

type CompiledHeaderRule = { source: RequestHeaderRule; compiled: chrome.declarativeNetRequest.Rule }

function compileRequestHeaderRules(
  rules: RequestHeaderRule[],
  tabs: PageTab[],
): CompiledHeaderRule[] {
  return [...rules]
    .sort((left, right) => left.order - right.order)
    .filter((rule) => rule.enabled && getEntryHeaders(rule).length > 0)
    .flatMap<CompiledHeaderRule>((rule, index) => {
      const tabIds = tabs
        .filter((tab) => tab.id !== undefined && tab.id >= 0 && matchesPageDomain(rule.url, tab.url ?? ''))
        .map((tab) => tab.id!)
      if (!tabIds.length) return []
      return [{ source: rule, compiled: {
        id: SESSION_RULE_OFFSET + index,
        priority: SESSION_RULE_OFFSET + index,
        action: {
          type: 'modifyHeaders',
          requestHeaders: getEntryHeaders(rule).map((header) => ({
            header: header.key,
            operation: 'set',
            value: header.value,
          })),
        },
        condition: {
          tabIds,
          regexFilter: '^(https?|wss?)://',
          resourceTypes: RESOURCE_TYPES,
        },
      } }]
    })
}

export function requestHeaderRulesToSessionRules(rules: RequestHeaderRule[], tabs: PageTab[]): chrome.declarativeNetRequest.Rule[] {
  return compileRequestHeaderRules(rules, tabs).map(entry => entry.compiled)
}

export async function syncRequestHeaderSessionRules(rules: RequestHeaderRule[], tabs: PageTab[]): Promise<void> {
  const [dynamicRules, existingRules, stored] = await Promise.all([
    chrome.declarativeNetRequest.getDynamicRules(),
    chrome.declarativeNetRequest.getSessionRules(),
    chrome.storage.session.get('headerExecutionLedger'),
  ])

  const parsed = HeaderLedgerSchema.safeParse(stored.headerExecutionLedger)
  const ledger = parsed.success ? parsed.data : { next: SESSION_RULE_OFFSET - 1, entries: [] as HeaderInstallation[] }
  ledger.next = Math.max(ledger.next, ...existingRules.map(rule => rule.id))
  const time = Date.now()
  const entries = ledger.entries.filter(entry => entry.retiredAt === undefined || entry.retiredAt > time - 10 * 60_000)
  const compiled = compileRequestHeaderRules(rules, tabs)
  const additions: chrome.declarativeNetRequest.Rule[] = []
  const active = new Set<number>()
  for (const { source, compiled: browserRule } of compiled) {
    const snapshot: ExecutionRule = { id: source.id, kind: source.kind, name: source.name, url: source.url,
      headers: getEntryHeaders(source).map(header => ({ ...header })),
      ...(source.kind === 'switch-rule' ? { option: getSelectedOption(source).name } : {}) }
    for (const tabId of browserRule.condition.tabIds ?? []) {
      const condition = { ...browserRule.condition, tabIds: [tabId] }
      const signature = JSON.stringify({ rule: snapshot, condition, action: browserRule.action, priority: browserRule.priority })
      let installed = entries.find(entry => entry.signature === signature && existingRules.some(rule => rule.id === entry.id))
      if (!installed) {
        if (ledger.next >= 2_147_483_647) throw new Error('Header rule IDs are exhausted. Restart Chrome to start a new session.')
        installed = { id: ++ledger.next, tabId, signature, rule: snapshot }
        entries.push(installed)
      }
      active.add(installed.id)
      additions.push({ ...browserRule, id: installed.id, condition })
    }
  }
  // Save new identities before installing. A worker restart must not reuse an
  // ID or assign a later edit to an occurrence already recorded by Chrome.
  let snapshotsRetained = true
  try { await chrome.storage.session.set({ headerExecutionLedger: { next: ledger.next, entries } }) }
  catch {
    // Keep the ID reservation, but discard unavailable snapshots. Diagnostics
    // must not stop otherwise valid header changes when session storage fills.
    await chrome.storage.session.set({ headerExecutionLedger: { next: ledger.next, entries: [] } })
    snapshotsRetained = false
  }

  // Header changes use tab-scoped session rules exclusively.
  if (dynamicRules.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: dynamicRules.map((rule) => rule.id),
    })
  }
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: existingRules.map((rule) => rule.id),
    addRules: additions,
  })
  for (const entry of entries) {
    if (active.has(entry.id)) delete entry.retiredAt
    else entry.retiredAt ??= time
  }
  if (snapshotsRetained) {
    try { await chrome.storage.session.set({ headerExecutionLedger: { next: ledger.next, entries } }) }
    catch { /* The prepared ledger already preserves every installed identity. */ }
  }
}

export async function readHeaderInstallations(): Promise<HeaderInstallation[]> {
  const stored = await chrome.storage.session.get('headerExecutionLedger')
  const parsed = HeaderLedgerSchema.safeParse(stored.headerExecutionLedger)
  return parsed.success ? parsed.data.entries : []
}
