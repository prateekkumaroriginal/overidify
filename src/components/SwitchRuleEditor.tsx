import { Plus, Trash2, TriangleAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Controller, FormProvider, useFieldArray, useFormContext, useWatch } from 'react-hook-form'
import { displayText, renameTemplateReferences } from '../lib/templates'
import { TemplateInput } from './TemplateInput'
import type { TemplateInputHandle } from './TemplateInput'
import { TemplateTextView } from './TemplateText'
import { FieldIssue, VariableStatus } from './rule-editor-variables'
import { domainIssues, INACTIVE_SAVED, resolveDraftIssues, useDraftIssues, useRenameRemap } from './rule-editor-issues'
import { useVariableValues } from './variables-context'
import type { DraftIssues } from './rule-editor-issues'
import { SwitchRuleDraftSchema } from '../lib/request-header-schemas'
import {
  createHeaderPair,
  createSwitchRuleDraft,
  createSwitchRuleOption,
  switchRuleToDraft,
} from '../lib/request-header-rules'
import type { SwitchRule, SwitchRuleDraft, SwitchRuleOption } from '../lib/types'
import { Icon } from './Icon'
import { RuleEditorHeader } from './RuleEditorHeader'
import { ToggleSwitch } from './ToggleSwitch'
import { useEditorForm } from './useEditorForm'
import { downloadRules } from '../lib/rule-download'
import { cn } from '../lib/utils'
import { headerRowLayout } from './headerRowLayout'
import { WebsiteDomains } from './WebsiteDomains'
import type { WebsiteDomainsHandle } from './WebsiteDomains'

type SwitchRuleEditorProps = {
  switchRule?: SwitchRule
  pending: boolean
  onSave: (draft: SwitchRuleDraft) => Promise<SwitchRule>
  onDelete?: () => void
}

type DeletedOption = { option: SwitchRuleOption; index: number; selectedOptionId: string }

