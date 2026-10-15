import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Controller, FormProvider, useFieldArray, useFormContext, useWatch } from 'react-hook-form'
import { SwitcherDraftSchema } from '../lib/header-schemas'
import {
  createHeaderPair,
  createSwitcherDraft,
  createSwitcherOption,
  switcherToDraft,
} from '../lib/rules'
import type { HeaderSwitcher, SwitcherDraft, SwitcherOption } from '../lib/types'
import { Icon } from './Icon'
import { ToggleSwitch } from './ToggleSwitch'
import { useEditorForm } from './useEditorForm'

type SwitchRuleEditorProps = {
  switcher?: HeaderSwitcher
  pending: boolean
  onSave: (draft: SwitcherDraft) => Promise<HeaderSwitcher>
  onDelete?: () => void
}

type DeletedOption = { option: SwitcherOption; index: number; selectedOptionId: string }

export function SwitchRuleEditor({ switcher, pending, onSave, onDelete }: SwitchRuleEditorProps) {
  const { form, formRef, onSubmit, busy, error, success, clearStatus } = useEditorForm({
    schema: SwitcherDraftSchema, initial: () => switcher ? switcherToDraft(switcher) : createSwitcherDraft(),
    pending, returnRoute: '/switchers', successMessage: 'Switch rule saved.',
    onSave: async draft => { const saved = await onSave(draft); setDeletedOption(null); return switcherToDraft(saved) },
    onInvalid: errors => {
      const index = form.getValues('options').findIndex((_, index) => errors.options?.[index])
      if (index >= 0) setEditingId(form.getValues(`options.${index}.id`))
    },
  })
  const { append, remove, insert } = useFieldArray({ control: form.control, name: 'options' })
  useWatch({ control: form.control, name: 'options' })
  // Field-array operations notify watchers after rendering. Read the current
  // values so a new editing ID never falls back to another option meanwhile.
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
    const option = createSwitcherOption(`Option ${number}`)
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
        <a className="inline-flex items-center gap-2 text-[11px] text-muted-foreground no-underline hover:text-primary [&_svg]:w-[15px]" href="#/switchers"><Icon name="back" /> Back to switch rules</a>
        <div className="mt-[27px] mb-[30px] mobile:mt-5 [&_h1]:text-xl [&_h1]:leading-[1.4] [&_h1]:font-semibold"><h1 id="editor-title">{switcher ? 'Edit switch rule' : 'New switch rule'}</h1></div>
        <form ref={formRef} onSubmit={onSubmit} onChange={clearStatus}>
          <fieldset className="m-0 min-w-0 border-0 p-0" disabled={busy}>
            <div className="mb-5 rounded-lg border bg-card shadow-panel px-7 pt-[25px] mobile:px-[17px] mobile:pt-5">
              <div className="mb-6 flex items-center justify-between gap-[13px] mobile:flex-wrap mobile:gap-[9px] [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:tracking-[-0.2px]"><h2>Switch rule details</h2></div>
              <div className="mb-[22px] grid grid-cols-[1fr_1.35fr] gap-6 mobile:grid-cols-1 mobile:gap-[17px]">
                <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">Switch rule name
                  <Input {...form.register('name')} placeholder="e.g. Authenticated API" autoFocus required />
                </label>
                <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">Domain
                  <Input className="font-mono text-[11px]" {...form.register('url')} placeholder="e.g. localhost:4200 or api.example.com" aria-label="Domain" aria-describedby="switcher-domain-help" required />
                  <span id="switcher-domain-help" className="font-normal text-muted-foreground">Matches the page's domain on every path. Applies to requests made from that page, including other API hosts. Include a port to match only that port.</span>
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
                <Button variant="secondary" type="button" onClick={addOption}><Icon name="plus" />Add option</Button>
              </div>
              <div className="grid grid-cols-[164px_minmax(0,1fr)] gap-6 mobile:grid-cols-1 mobile:gap-5">
                <div className="flex min-w-0 flex-col gap-1.5 self-start border-r pr-4 mobile:flex-row mobile:flex-wrap mobile:border-r-0 mobile:border-b mobile:pr-0 mobile:pb-4" aria-label="Options to edit">
                  {options.map((option) => (
                    <div data-selected={option.id === editingOption.id} className="group flex min-w-0 items-center rounded-md border border-transparent hover:bg-accent data-[selected=true]:border-input data-[selected=true]:bg-selection" key={option.id}>
                      <Button variant="ghost" className="h-auto min-w-0 flex-1 shrink justify-start p-2.5 text-left rounded-none text-xs text-muted-foreground whitespace-normal wrap-anywhere group-data-[selected=true]:text-primary hover:bg-transparent" type="button" aria-pressed={option.id === editingOption.id} onClick={() => setEditingId(option.id)}>
                        {option.name || 'Untitled'}
                      </Button>
                      {options.length > 1 && (
                        <Button variant="ghost" className="invisible mr-[3px] size-[26px] text-muted-foreground group-hover:visible group-focus-within:visible group-data-[selected=true]:visible hover:bg-destructive/10 hover:text-destructive [&_svg]:size-[15px]"
                          type="button"
                          aria-label={`Delete option ${option.name || 'Untitled'}`}
                          title="Delete option"
                          onClick={() => deleteOption(option.id)}
                        ><Icon name="trash" /></Button>
                      )}
                    </div>
                  ))}
                </div>
                <SwitcherOptionEditor key={`${editingOption.id}-${editingIndex}`} index={editingIndex} nameRef={optionNameInput} onEdit={clearStatus} />
              </div>
              {deletedOption && <div className="mt-[18px] flex items-center gap-3 border-t pt-4 text-xs text-muted-foreground" role="status"><span>{deletedOption.option.name} deleted</span><Button variant="link" className="min-h-0 min-w-0 rounded-none px-1.5 py-[1px] text-xs underline" type="button" onClick={undoDelete}>Undo</Button></div>}
            </div>
            {saveState.message && <p className={`mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs [&_svg]:size-4 ${saveState.tone === 'error' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-input bg-secondary text-secondary-foreground'}`} role={saveState.tone === 'error' ? 'alert' : 'status'}>{saveState.message}</p>}
            <div className="mt-[25px] mb-10 flex items-center gap-[23px] mobile:gap-[17px]">
              {onDelete && <Button variant="ghost" type="button" className="h-auto px-0 py-[9px] rounded-none text-[11px] text-muted-foreground hover:bg-transparent hover:text-destructive" onClick={onDelete}>Delete switch rule</Button>}
              <a className="ml-auto text-[11px] text-muted-foreground no-underline hover:text-foreground" href="#/switchers">Cancel</a>
              <Button variant="default" className="mobile:px-3 mobile:text-xs" type="submit">Save</Button>
            </div>
          </fieldset>
        </form>
      </section>
    </FormProvider>
  )
}

