import type { HeaderRule } from './types'

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

function escapeRegexSegment(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function patternToRegexFilter(pattern: string): string {
  const trimmed = pattern.trim()

  if (!trimmed || trimmed === '*') {
    return '^.*$'
  }

  return `^${Array.from(trimmed)
    .map((character) => (character === '*' ? '.*' : escapeRegexSegment(character)))
    .join('')}$`
}

export function isValidUrlPattern(pattern: string): boolean {
  const trimmed = pattern.trim()

  if (!trimmed) {
    return false
  }

  try {
    new RegExp(patternToRegexFilter(trimmed))
    return true
  } catch {
    return false
  }
}

export function rulesToDynamicRules(
  rules: HeaderRule[],
): chrome.declarativeNetRequest.Rule[] {
  return [...rules]
    .sort((left, right) => left.order - right.order)
    .filter((rule) => rule.enabled && rule.headers.length > 0)
    .map((rule, index) => ({
      id: DYNAMIC_RULE_OFFSET + index,
      priority: DYNAMIC_RULE_OFFSET + index,
      action: {
        type: 'modifyHeaders',
        requestHeaders: rule.headers.map((header) => ({
          header: header.key,
          operation: 'set',
          value: header.value,
        })),
      },
      condition: {
        regexFilter: patternToRegexFilter(rule.url),
        resourceTypes: RESOURCE_TYPES,
      },
    }))
}

export async function syncDynamicRules(rules: HeaderRule[]): Promise<void> {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules()
  const nextRules = rulesToDynamicRules(rules)

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingRules.map((rule) => rule.id),
    addRules: nextRules,
  })
}
