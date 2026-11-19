import { Check, Plus, X } from 'lucide-react'
import { useRef } from 'react'
import { toast } from 'sonner'
import { WebsiteDomains } from './WebsiteDomains'
import type { WebsiteDomainsHandle } from './WebsiteDomains'
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
import { displayText } from '../lib/templates'
import { cn } from '../lib/utils'
import { headerRowLayout } from './headerRowLayout'
import { TemplateInput } from './TemplateInput'
import { FieldIssue, VariableStatus } from './rule-editor-variables'
import { domainIssues, INACTIVE_SAVED, resolveDraftIssues, useDraftIssues, useRenameRemap } from './rule-editor-issues'
import { useVariableValues } from './variables-context'

type HeaderRuleEditorProps = {
  headerRule?: HeaderRule
  pending: boolean
  onSave: (draft: HeaderRuleDraft) => Promise<HeaderRule>
  onDelete?: () => void
}

export function HeaderRuleEditor({ headerRule, pending, onSave, onDelete }: HeaderRuleEditorProps) {
  const domainsRef = useRef<WebsiteDomainsHandle>(null)
  const values = useVariableValues()
  const hasProblem = (draft: HeaderRuleDraft) => resolveDraftIssues({ kind: 'header-rule', value: draft }, values).blocking
  const { form, formRef, onSubmit, busy, unsaved, setPendingInput, error, success } = useEditorForm({
    schema: HeaderRuleDraftSchema, initial: () => headerRule ? headerRuleToDraft(headerRule) : { ...createHeaderRuleDraft(), url: [] },
    beforeSubmit: () => domainsRef.current?.commit() ?? true,
    pending, returnRoute: '/header-rules', successMessage: draft => hasProblem(draft) ? `Header rule saved. ${INACTIVE_SAVED}` : 'Header rule saved.',
    onSave: async draft => {
      const saved = headerRuleToDraft(await onSave(draft))
      if (hasProblem(saved)) toast.warning('Header rule saved', { description: INACTIVE_SAVED })
      return saved
    },
  })
  useRenameRemap(form)
  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: 'headers' })
  const draft = useWatch({ control: form.control }) as HeaderRuleDraft
  const issues = useDraftIssues({ kind: 'header-rule', value: draft })
  const saveState = { tone: error ? 'error' : 'success', message: error || success }

  return (
    <section className="mx-auto max-w-[840px] animate-rise-in" aria-labelledby="editor-title">
      <RuleEditorHeader kind="header" editing={!!headerRule} ruleName={headerRule ? displayText(headerRule.name) : undefined} busy={busy} onDelete={onDelete} unsaved={unsaved}
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
              <div className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">
                <span aria-hidden="true">Header rule name</span>
                <Controller control={form.control} name="name" render={({ field, fieldState }) => (
                  <TemplateInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} disabled={busy}
                    aria-label="Header rule name" placeholder="e.g. Authenticated API" autoFocus invalid={fieldState.invalid || issues.byPath.has('name')} />
                )} />
                <FieldIssue message={issues.byPath.get('name')} />
              </div>
              <Controller control={form.control} name="url" render={({ field, fieldState }) => (
                <WebsiteDomains ref={domainsRef} disabled={busy} value={field.value} onChange={field.onChange} onBlur={field.onBlur} onPendingChange={setPendingInput} inputRef={field.ref} error={fieldState.error?.message} issues={domainIssues(issues)} />
              )} />
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
                <Icon icon={Plus} data-icon="inline-start" /> Add header
              </Button>
            </div>
            <div className="min-w-0">
              {fields.map((header, index) => (
                <div className={cn("mb-6 grid grid-cols-[20px_minmax(0,1fr)_minmax(0,1.4fr)_26px] items-center gap-x-[13px] gap-y-2 mobile:gap-3 mobile:grid-cols-[1fr_26px] mobile:border-b mobile:pb-5 mobile:last:border-b-0 mobile:last:pb-0", index === 0 && headerRowLayout.labelledRow)} key={header.id}>
                  <span className={cn("col-start-1 font-sans text-[10px] text-muted-foreground mobile:hidden", index === 0 && headerRowLayout.labelledControl)}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {(['key', 'value'] as const).map(part => (
                    <div key={part} className={cn("grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1", part === 'key' ? 'col-start-2' : 'col-start-3', index === 0 && headerRowLayout.labelledField)}>
                      {index === 0 && <span aria-hidden="true">{part === 'key' ? 'Name' : 'Value'}</span>}
                      <Controller control={form.control} name={`headers.${index}.${part}`} render={({ field, fieldState }) => (
                        <TemplateInput className="font-sans" value={field.value} onChange={field.onChange} onBlur={field.onBlur} ref={field.ref} disabled={busy}
                          placeholder={part === 'key' ? 'e.g. Authorization' : 'e.g. Bearer token'} aria-label={`Header ${index + 1} ${part === 'key' ? 'name' : 'value'}`}
                          invalid={fieldState.invalid || issues.byPath.has(`headers.${index}.${part}`)} />
                      )} />
                      <FieldIssue message={issues.byPath.get(`headers.${index}.${part}`)} />
                    </div>
                  ))}
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
          <VariableStatus show={issues.blocking} />
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
