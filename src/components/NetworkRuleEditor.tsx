import { lazy, Suspense, useMemo, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
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
import { createNetworkRuleDraft, displayHeaders, isJsonResponse, NETWORK_METHODS } from '../lib/network-rules'
import { templateJsonWarning } from '../lib/resolve-rules'
import { displayText } from '../lib/templates'
import { TemplateInput } from './TemplateInput'
import { FieldIssue, VariableStatus } from './rule-editor-variables'
import { domainIssues, INACTIVE_SAVED, resolveDraftIssues, useDraftIssues, useRenameRemap } from './rule-editor-issues'
import { useVariableValues } from './variables-context'
import type { NetworkRule, NetworkRuleDraft } from '../lib/network-rules'
import { cn } from '../lib/utils'
import { headerRowLayout } from './headerRowLayout'
import { WebsiteDomains } from './WebsiteDomains'
import type { WebsiteDomainsHandle } from './WebsiteDomains'

type Props = {
  networkRule?: NetworkRule
  initialDraft?: NetworkRuleDraft
  pending: boolean
  onSave: (draft: NetworkRuleDraft) => Promise<void>
  onDelete?: () => void
}
const ResponseBodyEditor = lazy(() => import('./ResponseBodyEditor'))

const fieldClass = 'grid min-w-0 content-start gap-2 text-[11px] font-semibold'
const panelClass = 'mb-5 rounded-lg border bg-card shadow-panel px-7 py-6 mobile:px-[17px]'

export function NetworkRuleEditor({ networkRule, initialDraft, pending, onSave, onDelete }: Props) {
  const domainsRef = useRef<WebsiteDomainsHandle>(null)
  const values = useVariableValues()
  const { form, formRef, onSubmit, busy, unsaved, setPendingInput, error } = useEditorForm({
    schema: NetworkRuleDraftSchema, initial: () => networkRule
      ? structuredClone({ name: networkRule.name, url: networkRule.url, requestUrl: networkRule.requestUrl, method: networkRule.method, enabled: networkRule.enabled,
        mode: networkRule.mode, body: networkRule.body, status: networkRule.status, headers: networkRule.headers })
      : initialDraft ?? { ...createNetworkRuleDraft(), url: [] },
    beforeSubmit: () => domainsRef.current?.commit() ?? true,
    pending, returnRoute: '/network-rules',
    onSave: async draft => {
      await onSave(draft)
      if (resolveDraftIssues({ kind: 'network-rule', value: draft }, values).blocking) toast.warning('Network rule saved', { description: INACTIVE_SAVED })
    },
  })
  useRenameRemap(form)
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'headers' })
  const draft = useWatch({ control: form.control }) as NetworkRuleDraft
  const { method, status, headers, body } = draft
  const issues = useDraftIssues({ kind: 'network-rule', value: draft })
  const jsonWarning = useMemo(() => templateJsonWarning(body, headers, values), [body, headers, values])
  const noBody = method === 'HEAD' || [204, 205, 304].includes(status)

  return (
    <section className="mx-auto max-w-[840px] animate-rise-in" aria-labelledby="network-editor-title">
      <RuleEditorHeader kind="network" editing={!!networkRule} ruleName={networkRule ? displayText(networkRule.name) : undefined} busy={busy} titleId="network-editor-title" onDelete={onDelete} unsaved={unsaved}
        onExport={() => { if (networkRule) downloadRules({ requestHeaderRules: [], networkRules: [networkRule] }, 'network-rule') }} />
      <form ref={formRef} onSubmit={onSubmit}>
        <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
          <div className={panelClass}>
            <h2 className="mb-5 text-[13px] font-bold">Request matching</h2>
            <div className="grid grid-cols-2 gap-5 mobile:grid-cols-1">
              <div className={fieldClass}><span aria-hidden="true">Network rule name</span>
                <Controller control={form.control} name="name" render={({ field, fieldState }) => (
                  <TemplateInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} disabled={busy}
                    aria-label="Network rule name" placeholder="e.g. Featured chats" autoFocus invalid={fieldState.invalid || issues.byPath.has('name')} />
                )} />
                <FieldIssue message={issues.byPath.get('name')} />
              </div>
              <Controller control={form.control} name="url" render={({ field, fieldState }) => (
                <WebsiteDomains ref={domainsRef} disabled={busy} value={field.value} onChange={field.onChange} onBlur={field.onBlur} onPendingChange={setPendingInput} inputRef={field.ref} error={fieldState.error?.message} issues={domainIssues(issues)} />
              )} />
            </div>
            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-4 mobile:grid-cols-1">
              <div className={fieldClass}><span aria-hidden="true">Request URL</span>
                <Controller control={form.control} name="requestUrl" render={({ field, fieldState }) => (
                  <TemplateInput className="font-sans" value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} disabled={busy}
                    aria-label="Request URL" placeholder="https://api.example.com/chats?tab=featured" invalid={fieldState.invalid || issues.byPath.has('requestUrl')} />
                )} />
                <FieldIssue message={issues.byPath.get('requestUrl')} />
              </div>
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
            <div className="mt-5 flex items-center justify-between border-t pt-4"><span className="text-[11px] font-semibold">Enabled</span><Controller control={form.control} name="enabled" render={({ field }) => <ToggleSwitch checked={field.value} label="Network rule enabled" onChange={field.onChange} />} /></div>
          </div>
          <div className={panelClass}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><h2 className="text-[13px] font-bold">Mock response</h2><label className="flex items-center gap-3 text-[11px] font-semibold">Status code<Input className="w-24 font-sans" type="number" min={200} max={599} step={1} required {...form.register('status', { valueAsNumber: true })} /></label></div>
            <div className={fieldClass} data-response-body><span id="response-body-label">Response body</span>
              <Controller control={form.control} name="body" render={({ field }) => <Suspense fallback={<textarea aria-label="Response body" rows={12} className="rounded-md border bg-field p-3" value={displayText(field.value)} readOnly disabled />}>
                <ResponseBodyEditor value={field.value} onChange={field.onChange} onBlur={field.onBlur} disabled={busy} isJson={isJsonResponse(displayHeaders(headers))} warning={jsonWarning} />
              </Suspense>} />
              <FieldIssue message={issues.byPath.get('body')} />
            </div>
            {noBody && <p className="mt-3 text-xs text-muted-foreground" role="status">HEAD and status 204, 205, or 304 return no body. Your entered text is still saved.</p>}
            <div className="mt-6 mb-4 flex items-center justify-between gap-4"><h3 className="text-[13px] font-bold">Response headers</h3><Button variant="secondary" type="button" onClick={() => append({ key: '', value: '' })}><Icon icon={Plus} data-icon="inline-start" /> Add header</Button></div>
            {fields.map((header, index) => <div key={header.id} className={cn("mb-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_26px] items-center gap-x-3 gap-y-2 mobile:grid-cols-[minmax(0,1fr)_26px] mobile:gap-y-3", index === 0 && headerRowLayout.labelledRow)}>
              {(['key', 'value'] as const).map(part => <div key={part} className={cn(fieldClass, part === 'key' ? 'col-start-1' : 'col-start-2 mobile:col-start-1', index === 0 && headerRowLayout.labelledField)}>
                <span className={index ? 'sr-only' : ''} aria-hidden="true">{part === 'key' ? 'Name' : 'Value'}</span>
                <Controller control={form.control} name={`headers.${index}.${part}`} render={({ field, fieldState }) => (
                  <TemplateInput className="font-sans" value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} disabled={busy}
                    aria-label={`Response header ${index + 1} ${part === 'key' ? 'name' : 'value'}`} placeholder={part === 'key' ? 'Content-Type' : 'application/json'}
                    invalid={fieldState.invalid || issues.byPath.has(`headers.${index}.${part}`)} />
                )} />
                <FieldIssue message={issues.byPath.get(`headers.${index}.${part}`)} />
              </div>)}
              <Button variant="ghost-muted" size="icon-field" type="button" className={cn("col-start-3", headerRowLayout.action, index === 0 && headerRowLayout.labelledControl)} aria-label={`Remove response header ${index + 1}`} onClick={() => remove(index)}><Icon icon={X} /></Button>
            </div>)}
          </div>
          <p className="mb-5 text-[11px] text-muted-foreground">The page receives your mock while DevTools stays usable. Chrome's Network panel may show the original response; bypassed calls do not reach the server.</p>
          <VariableStatus show={issues.blocking} />
          {error && <p className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive" role="alert">{error}</p>}
          <div className="mt-6 mb-10 flex items-center gap-2"><Button asChild variant="ghost" size="default" className="ml-auto"><a href="#/network-rules">Cancel</a></Button><Button type="submit">Save</Button></div>
        </fieldset>
      </form>
    </section>
  )
}
