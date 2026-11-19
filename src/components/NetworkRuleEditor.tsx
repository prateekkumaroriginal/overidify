import { lazy, Suspense, useMemo, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import { Controller, useFieldArray, useWatch } from 'react-hook-form'
import { NetworkRuleDraftSchema } from '../lib/network-schemas'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Icon } from './Icon'
import { RuleEditorHeader } from './RuleEditorHeader'
import { ToggleSwitch } from './ToggleSwitch'
import { useEditorForm } from './useEditorForm'
import { downloadRules } from '../lib/rule-download'
import { createNetworkRuleDraft, isJsonResponse, NETWORK_METHODS } from '../lib/network-rules'
import type { NetworkRule, NetworkRuleDraft } from '../lib/network-rules'
import { cn } from '../lib/utils'
import { headerRowLayout } from './headerRowLayout'
import { WebsiteDomains } from './WebsiteDomains'
import { TemplateField } from './TemplateField'
import { displayText, hasTokens } from '../lib/templates'
import type { TemplateText } from '../lib/templates'
import { indexVariables, resolveTemplate } from '../lib/variables'
import { useVariables } from './variables-context'
import { problemAt, TURNED_OFF_SAVED, useDraftCheck } from './rule-problems'
import { RuleProblemsNote } from './RuleProblemsNote'
import { useStoredEnabled } from './useStoredEnabled'
import { toast } from 'sonner'
import type { WebsiteDomainsHandle } from './WebsiteDomains'

type Props = {
  networkRule?: NetworkRule
  initialDraft?: NetworkRuleDraft
  pending: boolean
  /** Resolves to whether the rule was saved enabled. `enabledChanged` is false when the user left the toggle alone. */
  onSave: (draft: NetworkRuleDraft, enabledChanged: boolean) => Promise<boolean | void>
  onDelete?: () => void
}
const ResponseBodyEditor = lazy(() => import('./ResponseBodyEditor'))

const fieldClass = 'grid min-w-0 content-start gap-2 text-[11px] font-semibold'
const panelClass = 'mb-5 rounded-lg border bg-card shadow-panel px-7 py-6 mobile:px-[17px]'

