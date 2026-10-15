import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Controller, useFieldArray } from 'react-hook-form'
import { HeaderRuleDraftSchema } from '../lib/request-header-schemas'
import { createHeaderPair, createHeaderRuleDraft, headerRuleToDraft } from '../lib/request-header-rules'
import type { HeaderRule, HeaderRuleDraft } from '../lib/types'
import { Icon } from './Icon'
import { ToggleSwitch } from './ToggleSwitch'
import { useEditorForm } from './useEditorForm'

type HeaderRuleEditorProps = {
  headerRule?: HeaderRule
  pending: boolean
  onSave: (draft: HeaderRuleDraft) => Promise<HeaderRule>
  onDelete?: () => void
}

export function HeaderRuleEditor({ headerRule, pending, onSave, onDelete }: HeaderRuleEditorProps) {
  const { form, formRef, onSubmit, busy, error, success } = useEditorForm({
    schema: HeaderRuleDraftSchema, initial: () => headerRule ? headerRuleToDraft(headerRule) : createHeaderRuleDraft(),
    pending, returnRoute: '/header-rules', successMessage: 'Header rule saved.',
    onSave: async draft => headerRuleToDraft(await onSave(draft)),
  })
  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: 'headers' })
  const saveState = { tone: error ? 'error' : 'success', message: error || success }

  return (
    <section className="mx-auto max-w-[840px] animate-rise-in" aria-labelledby="editor-title">
      <a className="inline-flex items-center gap-2 text-[11px] text-muted-foreground no-underline hover:text-primary [&_svg]:w-[15px]" href="#/header-rules">
        <Icon name="back" /> Back to header rules
      </a>
      <div className="mt-[27px] mb-[30px] mobile:mt-5 [&_h1]:text-xl [&_h1]:leading-[1.4] [&_h1]:font-semibold">
        <h1 id="editor-title">{headerRule ? 'Edit header rule' : 'New header rule'}</h1>
      </div>
      <form
        ref={formRef}
        onSubmit={onSubmit}
      >
        <fieldset className="m-0 min-w-0 border-0 p-0" disabled={busy}>
          <div className="mb-5 rounded-lg border bg-card shadow-panel px-7 pt-[25px] mobile:px-[17px] mobile:pt-5">
            <div className="mb-6 flex items-center justify-between gap-[13px] mobile:flex-wrap mobile:gap-[9px] [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:tracking-[-0.2px] mobile:[&>div]:flex-1">
              <div>
                <h2>Header rule details</h2>
              </div>
            </div>
            <div className="mb-[22px] grid grid-cols-[1fr_1.35fr] gap-6 mobile:grid-cols-1 mobile:gap-[17px]">
              <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">
                Header rule name
                <Input
                  {...form.register('name')}
                  placeholder="e.g. Authenticated API"
                  autoFocus
                  required
                />
              </label>
              <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">
                Domain
                <Input
                  className="font-mono text-[11px]"
                  {...form.register('url')}
                  placeholder="e.g. localhost:4200 or api.example.com"
                  aria-label="Domain"
                  aria-describedby="header-rule-domain-help"
                  required
                />
                <span id="header-rule-domain-help" className="font-normal text-muted-foreground">Matches the page's domain on every path. Applies to requests made from that page, including other API hosts. Include a port to match only that port.</span>
              </label>
            </div>
            <div className="flex items-center justify-between gap-5 border-t py-[17px]">
              <span className="text-[11px] font-semibold">Enabled</span>
              <Controller control={form.control} name="enabled" render={({ field }) => <ToggleSwitch checked={field.value} label="Header rule enabled" onChange={field.onChange} />} />
            </div>
          </div>
          <div className="mb-5 rounded-lg border bg-card shadow-panel px-7 pt-[25px] mobile:px-[17px] mobile:pt-5">
            <div className="mb-6 flex items-center justify-between gap-[13px] mobile:flex-wrap mobile:gap-[9px] [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:tracking-[-0.2px] mobile:[&>div]:flex-1">
              <div>
                <h2>Request headers</h2>
              </div>
              <Button variant="secondary" className="ml-auto"
                type="button"
                onClick={() => append(createHeaderPair())}
              >
                <Icon name="plus" /> Add header
              </Button>
            </div>
            <div className="min-w-0">
              {fields.map((header, index) => (
                <div className="mb-6 grid grid-cols-[20px_minmax(0,1fr)_minmax(0,1.4fr)_26px] items-end gap-[13px] mobile:gap-3 mobile:grid-cols-[1fr_26px] mobile:items-center mobile:border-b mobile:pb-5 mobile:last:border-b-0 mobile:last:pb-0" key={header.id}>
                  <span className="pb-3 font-mono text-[10px] text-muted-foreground mobile:hidden">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">
                    {index === 0 && 'Name'}
                    <Input
                      className="font-mono text-[11px]"
                      {...form.register(`headers.${index}.key`)}
                      placeholder="e.g. Authorization"
                      aria-label={`Header ${index + 1} name`}
                    />
                  </label>
                  <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">
                    {index === 0 && 'Value'}
                    <Input
                      className="font-mono text-[11px]"
                      {...form.register(`headers.${index}.value`)}
                      placeholder="e.g. Bearer token"
                      aria-label={`Header ${index + 1} value`}
                    />
                  </label>
                  <Button variant="ghost" className="mb-[7px] size-[26px] text-muted-foreground [&_svg]:size-[15px] mobile:col-start-2 mobile:row-span-2 mobile:row-start-1 mobile:mb-0"
                    type="button"
                    aria-label={`Remove header ${index + 1}`}
                    onClick={() => fields.length === 1 ? replace([createHeaderPair()]) : remove(index)}
                  >
                    <Icon name="close" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          {saveState.message && (
            <p
              className={`mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs [&_svg]:size-4 ${saveState.tone === 'error' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-input bg-secondary text-secondary-foreground'}`}
              role={saveState.tone === 'error' ? 'alert' : 'status'}
            >
              <Icon name={saveState.tone === 'error' ? 'close' : 'check'} />
              {saveState.message}
            </p>
          )}
          <div className="mt-[25px] mb-10 flex items-center gap-[23px] mobile:gap-[17px]">
            {onDelete && (
              <Button variant="ghost"
                type="button"
                className="h-auto px-0 py-[9px] rounded-none text-[11px] text-muted-foreground hover:bg-transparent hover:text-destructive"
                onClick={onDelete}
              >
                Delete header rule
              </Button>
            )}
            <a className="ml-auto text-[11px] text-muted-foreground no-underline hover:text-foreground" href="#/header-rules">
              Cancel
            </a>
            <Button variant="default" className="mobile:px-3 mobile:text-xs" type="submit">
              Save
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  )
}
