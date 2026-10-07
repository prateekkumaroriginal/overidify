import { startTransition, useEffect, useState } from 'react'

import { RulesList } from '../components/RulesList'
import { getRules, normalizeRules, saveRules, STORAGE_KEY } from '../lib/storage'
import type { HeaderRule } from '../lib/types'

export function PopupApp() {
  const [rules, setRules] = useState<HeaderRule[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const nextRules = await getRules()
        if (alive) {
          startTransition(() => {
            setRules(nextRules)
            setLoading(false)
          })
        }
      } catch {
        if (alive) {
          setError('Could not load rules. Reopen the popup to try again.')
          setLoading(false)
        }
      }
    }
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === 'local' && STORAGE_KEY in changes) {
        startTransition(() => setRules(normalizeRules(changes[STORAGE_KEY]?.newValue)))
      }
    }
    void load()
    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => {
      alive = false
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  async function handleToggle(rule: HeaderRule, enabled: boolean) {
    setPending(true)
    setError('')
    try {
      setRules(await saveRules(rules.map((current) => current.id === rule.id ? { ...current, enabled } : current)))
    } catch {
      setError('Could not change rule state. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="popup">
      <header className="page-header">
        <h1>Overidify</h1>
        <a className="button" href="options.html#/new" target="_blank" rel="noreferrer">New rule</a>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? <p className="muted" role="status">Loading rules...</p> : rules.length === 0 ? (
        <p className="muted">No rules yet. Create a rule to get started.</p>
      ) : <RulesList rules={rules} disabled={pending} openInTab
        ruleHref={(rule) => `options.html#/rules/${encodeURIComponent(rule.id)}`}
        onToggle={(rule, enabled) => { void handleToggle(rule, enabled) }} />}
      <footer><a href="options.html#/" target="_blank" rel="noreferrer">All rules</a></footer>
    </main>
  )
}
