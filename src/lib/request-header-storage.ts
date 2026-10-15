import type { RequestHeaderRule } from './types'
import { normalizeRequestHeaderRules } from './request-header-rules'
import { ActivationResultSchema } from './settings-messages'

export const REQUEST_HEADER_STORAGE_KEY = 'requestHeaderRules'

export async function getRequestHeaderRules(): Promise<RequestHeaderRule[]> {
  if (isBrowserPreview()) {
    return normalizeRequestHeaderRules(JSON.parse(localStorage.getItem(REQUEST_HEADER_STORAGE_KEY) ?? '[]'))
  }
  const stored = await chrome.storage.local.get(REQUEST_HEADER_STORAGE_KEY)
  return normalizeRequestHeaderRules(stored[REQUEST_HEADER_STORAGE_KEY])
}

export async function saveRequestHeaderRules(rules: RequestHeaderRule[]): Promise<RequestHeaderRule[]> {
  const normalized = normalizeRequestHeaderRules(rules)
  if (isBrowserPreview()) {
    localStorage.setItem(REQUEST_HEADER_STORAGE_KEY, JSON.stringify(normalized))
    window.dispatchEvent(new Event('request-header-rules-updated'))
  } else {
    await chrome.storage.local.set({ [REQUEST_HEADER_STORAGE_KEY]: normalized })
    const result = ActivationResultSchema.safeParse(await chrome.runtime.sendMessage({ type: 'sync-request-header-rules' }))
    if (!result.success || !result.data.ok) {
      throw new Error((result.success && !result.data.ok ? result.data.error : undefined) ?? 'The extension did not confirm that the headers were applied. Reload the extension and try again.')
    }
  }
  return normalized
}

// Local development can preview the UI without installing the extension.
function isBrowserPreview() {
  return import.meta.env.DEV && !globalThis.chrome?.storage?.local
}

export function subscribeToRequestHeaderRules(
  onChange: (rules: RequestHeaderRule[]) => void,
): () => void {
  if (isBrowserPreview()) {
    const handleChange = () => {
      void getRequestHeaderRules()
        .then(onChange)
        .catch(() => undefined)
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === REQUEST_HEADER_STORAGE_KEY || event.key === null) handleChange()
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener('request-header-rules-updated', handleChange)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('request-header-rules-updated', handleChange)
    }
  }
  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName === 'local' && REQUEST_HEADER_STORAGE_KEY in changes) {
      onChange(normalizeRequestHeaderRules(changes[REQUEST_HEADER_STORAGE_KEY]?.newValue))
    }
  }
  chrome.storage.onChanged.addListener(handleChange)
  return () => chrome.storage.onChanged.removeListener(handleChange)
}