export function NetworkRuleEditor({ networkRule, initialDraft, pending, onSave, onDelete }: Props) {
  const domainsRef = useRef<WebsiteDomainsHandle>(null)
  const { form, formRef, onSubmit, busy, unsaved, setPendingInput, error } = useEditorForm({
    schema: NetworkRuleDraftSchema, initial: () => networkRule
      ? { ...networkRule, headers: networkRule.headers.map(header => ({ ...header })) }
      : initialDraft ?? { ...createNetworkRuleDraft(), url: [] },
    beforeSubmit: () => domainsRef.current?.commit() ?? true,
    pending, returnRoute: '/network-rules',
    onSave: async draft => {
      const enabled = await onSave(draft, enabledChanged(draft))
      if (draft.enabled && enabled === false) toast.warning('Network rule saved turned off', { description: TURNED_OFF_SAVED })
    },
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'headers' })
  const [method, status, headers, body] = useWatch({ control: form.control, name: ['method', 'status', 'headers', 'body'] })
  // JSON checks use the values the page will receive.
  const variables = useVariables()
  const index = useMemo(() => indexVariables(variables ?? []), [variables])
  const filled = (value: TemplateText) => { const result = resolveTemplate(value, index); return result.ok ? result.value : displayText(value) }
  const isJson = isJsonResponse(headers.map(header => ({ key: filled(header.key), value: filled(header.value) })))
  const resolvedBody = useMemo(() => hasTokens(body) ? resolveTemplate(body, index) : null, [body, index])
  const noBody = method === 'HEAD' || [204, 205, 304].includes(status)
  const draft = useWatch({ control: form.control }) as NetworkRuleDraft
  const { problems } = useDraftCheck({ kind: 'network-rule', value: draft })
  const enabledChanged = useStoredEnabled(form, networkRule?.enabled)

  return (
    <section className="mx-auto max-w-[840px] animate-rise-in" aria-labelledby="network-editor-title">
      <RuleEditorHeader kind="network" editing={!!networkRule} ruleName={networkRule?.name} busy={busy} titleId="network-editor-title" onDelete={onDelete} unsaved={unsaved}
        onExport={() => { if (networkRule) downloadRules({ requestHeaderRules: [], networkRules: [networkRule] }, 'network-rule') }} />
      <form ref={formRef} onSubmit={onSubmit}>
        <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
          <div className={panelClass}>
            <h2 className="mb-5 text-[13px] font-bold">Request matching</h2>
            <div className="grid grid-cols-2 gap-5 mobile:grid-cols-1">
              <label className={fieldClass}>Network rule name<Input {...form.register('name')} placeholder="e.g. Featured chats" required autoFocus /></label>
              <Controller control={form.control} name="url" render={({ field, fieldState }) => (
                <WebsiteDomains ref={domainsRef} disabled={busy} value={field.value} onChange={field.onChange} onBlur={field.onBlur} onPendingChange={setPendingInput} inputRef={field.ref} error={fieldState.error?.message} />
              )} />
            </div>
            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-4 mobile:grid-cols-1">
              <label className={fieldClass}>Request URL<Controller control={form.control} name="requestUrl" render={({ field }) => (
                <TemplateField className="font-sans text-[11px]" value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} aria-label="Request URL"
                  placeholder="https://api.example.com/chats?tab=featured" invalid={!!problemAt(problems, ['requestUrl'])} />
              )} /></label>
              <div className={fieldClass}>
                <label htmlFor="network-method">HTTP method</label>
                <Controller control={form.control} name="method" render={({ field, fieldState }) => (
                  <Select name={field.name} value={field.value} onValueChange={field.onChange} disabled={busy}>
                    <SelectTrigger id="network-method" size="lg" className="min-w-24" ref={field.ref} onBlur={field.onBlur} aria-invalid={fieldState.invalid}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectGroup>{NETWORK_METHODS.map(method => <SelectItem key={method} value={method}>{method === 'ANY' ? 'Any' : method}</SelectItem>)}</SelectGroup></SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            <div className={`${fieldClass} mt-5`}>
              <label htmlFor="network-mode">Server behavior</label>
              <Controller control={form.control} name="mode" render={({ field, fieldState }) => (
                <Select name={field.name} value={field.value} onValueChange={field.onChange} disabled={busy}>
                  <SelectTrigger id="network-mode" size="lg" className="w-64 max-w-full" ref={field.ref} onBlur={field.onBlur} aria-invalid={fieldState.invalid}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup><SelectItem value="bypass">Bypass server</SelectItem><SelectItem value="call-server">Call server, then replace response</SelectItem></SelectGroup></SelectContent>
                </Select>
              )} />
            </div>
            <div className="mt-5 flex items-center justify-between border-t pt-4"><span className="text-[11px] font-semibold">Enabled</span><Controller control={form.control} name="enabled" render={({ field }) => <ToggleSwitch checked={field.value && !problems.length} disabled={!!problems.length} label="Network rule enabled" onChange={field.onChange} />} /></div>
          </div>
          <div className={panelClass}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><h2 className="text-[13px] font-bold">Mock response</h2><label className="flex items-center gap-3 text-[11px] font-semibold">Status code<Input className="w-24 font-sans" type="number" min={200} max={599} step={1} required {...form.register('status', { valueAsNumber: true })} /></label></div>
            <div className={fieldClass} data-response-body><span id="response-body-label">Response body</span>
              <Controller control={form.control} name="body" render={({ field }) => <Suspense fallback={<textarea aria-label="Response body" rows={12} className="rounded-md border bg-field p-3" value={displayText(field.value)} readOnly disabled={busy} />}>
                <ResponseBodyEditor value={field.value} onChange={field.onChange} onBlur={field.onBlur} disabled={busy} isJson={isJson}
                  resolvedBody={resolvedBody?.ok ? resolvedBody.value : undefined} />
              </Suspense>} />
            </div>
            {noBody && <p className="mt-3 text-xs text-muted-foreground" role="status">HEAD and status 204, 205, or 304 return no body. Your entered text is still saved.</p>}
            <div className="mt-6 mb-4 flex items-center justify-between gap-4"><h3 className="text-[13px] font-bold">Response headers</h3><Button variant="secondary" type="button" onClick={() => append({ key: '', value: '' })}><Icon icon={Plus} data-icon="inline-start" /> Add header</Button></div>
            {fields.map((header, index) => <div key={header.id} className={cn("mb-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_26px] items-center gap-x-3 gap-y-2 mobile:grid-cols-[minmax(0,1fr)_26px] mobile:gap-y-3", index === 0 && headerRowLayout.labelledRow)}>
              <label className={cn(fieldClass, "col-start-1", index === 0 && headerRowLayout.labelledField)}><span className={index ? 'sr-only' : ''}>Name</span><Controller control={form.control} name={`headers.${index}.key`} render={({ field }) => (
                <TemplateField className="font-sans text-[11px]" aria-label={`Response header ${index + 1} name`} value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref}
                  placeholder="Content-Type" invalid={!!problemAt(problems, ['headers', index, 'key'])} />
              )} /></label>
              <label className={cn(fieldClass, "col-start-2 mobile:col-start-1", index === 0 && headerRowLayout.labelledField)}><span className={index ? 'sr-only' : ''}>Value</span><Controller control={form.control} name={`headers.${index}.value`} render={({ field }) => (
                <TemplateField className="font-sans text-[11px]" aria-label={`Response header ${index + 1} value`} value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref}
                  placeholder="application/json" invalid={!!problemAt(problems, ['headers', index, 'value'])} />
              )} /></label>
              <Button variant="ghost-muted" size="icon-field" type="button" className={cn("col-start-3", headerRowLayout.action, index === 0 && headerRowLayout.labelledControl)} aria-label={`Remove response header ${index + 1}`} onClick={() => remove(index)}><Icon icon={X} /></Button>
            </div>)}
          </div>
          <p className="mb-5 text-[11px] text-muted-foreground">The page receives your mock while DevTools stays usable. Chrome's Network panel may show the original response; bypassed calls do not reach the server.</p>
          <RuleProblemsNote problems={problems} />
          {error && <p className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive" role="alert">{error}</p>}
          <div className="mt-6 mb-10 flex items-center gap-2"><Button asChild variant="ghost" size="default" className="ml-auto"><a href="#/network-rules">Cancel</a></Button><Button type="submit">Save</Button></div>
        </fieldset>
      </form>
    </section>
  )
}
