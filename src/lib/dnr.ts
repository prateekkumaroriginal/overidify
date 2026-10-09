import { matchesPageDomain } from './pattern.ts'
import { getEntryHeaders } from './rules.ts'
import type { HeaderEntry } from './types'

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

export function rulesToSessionRules(
  rules: HeaderEntry[],
  tabs: PageTab[],
): chrome.declarativeNetRequest.Rule[] {
  return [...rules]
    .sort((left, right) => left.order - right.order)
    .filter((rule) => rule.enabled && getEntryHeaders(rule).length > 0)
    .flatMap((rule, index) => {
      const tabIds = tabs
        .filter((tab) => tab.id !== undefined && tab.id >= 0 && matchesPageDomain(rule.url, tab.url ?? ''))
        .map((tab) => tab.id!)
      if (!tabIds.length) return []
      return [{
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
      }]
    })
}

export async function syncSessionRules(rules: HeaderEntry[], tabs: PageTab[]): Promise<void> {
  const [legacyRules, existingRules] = await Promise.all([
    chrome.declarativeNetRequest.getDynamicRules(),
    chrome.declarativeNetRequest.getSessionRules(),
  ])

  // Remove destination-based rules left by previous extension versions.
  if (legacyRules.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: legacyRules.map((rule) => rule.id),
    })
  }
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: existingRules.map((rule) => rule.id),
    addRules: rulesToSessionRules(rules, tabs),
  })
}
