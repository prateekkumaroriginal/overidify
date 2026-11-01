import { draftFromDevtoolsRequest, saveDevtoolsOverride } from './devtools-requests.ts'
import type { DevtoolsRequest } from './devtools-requests'
import { NetworkRuleDraftSchema } from './network-schemas.ts'
import type { NetworkRuleDraft } from './network-rules'
import { RuleIdSchema } from './schema-fields.ts'

const prefix = 'captured-network-rule:'

function draftKey(id: string) {
  return prefix + RuleIdSchema.parse(id)
}

// Response bodies stay in extension session storage, never in a URL or saved rules.
export async function openCapturedNetworkRule(request: DevtoolsRequest, pageUrl: string): Promise<string> {
  const draft = await draftFromDevtoolsRequest(request, pageUrl)
  const id = crypto.randomUUID()
  const key = draftKey(id)
  await chrome.storage.session.set({ [key]: draft })
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL(`options.html#/network-rules/new?draft=${id}`) })
  } catch (error) {
    await chrome.storage.session.remove(key).catch(() => undefined)
    throw error
  }
  return id
}

// Reads are repeatable so StrictMode and reloading the options tab keep the draft.
export async function getCapturedNetworkRuleDraft(id: string): Promise<NetworkRuleDraft> {
  const key = draftKey(id)
  const stored = await chrome.storage.session.get(key)
  const parsed = NetworkRuleDraftSchema.safeParse(stored[key])
  if (!parsed.success) throw new Error('This captured response is no longer available. Return to DevTools and create the rule again.')
  return parsed.data
}

export async function saveCapturedNetworkRuleDraft(id: string, draft: NetworkRuleDraft) {
  const key = draftKey(id)
  // The draft token is also the rule ID, so an activation retry updates one rule.
  const result = await saveDevtoolsOverride(id, draft)
  // A cleanup failure must not turn a successful Save into an apparent failure.
  await chrome.storage.session.remove(key).catch(() => undefined)
  return result
}
