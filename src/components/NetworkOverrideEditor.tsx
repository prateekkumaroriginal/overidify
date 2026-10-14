import { Controller, useFieldArray, useWatch } from 'react-hook-form'
import { NetworkOverrideDraftSchema } from '../lib/network-schemas'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { NativeSelect } from './ui/native-select'
import { Icon } from './Icon'
import { ToggleSwitch } from './ToggleSwitch'
import { useEditorForm } from './useEditorForm'
import { createNetworkOverrideDraft, jsonBodyWarning, NETWORK_METHODS } from '../lib/network-overrides'
import type { NetworkOverride, NetworkOverrideDraft } from '../lib/network-overrides'

type Props = {
  override?: NetworkOverride
  pending: boolean
  onSave: (draft: NetworkOverrideDraft) => Promise<void>
  onDelete?: () => void
}
const fieldClass = 'grid min-w-0 content-start gap-2 text-[11px] font-semibold'
const panelClass = 'mb-5 rounded-lg border bg-card shadow-panel px-7 py-6 mobile:px-[17px]'

export function NetworkOverrideEditor({ override, pending, onSave, onDelete }: Props) {
  const { form, formRef, onSubmit, busy, error } = useEditorForm({
    schema: NetworkOverrideDraftSchema, initial: () => override
      ? { ...override, headers: override.headers.map(header => ({ ...header })) }
      : createNetworkOverrideDraft(),
    pending, returnRoute: '/network-overrides', onSave,
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'headers' })
  const [body, method, status, headers, mode] = useWatch({ control: form.control, name: ['body', 'method', 'status', 'headers', 'mode'] })
  const warning = jsonBodyWarning({ body, headers })
  const noBody = method === 'HEAD' || [204, 205, 304].includes(status)

  return (
    <section className="mx-auto max-w-[840px] animate-rise-in" aria-labelledby="network-editor-title">
      <a className="inline-flex items-center gap-2 text-[11px] text-muted-foreground no-underline hover:text-primary [&_svg]:w-[15px]" href="#/network-overrides"><Icon name="back" /> Back to network overrides</a>
      <h1 id="network-editor-title" className="mt-7 mb-7 text-xl font-semibold">{override ? 'Edit network override' : 'New network override'}</h1>
      <form ref={formRef} onSubmit={onSubmit}>
        <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
          <div className={panelClass}>
            <h2 className="mb-5 text-[13px] font-bold">Request matching</h2>
            <div className="grid grid-cols-2 gap-5 mobile:grid-cols-1">
              <label className={fieldClass}>Override name<Input {...form.register('name')} placeholder="e.g. Featured chats" required autoFocus /></label>
              <label className={fieldClass}>Website domain<Input {...form.register('url')} placeholder="e.g. localhost:4200" required aria-describedby="network-domain-help" /></label>
            </div>
            <p id="network-domain-help" className="mt-3 text-[11px] text-muted-foreground">Matches the page domain on every path, just like Rules and Switchers. Requests from its frames use the same website scope.</p>
            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-4 mobile:grid-cols-1">
              <label className={fieldClass}>Request URL<Input className="font-mono text-[11px]" {...form.register('requestUrl')} placeholder="https://api.example.com/chats?tab=featured" required aria-describedby="network-target-help" /></label>
              <label className={fieldClass}>HTTP method<NativeSelect className="py-[11px]" {...form.register('method')}>{NETWORK_METHODS.map(method => <option key={method} value={method}>{method === 'ANY' ? 'Any' : method}</option>)}</NativeSelect></label>
            </div>
            <p id="network-target-help" className="mt-3 text-[11px] text-muted-foreground">The full API URL must match. Query parameter order is ignored; parameter names and values must be the same.</p>
            <label className={`${fieldClass} mt-5`}>Server behavior<NativeSelect className="py-[11px]" {...form.register('mode')}><option value="bypass">Bypass server</option><option value="call-server">Call server, then replace response</option></NativeSelect></label>
            <p className="mt-3 text-[11px] text-muted-foreground">{mode === 'bypass' ? 'Return the mock without making the target API call.' : 'Make the real call with your Rules and Switchers headers, then return the mock once response headers arrive. Failures before headers stay failures. Synchronous XHR waits for native completion and preserves native failures.'}</p>
            <div className="mt-5 flex items-center justify-between border-t pt-4"><span className="text-[11px] font-semibold">Enabled</span><Controller control={form.control} name="enabled" render={({ field }) => <ToggleSwitch checked={field.value} label="Network override enabled" onChange={field.onChange} />} /></div>
          </div>
          <div className={panelClass}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><h2 className="text-[13px] font-bold">Mock response</h2><label className="flex items-center gap-3 text-[11px] font-semibold">Status code<Input className="w-24 font-mono" type="number" min={200} max={599} step={1} required {...form.register('status', { valueAsNumber: true })} /></label></div>
            <div className={fieldClass}><label htmlFor="network-response-body">Response body</label><textarea id="network-response-body" className="w-full min-w-0 rounded-md border border-input bg-field p-3 font-mono text-xs font-normal text-foreground focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/15" rows={12} spellCheck={false} {...form.register('body')} placeholder={'{\n  "chats": []\n}'} /></div>
            {warning && <p className="mt-3 text-xs text-muted-foreground" role="status">{warning}</p>}
            {noBody && <p className="mt-3 text-xs text-muted-foreground" role="status">HEAD and status 204, 205, or 304 return no body. Your entered text is still saved.</p>}
            <div className="mt-6 mb-4 flex items-center justify-between gap-4"><h3 className="text-[13px] font-bold">Response headers</h3><Button variant="secondary" type="button" onClick={() => append({ key: '', value: '' })}><Icon name="plus" /> Add header</Button></div>
            {fields.map((header, index) => <div key={header.id} className="mb-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_26px] items-end gap-3 mobile:grid-cols-[minmax(0,1fr)_26px]">
              <label className={fieldClass}><span className={index ? 'sr-only' : ''}>Name</span><Input className="font-mono text-[11px]" aria-label={`Response header ${index + 1} name`} {...form.register(`headers.${index}.key`)} placeholder="Content-Type" /></label>
              <label className={`${fieldClass} mobile:col-start-1`}><span className={index ? 'sr-only' : ''}>Value</span><Input className="font-mono text-[11px]" aria-label={`Response header ${index + 1} value`} {...form.register(`headers.${index}.value`)} placeholder="application/json" /></label>
              <Button variant="ghost" type="button" className="mb-2 size-[26px] text-muted-foreground mobile:col-start-2 mobile:row-span-2 mobile:row-start-1" aria-label={`Remove response header ${index + 1}`} onClick={() => remove(index)}><Icon name="close" /></Button>
            </div>)}
            <p className="mt-4 text-[11px] text-muted-foreground">These headers replace the response header set delivered to the page. Mock headers do not set browser cookies.</p>
          </div>
          <p className="mb-5 text-[11px] text-muted-foreground">The page receives your mock while DevTools stays usable. Chrome's Network panel may show the original response; bypassed calls do not reach the server.</p>
          {error && <p className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive" role="alert">{error}</p>}
          <div className="mt-6 mb-10 flex items-center gap-5">{onDelete && <Button variant="ghost" type="button" className="px-0 text-[11px] text-muted-foreground hover:text-destructive" onClick={onDelete}>Delete override</Button>}<a className="ml-auto text-[11px] text-muted-foreground no-underline" href="#/network-overrides">Cancel</a><Button type="submit">Save</Button></div>
        </fieldset>
      </form>
    </section>
  )
}
