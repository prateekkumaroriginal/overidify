import { startTransition, useEffect, useEffectEvent, useState } from 'react'

import { ToggleSwitch } from '../components/ToggleSwitch'
import { isValidUrlPattern } from '../lib/dnr'
import {
  createHeaderPair,
  createRuleDraft,
  createRuleId,
  getRules,
  normalizeRules,
  ruleToDraft,
  saveRules,
  STORAGE_KEY,
} from '../lib/storage'
import type { HeaderPair, HeaderRule, RuleDraft } from '../lib/types'

type SaveState = {
  tone: 'idle' | 'success' | 'error'
  message: string
}

const initialSaveState: SaveState = { tone: 'idle', message: '' }

export function OptionsApp() {
  const [rules, setRules] = useState<HeaderRule[]>([])
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null)
  const [draft, setDraft] = useState<RuleDraft>(createRuleDraft())
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>(initialSaveState)

  const hydrateEditor = useEffectEvent((nextRules: HeaderRule[]) => {
    setRules(nextRules)

    if (selectedRuleId) {
      const selectedRule = nextRules.find((rule) => rule.id === selectedRuleId)

      if (selectedRule) {
        setDraft(ruleToDraft(selectedRule))
        return
      }
    }

    if (nextRules.length > 0) {
      setSelectedRuleId(nextRules[0].id)
      setDraft(ruleToDraft(nextRules[0]))
      return
    }

    setSelectedRuleId(null)
    setDraft(createRuleDraft())
  })

  useEffect(() => {
    let alive = true

    async function load() {
      const nextRules = await getRules()

      if (!alive) {
        return
      }

      startTransition(() => {
        hydrateEditor(nextRules)
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

      const nextRules = normalizeRules(changes[STORAGE_KEY]?.newValue)

      startTransition(() => {
        hydrateEditor(nextRules)
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

  function beginNewRule() {
    setSelectedRuleId(null)
    setDraft(createRuleDraft())
    setSaveState(initialSaveState)
  }

  function selectRule(rule: HeaderRule) {
    setSelectedRuleId(rule.id)
    setDraft(ruleToDraft(rule))
    setSaveState(initialSaveState)
  }

  function updateHeader(index: number, field: keyof HeaderPair, value: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      headers: currentDraft.headers.map((header, currentIndex) =>
        currentIndex === index ? { ...header, [field]: value } : header,
      ),
    }))
  }

  function addHeader() {
    setDraft((currentDraft) => ({
      ...currentDraft,
      headers: [...currentDraft.headers, createHeaderPair()],
    }))
  }

  function removeHeader(index: number) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      headers:
        currentDraft.headers.length === 1
          ? [createHeaderPair()]
          : currentDraft.headers.filter((_, currentIndex) => currentIndex !== index),
    }))
  }

  async function persistRules(nextRules: HeaderRule[], nextSelectedRuleId: string | null) {
    const savedRules = await saveRules(nextRules)
    setRules(savedRules)

    if (nextSelectedRuleId) {
      const selectedRule = savedRules.find((rule) => rule.id === nextSelectedRuleId)

      if (selectedRule) {
        setSelectedRuleId(selectedRule.id)
        setDraft(ruleToDraft(selectedRule))
        return
      }
    }

    if (savedRules.length > 0) {
      setSelectedRuleId(savedRules[0].id)
      setDraft(ruleToDraft(savedRules[0]))
      return
    }

    setSelectedRuleId(null)
    setDraft(createRuleDraft())
  }

  async function handleSaveRule() {
    const validationError = validateDraft(draft)

    if (validationError) {
      setSaveState({ tone: 'error', message: validationError })
      return
    }

    const sanitizedHeaders = sanitizeHeaders(draft.headers)

    const nextRule: HeaderRule = {
      id: selectedRuleId ?? createRuleId(),
      name: draft.name.trim(),
      url: draft.url.trim(),
      enabled: draft.enabled,
      headers: sanitizedHeaders,
      order: selectedRuleId
        ? rules.find((rule) => rule.id === selectedRuleId)?.order ?? rules.length
        : rules.length,
    }

    const nextRules = selectedRuleId
      ? rules.map((rule) => (rule.id === selectedRuleId ? nextRule : rule))
      : [...rules, nextRule]

    await persistRules(nextRules, nextRule.id)
    setSaveState({
      tone: 'success',
      message: selectedRuleId ? 'Rule updated.' : 'Rule created.',
    })
  }

  async function handleDeleteRule(ruleId: string) {
    const targetRule = rules.find((rule) => rule.id === ruleId)

    if (!targetRule || !window.confirm(`Delete "${targetRule.name}"?`)) {
      return
    }

    const nextRules = rules.filter((rule) => rule.id !== ruleId)
    const fallbackRuleId = nextRules[0]?.id ?? null
    await persistRules(nextRules, fallbackRuleId)
    setSaveState({ tone: 'success', message: 'Rule deleted.' })
  }

  async function handleMove(ruleId: string, direction: -1 | 1) {
    const currentIndex = rules.findIndex((rule) => rule.id === ruleId)
    const nextIndex = currentIndex + direction

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= rules.length) {
      return
    }

    const nextRules = [...rules]
    const [movedRule] = nextRules.splice(currentIndex, 1)
    nextRules.splice(nextIndex, 0, movedRule)

    await persistRules(
      nextRules.map((rule, index) => ({ ...rule, order: index })),
      selectedRuleId ?? ruleId,
    )
    setSaveState({ tone: 'success', message: 'Rule priority updated.' })
  }

  async function handleToggleRule(ruleId: string, nextEnabled: boolean) {
    const nextRules = rules.map((rule) =>
      rule.id === ruleId ? { ...rule, enabled: nextEnabled } : rule,
    )

    await persistRules(nextRules, selectedRuleId ?? ruleId)

    if (selectedRuleId === ruleId) {
      setDraft((currentDraft) => ({ ...currentDraft, enabled: nextEnabled }))
    }
  }

  return (
    <main className="min-h-screen px-4 py-5 text-slate-100 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="eyebrow">Request Header Override</div>
            <h1 className="mt-2 font-display text-4xl tracking-tight text-white md:text-5xl">
              Overidify Rules
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              Define browser-wide request header overrides. Later rules in the
              list have higher priority and win when they set the same header.
            </p>
          </div>

          <div className="surface rounded-3xl px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Live sync
            </div>
            <div className="mt-2 text-sm text-slate-200">
              Changes save to local extension storage and refresh dynamic rules automatically.
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="surface panel-grid rounded-[32px] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Rule stack
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">{rules.length}</div>
              </div>

              <button
                type="button"
                onClick={beginNewRule}
                className="rounded-full border border-sky-300/25 bg-sky-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-100 transition hover:border-sky-200/40 hover:bg-sky-300/16"
              >
                New rule
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="surface-strong rounded-3xl p-4 text-sm text-slate-400">
                  Loading rules...
                </div>
              ) : rules.length === 0 ? (
                <div className="surface-strong rounded-3xl p-4">
                  <p className="text-base font-semibold text-white">Empty workspace.</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Start by creating a rule with a URL pattern and one or more header pairs.
                  </p>
                </div>
              ) : (
                rules.map((rule, index) => {
                  const isSelected = selectedRuleId === rule.id

                  return (
                    <article
                      key={rule.id}
                      className={`surface-strong rounded-3xl p-4 transition ${
                        isSelected ? 'border-sky-200/35 shadow-[0_20px_50px_rgba(14,165,233,0.12)]' : 'hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => selectRule(rule)}
                          className="min-w-0 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-white/6 px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
                              {index + 1}
                            </span>
                            <span className="truncate text-base font-semibold text-white">
                              {rule.name}
                            </span>
                          </div>
                          <div className="mt-2 truncate font-mono text-xs text-sky-100/75">
                            {rule.url}
                          </div>
                        </button>

                        <ToggleSwitch
                          checked={rule.enabled}
                          label={`Toggle ${rule.name}`}
                          onChange={(nextValue) => {
                            void handleToggleRule(rule.id, nextValue)
                          }}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 text-[0.7rem] text-slate-400">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                          {rule.headers.length} header{rule.headers.length === 1 ? '' : 's'}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                          {rule.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void handleMove(rule.id, -1)
                          }}
                          disabled={index === 0}
                          className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleMove(rule.id, 1)
                          }}
                          disabled={index === rules.length - 1}
                          className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:border-white/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Move down
                        </button>
                      </div>
                    </article>
                  )
                })
              )}
            </div>
          </aside>

          <section className="surface rounded-[32px] p-5 md:p-6">
            <div className="flex flex-col gap-4 border-b border-white/8 pb-5 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                  {selectedRuleId ? 'Edit rule' : 'Create rule'}
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {selectedRuleId ? draft.name || 'Untitled rule' : 'New header rule'}
                </h2>
              </div>

              <div
                className={`rounded-2xl border px-3 py-2 text-sm ${
                  saveState.tone === 'success'
                    ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100'
                    : saveState.tone === 'error'
                      ? 'border-rose-300/25 bg-rose-300/10 text-rose-100'
                      : 'border-white/8 bg-white/4 text-slate-400'
                }`}
              >
                {saveState.message || 'Use Save rule to commit changes.'}
              </div>
            </div>

            <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
              <div className="space-y-5">
                <label className="block">
                  <div className="mb-2 text-sm font-semibold text-slate-300">Rule name</div>
                  <input
                    value={draft.name}
                    onChange={(event) => {
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        name: event.target.value,
                      }))
                    }}
                    placeholder="Authenticated API"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base outline-none transition focus:border-sky-300/40 focus:bg-white/7"
                  />
                </label>

                <label className="block">
                  <div className="mb-2 text-sm font-semibold text-slate-300">URL pattern</div>
                  <input
                    value={draft.url}
                    onChange={(event) => {
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        url: event.target.value,
                      }))
                    }}
                    placeholder="*://api.example.com/*"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm outline-none transition focus:border-sky-300/40 focus:bg-white/7"
                  />
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Use <span className="font-mono text-slate-200">*</span> for all requests
                    or a simple wildcard pattern like{' '}
                    <span className="font-mono text-slate-200">*://api.example.com/*</span>.
                  </p>
                </label>

                <div className="rounded-[28px] border border-white/8 bg-white/4 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-white">Header overrides</div>
                      <div className="mt-1 text-sm text-slate-400">
                        Each row uses set semantics, so existing values are replaced and missing
                        headers are added.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={addHeader}
                      className="rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-100 transition hover:border-sky-200/40 hover:bg-sky-300/16"
                    >
                      Add header
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {draft.headers.map((header, index) => (
                      <div
                        key={`header-row-${index}`}
                        className="grid gap-3 rounded-3xl border border-white/8 bg-slate-950/45 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                      >
                        <input
                          value={header.key}
                          onChange={(event) => {
                            updateHeader(index, 'key', event.target.value)
                          }}
                          placeholder="Authorization"
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition focus:border-sky-300/40 focus:bg-white/7"
                        />
                        <input
                          value={header.value}
                          onChange={(event) => {
                            updateHeader(index, 'value', event.target.value)
                          }}
                          placeholder="Bearer abc123"
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none transition focus:border-sky-300/40 focus:bg-white/7"
                        />
                        <button
                          type="button"
                          onClick={() => removeHeader(index)}
                          className="rounded-2xl border border-rose-300/18 bg-rose-300/8 px-4 py-3 text-sm font-semibold text-rose-100 transition hover:border-rose-300/28 hover:bg-rose-300/12"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <aside className="space-y-4">
                <div className="rounded-[28px] border border-white/8 bg-white/4 p-4">
                  <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Rule state
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-white">
                        {draft.enabled ? 'Enabled' : 'Disabled'}
                      </div>
                      <div className="mt-1 text-sm text-slate-400">
                        Disabled rules stay in storage but do not generate dynamic request rules.
                      </div>
                    </div>
                    <ToggleSwitch
                      checked={draft.enabled}
                      label="Toggle draft enabled state"
                      onChange={(nextValue) => {
                        setDraft((currentDraft) => ({
                          ...currentDraft,
                          enabled: nextValue,
                        }))
                      }}
                    />
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/8 bg-white/4 p-4">
                  <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Current draft
                  </div>
                  <dl className="mt-4 space-y-3 text-sm text-slate-300">
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-slate-500">Headers</dt>
                      <dd>{sanitizeHeaders(draft.headers).length}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-slate-500">Pattern</dt>
                      <dd className="max-w-[11rem] truncate font-mono text-xs">
                        {draft.url || '-'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-slate-500">Priority</dt>
                      <dd>
                        {selectedRuleId
                          ? (rules.find((rule) => rule.id === selectedRuleId)?.order ?? 0) + 1
                          : rules.length + 1}
                      </dd>
                    </div>
                  </dl>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    void handleSaveRule()
                  }}
                  className="w-full rounded-2xl border border-sky-300/25 bg-sky-300/12 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-sky-100 transition hover:border-sky-200/40 hover:bg-sky-300/18"
                >
                  {selectedRuleId ? 'Save rule' : 'Create rule'}
                </button>

                {selectedRuleId ? (
                  <button
                    type="button"
                    onClick={() => {
                      void handleDeleteRule(selectedRuleId)
                    }}
                    className="w-full rounded-2xl border border-rose-300/20 bg-rose-300/8 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-rose-100 transition hover:border-rose-300/32 hover:bg-rose-300/12"
                  >
                    Delete rule
                  </button>
                ) : null}
              </aside>
            </div>
          </section>
        </section>
      </div>
    </main>
  )
}

function sanitizeHeaders(headers: HeaderPair[]): HeaderPair[] {
  return headers
    .map((header) => ({
      key: header.key.trim(),
      value: header.value.trim(),
    }))
    .filter((header) => header.key || header.value)
}

function validateDraft(draft: RuleDraft): string | null {
  if (!draft.name.trim()) {
    return 'Rule name is required.'
  }

  if (!draft.url.trim()) {
    return 'URL pattern is required.'
  }

  if (!isValidUrlPattern(draft.url.trim())) {
    return 'Use * or a simple wildcard URL pattern like *://api.example.com/*.'
  }

  const sanitizedHeaders = sanitizeHeaders(draft.headers)

  if (sanitizedHeaders.length === 0) {
    return 'Add at least one header pair.'
  }

  if (sanitizedHeaders.some((header) => !header.key || !header.value)) {
    return 'Each header row needs both a key and a value.'
  }

  return null
}

