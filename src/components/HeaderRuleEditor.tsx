import { toast } from 'sonner'
import { Check, Plus, X } from 'lucide-react'
import { useRef } from 'react'
import { WebsiteDomains } from './WebsiteDomains'
import type { WebsiteDomainsHandle } from './WebsiteDomains'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Controller, useFieldArray, useWatch } from 'react-hook-form'
import { HeaderRuleDraftSchema } from '../lib/request-header-schemas'
import { createHeaderPair, createHeaderRuleDraft, headerRuleToDraft } from '../lib/request-header-rules'
import type { HeaderRule, HeaderRuleDraft } from '../lib/types'
import { Icon } from './Icon'
import { RuleEditorHeader } from './RuleEditorHeader'
import { ToggleSwitch } from './ToggleSwitch'
import { useEditorForm } from './useEditorForm'
import { downloadRules } from '../lib/rule-download'
import { cn } from '../lib/utils'
import { headerRowLayout } from './headerRowLayout'
import { TemplateField } from './TemplateField'
import { problemAt, TURNED_OFF_SAVED, useDraftCheck } from './rule-problems'
import { RuleProblemsNote } from './RuleProblemsNote'
import { useStoredEnabled } from './useStoredEnabled'

type HeaderRuleEditorProps = {
  headerRule?: HeaderRule
  pending: boolean
  /** `enabledChanged` is false when the user left the toggle alone, so Save keeps the stored state. */
  onSave: (draft: HeaderRuleDraft, enabledChanged: boolean) => Promise<HeaderRule>
  onDelete?: () => void
}

export function HeaderRuleEditor({ headerRule, pending, onSave, onDelete }: HeaderRuleEditorProps) {
  const domainsRef = useRef<WebsiteDomainsHandle>(null)
  const { form, formRef, onSubmit, busy, unsaved, setPendingInput, error, success } = useEditorForm({
    schema: HeaderRuleDraftSchema, initial: () => headerRule ? headerRuleToDraft(headerRule) : { ...createHeaderRuleDraft(), url: [] },
    beforeSubmit: () => domainsRef.current?.commit() ?? true,
    pending, returnRoute: '/header-rules', successMessage: 'Header rule saved.',
    onSave: async draft => {
      const saved = await onSave(draft, storedEnabled.enabledChanged())
      if (draft.enabled && !saved.enabled) toast.warning('Header rule saved turned off', { description: TURNED_OFF_SAVED })
      return headerRuleToDraft(saved)
    },
  })
  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: 'headers' })
  const draft = useWatch({ control: form.control }) as HeaderRuleDraft
  const { problems } = useDraftCheck({ kind: 'header-rule', value: draft })
  const storedEnabled = useStoredEnabled(form, headerRule?.enabled)
  const saveState = { tone: error ? 'error' : 'success', message: error || success }

  return (
    <section className="animate-rise-in" aria-labelledby="editor-title">
      <RuleEditorHeader kind="header" editing={!!headerRule} ruleName={headerRule?.name} busy={busy} onDelete={onDelete} unsaved={unsaved}
        onExport={() => { if (headerRule) downloadRules({ requestHeaderRules: [headerRule], networkRules: [] }, 'header-rule') }} />
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
              <Controller control={form.control} name="url" render={({ field, fieldState }) => (
                <WebsiteDomains ref={domainsRef} disabled={busy} value={field.value} onChange={field.onChange} onBlur={field.onBlur} onPendingChange={setPendingInput} inputRef={field.ref} error={fieldState.error?.message} />
              )} />
            </div>
            <div className="flex items-center justify-between gap-5 border-t py-[17px]">
              <span className="text-[11px] font-semibold">Enabled</span>
              <Controller control={form.control} name="enabled" render={({ field }) => <ToggleSwitch checked={field.value && !problems.length} disabled={!!problems.length} label="Header rule enabled" onChange={enabled => { storedEnabled.choose(enabled); field.onChange(enabled) }} />} />
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
                <Icon icon={Plus} data-icon="inline-start" /> Add header
              </Button>
            </div>
            <div className="min-w-0">
              {fields.map((header, index) => (
                <div className={cn("mb-6 grid grid-cols-[20px_minmax(0,1fr)_minmax(0,1.4fr)_26px] items-center gap-x-[13px] gap-y-2 mobile:gap-3 mobile:grid-cols-[1fr_26px] mobile:border-b mobile:pb-5 mobile:last:border-b-0 mobile:last:pb-0", index === 0 && headerRowLayout.labelledRow)} key={header.id}>
                  <span className={cn("col-start-1 font-sans text-[10px] text-muted-foreground mobile:hidden", index === 0 && headerRowLayout.labelledControl)}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <label className={cn("col-start-2 grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1", index === 0 && headerRowLayout.labelledField)}>
                    {index === 0 && 'Name'}
                    <Controller control={form.control} name={`headers.${index}.key`} render={({ field }) => (
                      <TemplateField className="font-sans text-[11px]" value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref}
                        placeholder="e.g. Authorization" aria-label={`Header ${index + 1} name`} invalid={!!problemAt(problems, ['headers', index, 'key'])} />
                    )} />
                  </label>
                  <label className={cn("col-start-3 grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1", index === 0 && headerRowLayout.labelledField)}>
                    {index === 0 && 'Value'}
                    <Controller control={form.control} name={`headers.${index}.value`} render={({ field }) => (
                      <TemplateField className="font-sans text-[11px]" value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref}
                        placeholder="e.g. Bearer token" aria-label={`Header ${index + 1} value`} invalid={!!problemAt(problems, ['headers', index, 'value'])} />
                    )} />
                  </label>
                  <Button variant="ghost-muted" size="icon-field" className={cn("col-start-4", headerRowLayout.action, index === 0 && headerRowLayout.labelledControl)}
                    type="button"
                    aria-label={`Remove header ${index + 1}`}
                    onClick={() => fields.length === 1 ? replace([createHeaderPair()]) : remove(index)}
                  >
                    <Icon icon={X} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <RuleProblemsNote problems={problems} />
          {saveState.message && (
            <p
              className={`mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs [&_svg]:size-4 ${saveState.tone === 'error' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-input bg-secondary text-secondary-foreground'}`}
              role={saveState.tone === 'error' ? 'alert' : 'status'}
            >
              <Icon icon={saveState.tone === 'error' ? X : Check} />
              {saveState.message}
            </p>
          )}
          <div className="mt-[25px] mb-10 flex items-center gap-2">
            <Button asChild variant="ghost" size="default" className="ml-auto"><a href="#/header-rules">Cancel</a></Button>
            <Button variant="default" type="submit">
              Save
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  )
}
