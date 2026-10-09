import { startTransition, useEffect, useState } from 'react'

import { SwitcherOptionSelect } from '../components/SwitcherOptionSelect'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { patternToRegexFilter } from '../lib/pattern'
import { getEntries, saveEntries, subscribeToEntries } from '../lib/storage'
import type { HeaderEntry } from '../lib/types'

async function getCurrentPageUrl(): Promise<string> {
  if (import.meta.env.DEV && !globalThis.chrome?.tabs?.query) {
    return window.location.href
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.url ?? ''
}

export function PopupApp() {
  const [rules, setRules] = useState<HeaderEntry[]>([])
  const [pageUrl, setPageUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [nextRules, currentPageUrl] = await Promise.all([
          getEntries(),
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
          setError('Could not load your settings. Reopen the popup to try again.')
          setLoading(false)
        }
      }
    }
    void load()
    const unsubscribe = subscribeToEntries((nextRules) => {
      if (alive) startTransition(() => setRules(nextRules))
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  async function handleUpdate(rule: HeaderEntry, patch: { enabled?: boolean; selectedOptionId?: string }) {
    setPending(true)
    setError('')
    try {
      setRules(
        await saveEntries(
          rules.map((current) =>
            current.id !== rule.id ? current : current.kind === 'switcher'
              ? { ...current, ...patch }
              : { ...current, enabled: patch.enabled ?? current.enabled },
          ),
        ),
      )
    } catch {
      setError(`Could not update the ${rule.kind}. Try again.`)
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
    <main className="w-full px-[18px] pt-2 pb-3.5">
      {error && (
        <p className="mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs [&_svg]:size-4 border-destructive/40 bg-destructive/10 text-destructive" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="py-4 text-xs text-muted-foreground" role="status">
          Loading...
        </p>
      ) : (
        pageRules.length ? (
          <ul className="m-0 max-h-[400px] list-none overflow-y-auto p-0">
            {pageRules.map((rule) => (
              <li className="flex min-h-12 items-center gap-3 border-b py-3 last:border-b-0" key={rule.id}>
                <ToggleSwitch
                  checked={rule.enabled}
                  label={`Enable ${rule.name}`}
                  disabled={pending}
                  onChange={(enabled) => {
                    void handleUpdate(rule, { enabled })
                  }}
                />
                <span className="min-w-0 flex-1 text-[13px] wrap-anywhere">{rule.name}</span>
                {rule.kind === 'switcher' && <SwitcherOptionSelect
                  switcher={rule}
                  disabled={pending}
                  onChange={(selectedOptionId) => { void handleUpdate(rule, { selectedOptionId }) }}
                />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-xs text-muted-foreground">No matches for this page</p>
        )
      )}
      <footer className="mt-2 flex justify-end border-t pt-3 [&_a]:text-xs [&_a]:text-muted-foreground [&_a]:no-underline [&_a:hover]:text-foreground">
        <a href="options.html#/" target="_blank" rel="noreferrer">
          Settings
        </a>
      </footer>
    </main>
  )
}
