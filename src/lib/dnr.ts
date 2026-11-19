import { matchesPageDomain } from './pattern.ts'
import { getEntryHeaders, getSelectedOption } from './request-header-rules.ts'
import { HeaderLedgerSchema } from './execution-schemas.ts'
import type { ExecutionRule, HeaderInstallation } from './execution-history.ts'
import type { ResolvedRequestHeaderRule } from './types'
import { hasReferences } from './templates.ts'

const SESSION_RULE_OFFSET = 1000

/** An application-owned activation message. Browser errors can quote settings, including variable values. */
export class HeaderActivationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HeaderActivationError'
  }
}
export function headerActivationMessage(error: unknown) {
  return error instanceof HeaderActivationError ? error.message : 'The extension could not apply the header rules. Reload the extension and try again.'
}

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

/** Resolved settings plus, when variables may be involved, the template snapshot recorded in history. */
export type InstallableHeaderRule = ResolvedRequestHeaderRule & { execution?: ExecutionRule }
type CompiledHeaderRule = { source: InstallableHeaderRule; compiled: chrome.declarativeNetRequest.Rule }

function compileRequestHeaderRules(
  rules: InstallableHeaderRule[],
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

export function requestHeaderRulesToSessionRules(rules: InstallableHeaderRule[], tabs: PageTab[]): chrome.declarativeNetRequest.Rule[] {
  return compileRequestHeaderRules(rules, tabs).map(entry => entry.compiled)
}

function snapshotOf(source: InstallableHeaderRule): ExecutionRule {
  return source.execution ? structuredClone(source.execution) : { id: source.id, kind: source.kind, name: source.name, url: source.url,
    headers: getEntryHeaders(source).map(header => ({ ...header })),
    ...(source.kind === 'switch-rule' ? { option: getSelectedOption(source).name } : {}) }
}

/** Lowercased resolved header names Overidify sets from a variable: 'value' hides the value, 'drop' hides the header. */
export type HeaderRedaction = Map<string, 'value' | 'drop'>
/** Per tab; null means the installed configuration cannot be established. */
export type HeaderRedactionByTab = Map<number, HeaderRedaction | null>
export type HeaderSyncHooks = {
  beforeInstall?: (previous: HeaderRedactionByTab, next: HeaderRedactionByTab) => void
  afterInstall?: (ok: boolean) => void
}

function addRedaction(byTab: HeaderRedactionByTab, tabId: number, snapshot: ExecutionRule | undefined, installed: chrome.declarativeNetRequest.ModifyHeaderInfo[]) {
  if (byTab.get(tabId) === null) return
  if (!snapshot || snapshot.headers.length !== installed.length) { byTab.set(tabId, null); return }
  const redaction = byTab.get(tabId) ?? new Map()
  snapshot.headers.forEach((header, index) => {
    const name = installed[index].header.toLowerCase()
    if (hasReferences(header.key)) redaction.set(name, 'drop')
    else if (hasReferences(header.value) && redaction.get(name) !== 'drop') redaction.set(name, 'value')
  })
  byTab.set(tabId, redaction)
}

export async function syncRequestHeaderSessionRules(rules: InstallableHeaderRule[], tabs: PageTab[], hooks: HeaderSyncHooks = {}): Promise<void> {
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
  const next: HeaderRedactionByTab = new Map()
  for (const { source, compiled: browserRule } of compiled) {
    const snapshot = snapshotOf(source)
    for (const tabId of browserRule.condition.tabIds ?? []) {
      const condition = { ...browserRule.condition, tabIds: [tabId] }
      addRedaction(next, tabId, snapshot, browserRule.action.requestHeaders ?? [])
      // Never sign resolved values: the template snapshot identifies the installed version.
      const signature = JSON.stringify({ rule: snapshot, condition, priority: browserRule.priority })
      let installed = entries.find(entry => entry.signature === signature && existingRules.some(rule => rule.id === entry.id))
      if (!installed) {
        if (ledger.next >= 2_147_483_647) throw new HeaderActivationError('Header rule IDs are exhausted. Restart Chrome to start a new session.')
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

  // Observations stay protected under both the installed and the next settings
  // until the browser confirms the change. Installed rules without a retained
  // snapshot have unknown provenance, so their tabs fail closed.
  const previous: HeaderRedactionByTab = new Map()
  const snapshots = new Map(ledger.entries.map(entry => [entry.id, entry.rule]))
  for (const rule of existingRules) {
    for (const tabId of rule.condition.tabIds ?? []) addRedaction(previous, tabId, snapshots.get(rule.id), rule.action.requestHeaders ?? [])
  }
  hooks.beforeInstall?.(previous, next)
  try {
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
  } catch {
    hooks.afterInstall?.(false)
    // Browser errors can quote the settings they rejected, including variable values.
    throw new HeaderActivationError('The browser did not apply the header rules. Reload the extension and try again.')
  }
  hooks.afterInstall?.(true)
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
