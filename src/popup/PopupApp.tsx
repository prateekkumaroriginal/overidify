import { startTransition, useEffect, useState } from 'react'

import { ToggleSwitch } from '../components/ToggleSwitch'
import { patternToRegexFilter } from '../lib/pattern'
import { getRules, saveRules, subscribeToRules } from '../lib/storage'
import type { HeaderRule } from '../lib/types'

async function getCurrentPageUrl(): Promise<string> {
  if (import.meta.env.DEV && !globalThis.chrome?.tabs?.query) {
    return window.location.href
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.url ?? ''
}

export function PopupApp() {
  const [rules, setRules] = useState<HeaderRule[]>([])
  const [pageUrl, setPageUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [nextRules, currentPageUrl] = await Promise.all([
          getRules(),
          getCurrentPageUrl(),
        ])
        if (alive) {
          startTransition(() => {
            setRules(nextRules)
            setPageUrl(currentPageUrl)
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
    void load()
    const unsubscribe = subscribeToRules((nextRules) => {
      if (alive) startTransition(() => setRules(nextRules))
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  async function handleToggle(rule: HeaderRule, enabled: boolean) {
    setPending(true)
    setError('')
    try {
      setRules(
        await saveRules(
          rules.map((current) =>
            current.id === rule.id ? { ...current, enabled } : current,
          ),
        ),
      )
    } catch {
      setError('Could not change rule state. Try again.')
    } finally {
      setPending(false)
    }
  }

  const pageRules = /^https?:\/\//i.test(pageUrl)
    ? rules.filter((rule) =>
        new RegExp(patternToRegexFilter(rule.url)).test(pageUrl),
      )
    : []

  return (
    <main className="popup">
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="popup-message" role="status">
          Loading rules...
        </p>
      ) : (
        !error &&
        (pageRules.length ? (
          <ul className="popup-rule-list">
            {pageRules.map((rule) => (
              <li className="popup-rule-row" key={rule.id}>
                <span className="popup-rule-name">{rule.name}</span>
                <ToggleSwitch
                  checked={rule.enabled}
                  label={`Enable ${rule.name}`}
                  disabled={pending}
                  onChange={(enabled) => {
                    void handleToggle(rule, enabled)
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="popup-message">No rules for this page</p>
        ))
      )}
      <footer className="popup-footer">
        <a href="options.html#/" target="_blank" rel="noreferrer">
          Settings
        </a>
      </footer>
    </main>
  )
}
