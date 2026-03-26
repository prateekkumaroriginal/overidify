import { startTransition, useEffect, useState } from 'react'

import { ToggleSwitch } from '../components/ToggleSwitch'
import { getRules, normalizeRules, saveRules, STORAGE_KEY } from '../lib/storage'
import type { HeaderRule } from '../lib/types'

export function PopupApp() {
  const [rules, setRules] = useState<HeaderRule[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingRuleId, setPendingRuleId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true

    async function load() {
      const nextRules = await getRules()

      if (!alive) {
        return
      }

      startTransition(() => {
        setRules(nextRules)
        setLoading(false)
      })
    }

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local' || !(STORAGE_KEY in changes)) {
        return
      }

      startTransition(() => {
        setRules(normalizeRules(changes[STORAGE_KEY]?.newValue))
        setLoading(false)
      })
    }

    void load()
    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => {
      alive = false
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  async function handleToggle(rule: HeaderRule, nextEnabled: boolean) {
    const nextRules = rules.map((currentRule) =>
      currentRule.id === rule.id ? { ...currentRule, enabled: nextEnabled } : currentRule,
    )

    setPendingRuleId(rule.id)
    setRules(nextRules)

    try {
      await saveRules(nextRules)
    } finally {
      setPendingRuleId(null)
    }
  }

  function handleOpenOptions() {
    void chrome.runtime.openOptionsPage()
  }

  const enabledCount = rules.filter((rule) => rule.enabled).length

  return (
    <main className="min-h-[560px] w-[380px] px-4 py-4 text-slate-100">
      <div className="surface panel-grid relative overflow-hidden rounded-[28px] p-4">
        <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-sky-200/30 to-transparent" />

        <header className="relative flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow">Header Relay</div>
            <h1 className="mt-2 font-display text-[1.7rem] leading-none tracking-tight text-white">
              Overidify
            </h1>
            <p className="mt-3 max-w-[18rem] text-sm leading-6 text-slate-300">
              Browser-wide request header overrides with ordered rules and a clean
              dark control surface.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenOptions}
            className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-100 transition hover:border-sky-200/40 hover:bg-sky-300/16"
          >
            Edit rules
          </button>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-3">
          <StatCard label="Enabled" value={enabledCount.toString()} tone="accent" />
          <StatCard label="Total rules" value={rules.length.toString()} tone="neutral" />
        </section>

        <section className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
              Rules
            </h2>
            <span className="text-xs text-slate-500">Later rules override earlier ones.</span>
          </div>

          {loading ? (
            <div className="surface-strong rounded-3xl p-5 text-sm text-slate-400">
              Loading saved rules...
            </div>
          ) : rules.length === 0 ? (
            <div className="surface-strong rounded-3xl p-5">
              <p className="text-base font-semibold text-white">No rules yet.</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Create your first rule in the options page, then toggle it here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <article
                  key={rule.id}
                  className="surface-strong rounded-3xl p-4 transition hover:border-white/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-white">
                          {rule.name}
                        </h3>
                        <span
                          className={`rounded-full px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] ${
                            rule.enabled
                              ? 'bg-emerald-400/12 text-emerald-200'
                              : 'bg-white/6 text-slate-400'
                          }`}
                        >
                          {rule.enabled ? 'On' : 'Off'}
                        </span>
                      </div>
                      <p className="mt-2 truncate font-mono text-xs text-sky-100/80">
                        {rule.url}
                      </p>
                    </div>

                    <ToggleSwitch
                      checked={rule.enabled}
                      label={`Toggle ${rule.name}`}
                      disabled={pendingRuleId === rule.id}
                      onChange={(nextValue) => {
                        void handleToggle(rule, nextValue)
                      }}
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {rule.headers.length} header override
                      {rule.headers.length === 1 ? '' : 's'}
                    </span>
                    <span>Priority {rule.order + 1}</span>
                  </div>

                  {rule.headers.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {rule.headers.slice(0, 3).map((header) => (
                        <span
                          key={`${rule.id}-${header.key}`}
                          className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[0.72rem] text-slate-300"
                        >
                          {header.key}: {header.value}
                        </span>
                      ))}
                      {rule.headers.length > 3 ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[0.72rem] text-slate-400">
                          +{rule.headers.length - 3} more
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

type StatCardProps = {
  label: string
  value: string
  tone: 'accent' | 'neutral'
}

function StatCard({ label, value, tone }: StatCardProps) {
  return (
    <div
      className={`surface-strong rounded-3xl p-4 ${
        tone === 'accent' ? 'border-sky-200/20' : ''
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</div>
    </div>
  )
}