export function SwitchRuleEditor({ switchRule, pending, onSave, onDelete }: SwitchRuleEditorProps) {
  const domainsRef = useRef<WebsiteDomainsHandle>(null)
  const values = useVariableValues()
  const hasProblem = (draft: SwitchRuleDraft) => resolveDraftIssues({ kind: 'switch-rule', value: draft }, values).blocking
  const { form, formRef, onSubmit, busy, unsaved, setPendingInput, error, success, clearStatus } = useEditorForm({
    schema: SwitchRuleDraftSchema, initial: () => switchRule ? switchRuleToDraft(switchRule) : { ...createSwitchRuleDraft(), url: [] },
    beforeSubmit: () => domainsRef.current?.commit() ?? true,
    pending, returnRoute: '/switch-rules', successMessage: draft => hasProblem(draft) ? `Switch rule saved. ${INACTIVE_SAVED}` : 'Switch rule saved.',
    onSave: async draft => {
      const saved = await onSave(draft)
      setDeletedOption(null)
      if (hasProblem(saved)) toast.warning('Switch rule saved', { description: INACTIVE_SAVED })
      return switchRuleToDraft(saved)
    },
    onInvalid: errors => {
      const index = form.getValues('options').findIndex((_, index) => errors.options?.[index])
      if (index >= 0) setEditingId(form.getValues(`options.${index}.id`))
    },
  })
  const { append, remove, insert } = useFieldArray({ control: form.control, name: 'options' })
  const draft = useWatch({ control: form.control }) as SwitchRuleDraft
  const options = form.getValues('options')
  const [editingId, setEditingId] = useState(() => form.getValues('selectedOptionId'))
  const [deletedOption, setDeletedOption] = useState<DeletedOption | null>(null)
  useRenameRemap(form, mapping => setDeletedOption(current => current && { ...current, option: {
    ...current.option, name: renameTemplateReferences(current.option.name, mapping),
    headers: current.option.headers.map(header => ({ key: renameTemplateReferences(header.key, mapping), value: renameTemplateReferences(header.value, mapping) })),
  } }))
  const issues = useDraftIssues({ kind: 'switch-rule', value: draft })
  const optionNameInput = useRef<TemplateInputHandle>(null)
  const editingIndex = Math.max(0, options.findIndex(option => option.id === editingId))
  const editingOption = options[editingIndex]
  const saveState = { tone: error ? 'error' : 'success', message: error || success }
  const focusOption = () => requestAnimationFrame(() => optionNameInput.current?.focus())

  function addOption() {
    let number = options.length + 1
    while (options.some(option => displayText(option.name).trim().toLowerCase() === `option ${number}`)) number++
    const option = createSwitchRuleOption(`Option ${number}`)
    append(option)
    setEditingId(option.id)
    focusOption()
    clearStatus()
  }

  function deleteOption(optionId: string) {
    if (options.length < 2) return
    const index = options.findIndex(option => option.id === optionId)
    if (index < 0) return
    setDeletedOption({ option: structuredClone(options[index]), index, selectedOptionId: form.getValues('selectedOptionId') })
    const remaining = options.filter(option => option.id !== optionId)
    remove(index)
    if (form.getValues('selectedOptionId') === optionId) form.setValue('selectedOptionId', remaining[0].id)
    if (editingOption.id === optionId) { setEditingId(remaining[Math.min(index, remaining.length - 1)].id); focusOption() }
    clearStatus()
  }

  function undoDelete() {
    if (!deletedOption) return
    insert(deletedOption.index, deletedOption.option)
    form.setValue('selectedOptionId', deletedOption.selectedOptionId)
    setEditingId(deletedOption.option.id)
    setDeletedOption(null)
    focusOption()
    clearStatus()
  }

  return (
    <FormProvider {...form}>
      <section className="mx-auto max-w-[840px] animate-rise-in" aria-labelledby="editor-title">
        <RuleEditorHeader kind="switch" editing={!!switchRule} ruleName={switchRule ? displayText(switchRule.name) : undefined} busy={busy} onDelete={onDelete} unsaved={unsaved}
          onExport={() => { if (switchRule) downloadRules({ requestHeaderRules: [switchRule], networkRules: [] }, 'switch-rule') }} />
        <form ref={formRef} onSubmit={onSubmit} onChange={clearStatus}>
          <fieldset className="m-0 min-w-0 border-0 p-0" disabled={busy}>
            <div className="mb-5 rounded-lg border bg-card shadow-panel px-7 pt-[25px] mobile:px-[17px] mobile:pt-5">
              <div className="mb-6 flex items-center justify-between gap-[13px] mobile:flex-wrap mobile:gap-[9px] [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:tracking-[-0.2px]"><h2>Switch rule details</h2></div>
              <div className="mb-[22px] grid grid-cols-[1fr_1.35fr] gap-6 mobile:grid-cols-1 mobile:gap-[17px]">
                <div className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1"><span aria-hidden="true">Switch rule name</span>
                  <Controller control={form.control} name="name" render={({ field, fieldState }) => (
                    <TemplateInput value={field.value} onChange={value => { field.onChange(value); clearStatus() }} onBlur={field.onBlur} ref={field.ref} disabled={busy}
                      aria-label="Switch rule name" placeholder="e.g. Authenticated API" autoFocus invalid={fieldState.invalid || issues.byPath.has('name')} />
                  )} />
                  <FieldIssue message={issues.byPath.get('name')} />
                </div>
                <Controller control={form.control} name="url" render={({ field, fieldState }) => (
                  <WebsiteDomains ref={domainsRef} disabled={busy} value={field.value} onChange={field.onChange} onBlur={field.onBlur} onPendingChange={setPendingInput} inputRef={field.ref} error={fieldState.error?.message} issues={domainIssues(issues)} />
                )} />
              </div>
              <div className="flex items-center justify-between gap-5 border-t py-[17px]">
                <span className="text-[11px] font-semibold">Enabled</span>
                <Controller control={form.control} name="enabled" render={({ field }) => <ToggleSwitch checked={field.value} label="Switch rule enabled" onChange={enabled => { field.onChange(enabled); clearStatus() }} />} />
              </div>
            </div>
            <div className="mb-5 rounded-lg border bg-card shadow-panel px-7 pt-[25px] mobile:px-[17px] mobile:pt-5 pb-6 mobile:pb-5">
              <div className="mb-6 flex items-center justify-between gap-[13px] mobile:flex-wrap mobile:gap-[9px] [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:tracking-[-0.2px]">
                <h2>Options</h2>
                <Button variant="secondary" type="button" onClick={addOption}><Icon icon={Plus} data-icon="inline-start" />Add option</Button>
              </div>
              <div className="grid grid-cols-[164px_minmax(0,1fr)] gap-6 mobile:grid-cols-1 mobile:gap-5">
                <div className="flex min-w-0 flex-col gap-1.5 self-start border-r pr-4 mobile:flex-row mobile:flex-wrap mobile:border-r-0 mobile:border-b mobile:pr-0 mobile:pb-4" aria-label="Options to edit">
                  {options.map((option) => {
                    const broken = (issues.resolution.optionIssues[option.id]?.length ?? 0) > 0
                    return <div data-selected={option.id === editingOption.id} className="group flex min-w-0 items-center rounded-md border border-transparent hover:bg-accent data-[selected=true]:border-input data-[selected=true]:bg-selection" key={option.id}>
                      <Button variant="option" size="option" className="flex-1 shrink justify-start" type="button" aria-pressed={option.id === editingOption.id} onClick={() => setEditingId(option.id)}>
                        {broken && <Icon icon={TriangleAlert} size={12} className="shrink-0 text-destructive" />}
                        {displayText(option.name).trim() ? <TemplateTextView value={option.name} className="truncate" /> : 'Untitled'}
                        {broken && <span className="sr-only"> (variable problem)</span>}
                      </Button>
                      {options.length > 1 && (
                        <Button variant="destructive-ghost" size="icon-sm" className="invisible mr-[3px] group-hover:visible group-focus-within:visible group-data-[selected=true]:visible"
                          type="button"
                          aria-label={`Delete option ${displayText(option.name) || 'Untitled'}`}
                          onClick={() => deleteOption(option.id)}
                        ><Icon icon={Trash2} /></Button>
                      )}
                    </div>
                  })}
                </div>
                <SwitchRuleOptionEditor key={`${editingOption.id}-${editingIndex}`} index={editingIndex} nameRef={optionNameInput} onEdit={clearStatus} issues={issues} disabled={busy} />
              </div>
              {deletedOption && <div className="mt-[18px] flex items-center gap-3 border-t pt-4 text-xs text-muted-foreground" role="status"><span>{displayText(deletedOption.option.name)} deleted</span><Button variant="link" size="inline" type="button" onClick={undoDelete}>Undo</Button></div>}
            </div>
            <VariableStatus show={issues.blocking} />
            {saveState.message && <p className={`mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs [&_svg]:size-4 ${saveState.tone === 'error' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-input bg-secondary text-secondary-foreground'}`} role={saveState.tone === 'error' ? 'alert' : 'status'}>{saveState.message}</p>}
            <div className="mt-[25px] mb-10 flex items-center gap-2">
              <Button asChild variant="ghost" size="default" className="ml-auto"><a href="#/switch-rules">Cancel</a></Button>
              <Button variant="default" type="submit">Save</Button>
            </div>
          </fieldset>
        </form>
      </section>
    </FormProvider>
  )
}

