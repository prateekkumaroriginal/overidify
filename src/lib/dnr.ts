import { domainPatternToRegexFilter, patternToRegexFilter } from './pattern.ts'
import { getEntryHeaders } from './rules.ts'
export { isValidUrlPattern, patternToRegexFilter } from './pattern'
import type { HeaderEntry } from './types'

const DYNAMIC_RULE_OFFSET = 1000

const RESOURCE_TYPES: chrome.declarativeNetRequest.ResourceType[] = [
  chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
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

export function rulesToDynamicRules(
  rules: HeaderEntry[],
): chrome.declarativeNetRequest.Rule[] {
  return [...rules]
    .sort((left, right) => left.order - right.order)
    .filter((rule) => rule.enabled && getEntryHeaders(rule).length > 0)
    .map((rule, index) => ({
      id: DYNAMIC_RULE_OFFSET + index,
      priority: DYNAMIC_RULE_OFFSET + index,
      action: {
        type: 'modifyHeaders',
        requestHeaders: getEntryHeaders(rule).map((header) => ({
          header: header.key,
          operation: 'set',
          value: header.value,
        })),
      },
      condition: {
        regexFilter: rule.kind === 'switcher'
          ? domainPatternToRegexFilter(rule.url)
          : patternToRegexFilter(rule.url),
        resourceTypes: RESOURCE_TYPES,
      },
    }))
}

export async function syncDynamicRules(rules: HeaderEntry[]): Promise<void> {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules()
  const nextRules = rulesToDynamicRules(rules)

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingRules.map((rule) => rule.id),
    addRules: nextRules,
  })
}
