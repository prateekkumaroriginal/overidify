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
import { createNetworkRuleDraft, jsonBodyWarning, NETWORK_METHODS } from '../lib/network-rules'
import type { NetworkRule, NetworkRuleDraft } from '../lib/network-rules'

type Props = {
  networkRule?: NetworkRule
  pending: boolean
  onSave: (draft: NetworkRuleDraft) => Promise<void>
  onDelete?: () => void
}
const fieldClass = 'grid min-w-0 content-start gap-2 text-[11px] font-semibold'
const panelClass = 'mb-5 rounded-lg border bg-card shadow-panel px-7 py-6 mobile:px-[17px]'

export function NetworkRuleEditor({ networkRule, pending, onSave, onDelete }: Props) {
  const { form, formRef, onSubmit, busy, error } = useEditorForm({
    schema: NetworkRuleDraftSchema, initial: () => networkRule
      ? { ...networkRule, headers: networkRule.headers.map(header => ({ ...header })) }
      : createNetworkRuleDraft(),
    pending, returnRoute: '/network-rules', onSave,
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'headers' })
  const [body, method, status, headers, mode] = useWatch({ control: form.control, name: ['body', 'method', 'status', 'headers', 'mode'] })
  const warning = jsonBodyWarning({ body, headers })
  const noBody = method === 'HEAD' || [204, 205, 304].includes(status)

  return (
    <section className="mx-auto max-w-[840px] animate-rise-in" aria-labelledby="network-editor-title">
      <RuleEditorHeader kind="network" editing={!!networkRule} ruleName={networkRule?.name} busy={busy} titleId="network-editor-title" onDelete={onDelete} unsaved={form.formState.isDirty}
        onExport={() => { if (networkRule) downloadRules({ requestHeaderRules: [], networkRules: [networkRule] }, 'network-rule') }} />
      <form ref={formRef} onSubmit={onSubmit}>
        <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
          <div className={panelClass}>
            <h2 className="mb-5 text-[13px] font-bold">Request matching</h2>
            <div className="grid grid-cols-2 gap-5 mobile:grid-cols-1">
              <label className={fieldClass}>Network rule name<Input {...form.register('name')} placeholder="e.g. Featured chats" required autoFocus /></label>
              <label className={fieldClass}>Website domain<Input {...form.register('url')} placeholder="e.g. localhost:4200" required /></label>
            </div>
            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-4 mobile:grid-cols-1">
              <label className={fieldClass}>Request URL<Input className="font-sans text-[11px]" {...form.register('requestUrl')} placeholder="https://api.example.com/chats?tab=featured" required aria-describedby="network-target-help" /></label>
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
            <p id="network-target-help" className="mt-3 text-[11px] text-muted-foreground">The full API URL must match. Query parameter order is ignored; parameter names and values must be the same.</p>
            <div className={`${fieldClass} mt-5`}>
              <label htmlFor="network-mode">Server behavior</label>
              <Controller control={form.control} name="mode" render={({ field, fieldState }) => (
                <Select name={field.name} value={field.value} onValueChange={field.onChange} disabled={busy}>
                  <SelectTrigger id="network-mode" size="lg" className="w-fit max-w-full" ref={field.ref} onBlur={field.onBlur} aria-invalid={fieldState.invalid} aria-describedby="network-mode-help"><SelectValue /></SelectTrigger>
                  <SelectContent className="w-max"><SelectGroup><SelectItem value="bypass">Bypass server</SelectItem><SelectItem value="call-server">Call server, then replace response</SelectItem></SelectGroup></SelectContent>
                </Select>
              )} />
            </div>
            <p id="network-mode-help" className="mt-3 text-[11px] text-muted-foreground">{mode === 'bypass' ? 'Return the mock without making the target API call.' : 'Make the real call with your Header Rules and Switch Rules headers, then return the mock once response headers arrive. Failures before headers stay failures. Synchronous XHR waits for native completion and preserves native failures.'}</p>
            <div className="mt-5 flex items-center justify-between border-t pt-4"><span className="text-[11px] font-semibold">Enabled</span><Controller control={form.control} name="enabled" render={({ field }) => <ToggleSwitch checked={field.value} label="Network rule enabled" onChange={field.onChange} />} /></div>
          </div>
          <div className={panelClass}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><h2 className="text-[13px] font-bold">Mock response</h2><label className="flex items-center gap-3 text-[11px] font-semibold">Status code<Input className="w-24 font-sans" type="number" min={200} max={599} step={1} required {...form.register('status', { valueAsNumber: true })} /></label></div>
            <div className={fieldClass}><label htmlFor="network-response-body">Response body</label><textarea id="network-response-body" className="w-full min-w-0 rounded-md border border-input bg-field p-3 font-sans text-xs font-normal text-foreground focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/15" rows={12} spellCheck={false} {...form.register('body')} placeholder={'{\n  "chats": []\n}'} /></div>
            {warning && <p className="mt-3 text-xs text-muted-foreground" role="status">{warning}</p>}
            {noBody && <p className="mt-3 text-xs text-muted-foreground" role="status">HEAD and status 204, 205, or 304 return no body. Your entered text is still saved.</p>}
            <div className="mt-6 mb-4 flex items-center justify-between gap-4"><h3 className="text-[13px] font-bold">Response headers</h3><Button variant="secondary" type="button" onClick={() => append({ key: '', value: '' })}><Icon icon={Plus} /> Add header</Button></div>
            {fields.map((header, index) => <div key={header.id} className="mb-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_26px] items-end gap-3 mobile:grid-cols-[minmax(0,1fr)_26px]">
              <label className={fieldClass}><span className={index ? 'sr-only' : ''}>Name</span><Input className="font-sans text-[11px]" aria-label={`Response header ${index + 1} name`} {...form.register(`headers.${index}.key`)} placeholder="Content-Type" /></label>
              <label className={`${fieldClass} mobile:col-start-1`}><span className={index ? 'sr-only' : ''}>Value</span><Input className="font-sans text-[11px]" aria-label={`Response header ${index + 1} value`} {...form.register(`headers.${index}.value`)} placeholder="application/json" /></label>
              <Button variant="ghost" type="button" className="mb-2 size-[26px] text-muted-foreground mobile:col-start-2 mobile:row-span-2 mobile:row-start-1" aria-label={`Remove response header ${index + 1}`} onClick={() => remove(index)}><Icon icon={X} /></Button>
            </div>)}
            <p className="mt-4 text-[11px] text-muted-foreground">These headers replace the response header set delivered to the page. Mock headers do not set browser cookies.</p>
          </div>
          <p className="mb-5 text-[11px] text-muted-foreground">The page receives your mock while DevTools stays usable. Chrome's Network panel may show the original response; bypassed calls do not reach the server.</p>
          {error && <p className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive" role="alert">{error}</p>}
          <div className="mt-6 mb-10 flex items-center gap-5"><a className="ml-auto text-[11px] text-muted-foreground no-underline" href="#/network-rules">Cancel</a><Button type="submit">Save</Button></div>
        </fieldset>
      </form>
    </section>
  )
}