function SwitchRuleOptionEditor({ index: optionIndex, nameRef, onEdit, issues, disabled }: {
  index: number; nameRef: RefObject<TemplateInputHandle | null>; onEdit: () => void; issues: DraftIssues; disabled: boolean
}) {
  const { control } = useFormContext<SwitchRuleDraft>()
  const { fields, append, remove } = useFieldArray({ control, name: `options.${optionIndex}.headers` })
  const issue = (path: string) => issues.byPath.get(`options.${optionIndex}.${path}`)
  return (
    <div className="min-w-0">
      <div className="mb-5 grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1"><span aria-hidden="true">Option name</span>
        <Controller control={control} name={`options.${optionIndex}.name`} render={({ field, fieldState }) => (
          <TemplateInput value={field.value} onChange={value => { field.onChange(value); onEdit() }} onBlur={field.onBlur} disabled={disabled}
            ref={element => { field.ref(element); nameRef.current = element }} aria-label="Option name" invalid={fieldState.invalid || !!issue('name')} />
        )} />
        <FieldIssue message={issue('name')} />
      </div>
      <div className="min-w-0">
        {fields.map((header, index) => (
          <div className={cn("mb-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_26px] items-center gap-x-3 gap-y-2 mobile:grid-cols-[1fr_26px] mobile:gap-y-3 mobile:border-b mobile:pb-5 mobile:last:border-b-0 mobile:last:pb-0", index === 0 && headerRowLayout.labelledRow)} key={header.id}>
            {(['key', 'value'] as const).map(part => (
              <div key={part} className={cn("grid min-w-0 content-start gap-2 text-[11px] font-semibold", part === 'key' ? 'col-start-1' : 'col-start-2 mobile:col-start-1', index === 0 && headerRowLayout.labelledField)}>
                {index === 0 && <span aria-hidden="true">{part === 'key' ? 'Header' : 'Value'}</span>}
                <Controller control={control} name={`options.${optionIndex}.headers.${index}.${part}`} render={({ field, fieldState }) => (
                  <TemplateInput className="font-sans" value={field.value} onChange={value => { field.onChange(value); onEdit() }} onBlur={field.onBlur} ref={field.ref} disabled={disabled}
                    placeholder={part === 'key' ? 'e.g. Authorization' : 'e.g. Bearer token'} aria-label={`Header ${index + 1} ${part === 'key' ? 'name' : 'value'}`}
                    invalid={fieldState.invalid || !!issue(`headers.${index}.${part}`)} />
                )} />
                <FieldIssue message={issue(`headers.${index}.${part}`)} />
              </div>
            ))}
            <Button variant="ghost-muted" size="icon-field" className={cn("col-start-3", headerRowLayout.action, index === 0 && headerRowLayout.labelledControl)} type="button" aria-label={`Remove header ${index + 1}`} onClick={() => { remove(index); onEdit() }}><Icon icon={X} /></Button>
          </div>
        ))}
      </div>
      <Button variant="secondary" type="button" onClick={() => { append(createHeaderPair()); onEdit() }}><Icon icon={Plus} data-icon="inline-start" />Add header</Button>
    </div>
  )
}
