import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { NetworkRuleDraftSchema } from '../lib/network-schemas'
import { jsonBodyWarning } from '../lib/network-rules'
import type { NetworkRuleDraft } from '../lib/network-rules'
import { draftFromDevtoolsRequest, observeDevtoolsRequests, saveDevtoolsOverride } from '../lib/devtools-requests'
import type { CapturedRequest } from '../lib/devtools-requests'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '../components/ui/empty'
import { Field, FieldError, FieldGroup, FieldLabel } from '../components/ui/field'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { cn } from '../lib/utils'

export function DevtoolsApp() {
  const [requests, setRequests] = useState<CapturedRequest[]>([])
  const [selected, setSelected] = useState<CapturedRequest | null>(null)
  const [search, setSearch] = useState('')
  const capture = useRef<ReturnType<typeof observeDevtoolsRequests> | null>(null)
  useEffect(() => {
    const observer = observeDevtoolsRequests(chrome.devtools.network, setRequests, () => setSelected(null))
    capture.current = observer
    const refresh = () => observer.refresh()
    window.addEventListener('overidify-devtools-shown', refresh)
    return () => { window.removeEventListener('overidify-devtools-shown', refresh); observer.dispose(); capture.current = null }
  }, [])
  const query = search.trim().toLowerCase()
  const visible = requests.filter(({ request }) => `${request.request.method} ${request.request.url}`.toLowerCase().includes(query))

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-5 p-5 mobile:p-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-xl font-semibold">Override a response</h1><p className="text-xs text-muted-foreground">Pick a request, edit the response, and save.</p></div>
        <Button variant="secondary" onClick={() => { void chrome.runtime.openOptionsPage() }}>Manage rules</Button>
      </header>
      <div className="grid min-w-0 grid-cols-[minmax(240px,0.85fr)_minmax(0,1.4fr)] items-start gap-5 mobile:grid-cols-1">
        <section className="flex min-w-0 flex-col gap-3" aria-label="Captured requests">
          <div className="flex items-center gap-3">
            <Input aria-label="Filter requests" placeholder="Filter by URL or method" value={search} onChange={event => setSearch(event.target.value)} />
            <Button variant="ghost" onClick={() => capture.current?.refresh()}>Refresh</Button>
            <Button variant="ghost" onClick={() => capture.current?.clear()}>Clear</Button>
          </div>
          <p className="text-xs text-muted-foreground">Latest {requests.length} fetch and XHR requests</p>
          {visible.length ? (
            <ul className="grid max-h-[70vh] list-none gap-1 overflow-auto p-0 mobile:max-h-52">
              {visible.map(item => (
                <li key={item.id}>
                  <button type="button" aria-pressed={selected?.id === item.id} onClick={() => setSelected(item)}
                    className={cn('flex w-full flex-col items-start gap-1 rounded-md border border-transparent p-3 text-left hover:bg-accent', selected?.id === item.id && 'border-input bg-selection')}>
                    <span className="flex items-center gap-2"><Badge variant="secondary">{item.request.request.method}</Badge><span className="text-xs text-muted-foreground">{item.request.response.status || 'Failed'}</span></span>
                    <span className="w-full truncate text-xs" title={item.request.request.url}>{item.request.request.url}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty><EmptyHeader><EmptyTitle>{query ? 'No matching requests' : 'Waiting for API requests'}</EmptyTitle>
              <EmptyDescription>{query ? 'Try another URL or method.' : <>
                Use your app or reload the website to capture Fetch/XHR requests. Click Refresh to load requests already visible in Network.
                <p className="mt-3">If Network shows Fetch/XHR calls but this list stays empty, disable other copies of Overidify, reopen DevTools, and reload the website.</p>
              </>}</EmptyDescription>
            </EmptyHeader></Empty>
          )}
        </section>
        {selected ? <CapturedResponseEditor key={selected.id} capture={selected} /> : (
          <Empty className="min-h-64 border"><EmptyHeader><EmptyTitle>Select a request</EmptyTitle>
            <EmptyDescription>Its response will appear here. The URL, method, headers, and website scope are filled in for you.</EmptyDescription>
          </EmptyHeader></Empty>
        )}
      </div>
    </main>
  )
}

function CapturedResponseEditor({ capture }: { capture: CapturedRequest }) {
  const [draft, setDraft] = useState<NetworkRuleDraft | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void chrome.tabs.get(chrome.devtools.inspectedWindow.tabId)
      .then(tab => draftFromDevtoolsRequest(capture.request, tab.url ?? ''))
      .then(draft => { if (active) setDraft(draft) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not read this response.') })
    return () => { active = false }
  }, [capture])
  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
  if (!draft) return <p className="p-5 text-xs text-muted-foreground" role="status">Reading response...</p>
  return <ResponseForm draft={draft} />
}

function ResponseForm({ draft }: { draft: NetworkRuleDraft }) {
  const [id] = useState(() => crypto.randomUUID())
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [needsReload, setNeedsReload] = useState(false)
  const form = useForm<NetworkRuleDraft>({ defaultValues: draft, resolver: zodResolver(NetworkRuleDraftSchema, undefined, { mode: 'sync' }) })
  const busy = form.formState.isSubmitting
  const [body, status] = useWatch({ control: form.control, name: ['body', 'status'] })
  const warning = body ? jsonBodyWarning({ body, headers: draft.headers }) : null
  const noBody = draft.method === 'HEAD' || [204, 205, 304].includes(status)
  const submit = form.handleSubmit(async values => {
    setError('')
    try {
      const result = await saveDevtoolsOverride(id, values)
      form.reset(values)
      setSaved(true)
      setNeedsReload(result.reloadTabIds.includes(chrome.devtools.inspectedWindow.tabId))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this override. Try again.') }
  })

  return (
    <form className="flex min-w-0 flex-col gap-4" onSubmit={event => { void submit(event) }}
      onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy && !event.repeat) event.currentTarget.requestSubmit() } }}>
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="break-all text-sm font-semibold">{draft.method} {draft.requestUrl}</h2>
        <p className="text-xs text-muted-foreground">Website: {draft.url}. Matches this exact URL and method.</p>
        <p className="text-xs text-muted-foreground">Bypasses the server. Response headers are copied, except cookies and transport headers.</p>
      </div>
      <fieldset disabled={busy} className="min-w-0">
        <FieldGroup>
          <Field data-invalid={!!form.formState.errors.status}>
            <FieldLabel htmlFor="response-status">Status code</FieldLabel>
            <Input id="response-status" className="max-w-28" type="number" min={200} max={599} step={1} required aria-invalid={!!form.formState.errors.status} {...form.register('status', { valueAsNumber: true })} />
            <FieldError errors={[form.formState.errors.status]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="response-body">Response body</FieldLabel>
            <Textarea id="response-body" rows={18} spellCheck={false} {...form.register('body')} />
          </Field>
        </FieldGroup>
      </fieldset>
      {warning && <p className="text-xs text-muted-foreground" role="status">{warning}</p>}
      {noBody && <p className="text-xs text-muted-foreground">This method or status returns no body. Your text is still saved.</p>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {saved && !form.formState.isDirty && <p className="text-xs text-muted-foreground" role="status">{needsReload ? 'Override saved. Reload this page to activate it.' : 'Override saved. Trigger the request again to use it.'}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>{busy ? 'Saving...' : saved ? 'Update override' : 'Save override'}</Button>
        {saved && needsReload && <Button type="button" variant="secondary" onClick={() => chrome.devtools.inspectedWindow.reload()}>Reload page</Button>}
        {saved && <Button type="button" variant="ghost" onClick={() => { void chrome.tabs.create({ url: chrome.runtime.getURL(`options.html#/network-rules/${id}`) }) }}>Edit all settings</Button>}
      </div>
      <p className="text-xs text-muted-foreground">Ctrl+Enter or ⌘+Enter to save. Saved overrides also appear under Network Rules. Chrome's Network tab may still show the original response.</p>
    </form>
  )
}
