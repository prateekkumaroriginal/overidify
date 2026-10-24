import { Plus, Trash2, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Controller, FormProvider, useFieldArray, useFormContext, useWatch } from 'react-hook-form'
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

type SwitchRuleEditorProps = {
  switchRule?: SwitchRule
  pending: boolean
  onSave: (draft: SwitchRuleDraft) => Promise<SwitchRule>
  onDelete?: () => void
}

type DeletedOption = { option: SwitchRuleOption; index: number; selectedOptionId: string }

export function SwitchRuleEditor({ switchRule, pending, onSave, onDelete }: SwitchRuleEditorProps) {
  const { form, formRef, onSubmit, busy, error, success, clearStatus } = useEditorForm({
    schema: SwitchRuleDraftSchema, initial: () => switchRule ? switchRuleToDraft(switchRule) : createSwitchRuleDraft(),
    pending, returnRoute: '/switch-rules', successMessage: 'Switch rule saved.',
    onSave: async draft => { const saved = await onSave(draft); setDeletedOption(null); return switchRuleToDraft(saved) },
    onInvalid: errors => {
      const index = form.getValues('options').findIndex((_, index) => errors.options?.[index])
      if (index >= 0) setEditingId(form.getValues(`options.${index}.id`))
    },
  })
  const { append, remove, insert } = useFieldArray({ control: form.control, name: 'options' })
  useWatch({ control: form.control, name: 'options' })
  const options = form.getValues('options')
  const [editingId, setEditingId] = useState(() => form.getValues('selectedOptionId'))
  const [deletedOption, setDeletedOption] = useState<DeletedOption | null>(null)
  const optionNameInput = useRef<HTMLInputElement>(null)
  const editingIndex = Math.max(0, options.findIndex(option => option.id === editingId))
  const editingOption = options[editingIndex]
  const saveState = { tone: error ? 'error' : 'success', message: error || success }
  const focusOption = () => requestAnimationFrame(() => optionNameInput.current?.focus())

  function addOption() {
    let number = options.length + 1
    while (options.some(option => option.name.trim().toLowerCase() === `option ${number}`)) number++
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
        <RuleEditorHeader kind="switch" editing={!!switchRule} ruleName={switchRule?.name} busy={busy} onDelete={onDelete} unsaved={form.formState.isDirty}
          onExport={() => { if (switchRule) downloadRules({ requestHeaderRules: [switchRule], networkRules: [] }, 'switch-rule') }} />
        <form ref={formRef} onSubmit={onSubmit} onChange={clearStatus}>
          <fieldset className="m-0 min-w-0 border-0 p-0" disabled={busy}>
            <div className="mb-5 rounded-lg border bg-card shadow-panel px-7 pt-[25px] mobile:px-[17px] mobile:pt-5">
              <div className="mb-6 flex items-center justify-between gap-[13px] mobile:flex-wrap mobile:gap-[9px] [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:tracking-[-0.2px]"><h2>Switch rule details</h2></div>
              <div className="mb-[22px] grid grid-cols-[1fr_1.35fr] gap-6 mobile:grid-cols-1 mobile:gap-[17px]">
                <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">Switch rule name
                  <Input {...form.register('name')} placeholder="e.g. Authenticated API" autoFocus required />
                </label>
                <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">Domain
                  <Input className="font-sans text-[11px]" {...form.register('url')} placeholder="e.g. localhost:4200 or api.example.com" aria-label="Domain" required />
                </label>
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
                  {options.map((option) => (
                    <div data-selected={option.id === editingOption.id} className="group flex min-w-0 items-center rounded-md border border-transparent hover:bg-accent data-[selected=true]:border-input data-[selected=true]:bg-selection" key={option.id}>
                      <Button variant="option" size="option" className="flex-1 shrink justify-start" type="button" aria-pressed={option.id === editingOption.id} onClick={() => setEditingId(option.id)}>
                        {option.name || 'Untitled'}
                      </Button>
                      {options.length > 1 && (
                        <Button variant="destructive-ghost" size="icon-sm" className="invisible mr-[3px] group-hover:visible group-focus-within:visible group-data-[selected=true]:visible"
                          type="button"
                          aria-label={`Delete option ${option.name || 'Untitled'}`}
                          title="Delete option"
                          onClick={() => deleteOption(option.id)}
                        ><Icon icon={Trash2} /></Button>
                      )}
                    </div>
                  ))}
                </div>
                <SwitchRuleOptionEditor key={`${editingOption.id}-${editingIndex}`} index={editingIndex} nameRef={optionNameInput} onEdit={clearStatus} />
              </div>
              {deletedOption && <div className="mt-[18px] flex items-center gap-3 border-t pt-4 text-xs text-muted-foreground" role="status"><span>{deletedOption.option.name} deleted</span><Button variant="link" size="inline" type="button" onClick={undoDelete}>Undo</Button></div>}
            </div>
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

function SwitchRuleOptionEditor({ index: optionIndex, nameRef, onEdit }: {
  index: number; nameRef: RefObject<HTMLInputElement | null>; onEdit: () => void
}) {
  const { register, control } = useFormContext<SwitchRuleDraft>()
  const { fields, append, remove } = useFieldArray({ control, name: `options.${optionIndex}.headers` })
  const name = register(`options.${optionIndex}.name`, { onChange: onEdit })
  return (
    <div className="min-w-0">
      <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1 mb-5">Option name
        <Input {...name} ref={element => { name.ref(element); nameRef.current = element }} />
      </label>
      <div className="min-w-0">
        {fields.map((header, index) => (
          <div className={cn("mb-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_26px] items-center gap-x-3 gap-y-2 mobile:grid-cols-[1fr_26px] mobile:gap-y-3 mobile:border-b mobile:pb-5 mobile:last:border-b-0 mobile:last:pb-0", index === 0 && headerRowLayout.labelledRow)} key={header.id}>
            <label className={cn("col-start-1 grid min-w-0 content-start gap-2 text-[11px] font-semibold", index === 0 && headerRowLayout.labelledField)}>{index === 0 && 'Header'}
              <Input className="font-sans text-[11px]" {...register(`options.${optionIndex}.headers.${index}.key`, { onChange: onEdit })} placeholder="e.g. Authorization" aria-label={`Header ${index + 1} name`} />
            </label>
            <label className={cn("col-start-2 grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1", index === 0 && headerRowLayout.labelledField)}>{index === 0 && 'Value'}
              <Input className="font-sans text-[11px]" {...register(`options.${optionIndex}.headers.${index}.value`, { onChange: onEdit })} placeholder="e.g. Bearer token" aria-label={`Header ${index + 1} value`} />
            </label>
            <Button variant="ghost-muted" size="icon-sm" className={cn("col-start-3", headerRowLayout.action, index === 0 && headerRowLayout.labelledControl)} type="button" aria-label={`Remove header ${index + 1}`} onClick={() => { remove(index); onEdit() }}><Icon icon={X} /></Button>
          </div>
        ))}
      </div>
      <Button variant="secondary" type="button" onClick={() => { append(createHeaderPair()); onEdit() }}><Icon icon={Plus} data-icon="inline-start" />Add header</Button>
    </div>
  )
}