function SwitcherOptionEditor({ index: optionIndex, nameRef, onEdit }: {
  index: number; nameRef: RefObject<HTMLInputElement | null>; onEdit: () => void
}) {
  const { register, control } = useFormContext<SwitcherDraft>()
  const { fields, append, remove } = useFieldArray({ control, name: `options.${optionIndex}.headers` })
  const name = register(`options.${optionIndex}.name`, { onChange: onEdit })
  return (
    <div className="min-w-0">
      <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1 mb-5">Option name
        <Input {...name} ref={element => { name.ref(element); nameRef.current = element }} />
      </label>
      <div className="min-w-0">
        {fields.map((header, index) => (
          <div className="mb-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_26px] items-end gap-3 mobile:grid-cols-[1fr_26px] mobile:items-center mobile:border-b mobile:pb-5 mobile:last:border-b-0 mobile:last:pb-0" key={header.id}>
            <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">{index === 0 && 'Header'}
              <Input className="font-mono text-[11px]" {...register(`options.${optionIndex}.headers.${index}.key`, { onChange: onEdit })} placeholder="e.g. Authorization" aria-label={`Header ${index + 1} name`} />
            </label>
            <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">{index === 0 && 'Value'}
              <Input className="font-mono text-[11px]" {...register(`options.${optionIndex}.headers.${index}.value`, { onChange: onEdit })} placeholder="e.g. Bearer token" aria-label={`Header ${index + 1} value`} />
            </label>
            <Button variant="ghost" className="mb-[7px] size-[26px] text-muted-foreground [&_svg]:size-[15px] mobile:col-start-2 mobile:row-span-2 mobile:row-start-1 mobile:mb-0" type="button" aria-label={`Remove header ${index + 1}`} onClick={() => { remove(index); onEdit() }}><Icon name="close" /></Button>
          </div>
        ))}
      </div>
      <Button variant="secondary" type="button" onClick={() => { append(createHeaderPair()); onEdit() }}><Icon name="plus" />Add header</Button>
    </div>
  )
}
