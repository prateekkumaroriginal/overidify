import type { HeaderEntry } from './types'
import { normalizeEntries } from './rules'

export const STORAGE_KEY = 'headerRules'

export async function getEntries(): Promise<HeaderEntry[]> {
  if (isBrowserPreview()) {
    return normalizeEntries(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'))
  }
  const stored = await chrome.storage.local.get(STORAGE_KEY)
  return normalizeEntries(stored[STORAGE_KEY])
}

export async function saveEntries(rules: HeaderEntry[]): Promise<HeaderEntry[]> {
  const normalized = normalizeEntries(rules)
  if (isBrowserPreview()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    window.dispatchEvent(new Event('rules-updated'))
  } else {
    await chrome.storage.local.set({ [STORAGE_KEY]: normalized })
  }
  return normalized
}

// Local development can preview the UI without installing the extension.
function isBrowserPreview() {
  return import.meta.env.DEV && !globalThis.chrome?.storage?.local
}

export function subscribeToEntries(
  onChange: (rules: HeaderEntry[]) => void,
): () => void {
  if (isBrowserPreview()) {
    const handleChange = () => {
      void getEntries()
        .then(onChange)
        .catch(() => undefined)
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) handleChange()
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener('rules-updated', handleChange)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('rules-updated', handleChange)
    }
  }
  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName === 'local' && STORAGE_KEY in changes) {
      onChange(normalizeEntries(changes[STORAGE_KEY]?.newValue))
    }
  }
  chrome.storage.onChanged.addListener(handleChange)
  return () => chrome.storage.onChanged.removeListener(handleChange)
}
