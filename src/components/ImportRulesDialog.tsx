import { useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Button } from './ui/button'
import { Icon } from './Icon'
import { applyImport, reviewImport } from '../lib/rule-transfer'
import type { ImportAction, ImportReview, RuleCollection } from '../lib/rule-transfer'
import { activateImportedRules, getSavedRules, saveImportedRules } from '../lib/rule-transfer-storage'
import type { TransferActivation } from '../lib/rule-transfer-storage'

export function ImportRulesDialog({ onSaved, onSuccess }: {
  onSaved: (rules: RuleCollection) => void
  onSuccess: (count: number, reloadTabIds: number[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [review, setReview] = useState<ImportReview | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [activation, setActivation] = useState<TransferActivation | null>(null)
  const submitting = useRef(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const count = review ? review.rules.requestHeaderRules.length + review.rules.networkRules.length : 0

  async function chooseFile(file?: File) {
    if (!file) return
    setOpen(true)
    setReview(null); setActivation(null); setError(''); setFileName(file.name)
    setBusy(true)
    try {
      const [text, existing] = await Promise.all([file.text(), getSavedRules()])
      setReview(reviewImport(text, existing))
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not read the file.') }
    finally { setBusy(false) }
  }

  async function run(action?: ImportAction) {
    if (submitting.current || (!review && action)) return
    submitting.current = true; setBusy(true); setError('')
    try {
      let result: TransferActivation
      if (action && review) {
        const rules = applyImport(await getSavedRules(), review, action)
        result = await saveImportedRules(rules)
        onSaved(rules)
      } else result = await activateImportedRules()
      if (result.ok) { setOpen(false); onSuccess(count, result.reloadTabIds) }
      else setActivation(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the import. Try again.')
    } finally { submitting.current = false; setBusy(false) }
  }

  return <>
    <Button ref={trigger} variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}><Icon icon={Download} data-icon="inline-start" />Import</Button>
    <input ref={fileInput} hidden type="file" accept=".json,application/json" aria-label="Import file" disabled={busy}
      onChange={event => { void chooseFile(event.target.files?.[0]); event.target.value = '' }} />
    <Dialog open={open} onOpenChange={next => { if (!next && !busy) setOpen(false) }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto" aria-describedby={undefined} showCloseButton={!busy && !activation}
        onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus() }}>
        <DialogHeader><DialogTitle>Import rules</DialogTitle></DialogHeader>
        {!activation && <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>Choose file</Button>
          <span className="min-w-0 break-all text-sm text-muted-foreground">{fileName}</span>
        </div>}
        {error && <Alert variant="destructive"><AlertTitle>Import could not finish</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {review && !activation && <>
          {(count > 0 || review.issues.length > 0 || review.overlaps.length > 0) && <div className="grid gap-1 text-sm" role="status">
            {count > 0 && <p>{count} valid</p>}
            {review.issues.length > 0 && <p>{review.issues.length} invalid</p>}
            {review.overlaps.length > 0 && <p>{review.overlaps.length} overlap{review.overlaps.length === 1 ? '' : 's'}</p>}
          </div>}
          {review.overlaps.length > 0 && <div><h3 className="mb-2 font-medium">Already present</h3><ul className="list-disc pl-5 text-sm">{review.overlaps.map(rule => <li key={rule.id} className="break-words">{rule.name} · {'kind' in rule ? rule.kind === 'header-rule' ? 'Header Rule' : 'Switch Rule' : 'Network Rule'}</li>)}</ul></div>}
          {review.issues.length > 0 && <Alert variant="destructive"><AlertTitle>Some rules cannot be imported</AlertTitle><AlertDescription><ul className="list-disc pl-5">{review.issues.map((issue, index) => <li key={index} className="break-words">{issue.name}: {issue.message}</li>)}</ul>{count > 0 ? <p>Import only the valid rules below, or cancel.</p> : <p>No valid rules remain. Choose another file.</p>}</AlertDescription></Alert>}
        </>}
        {activation && <Alert><AlertTitle>Rules saved; activation not confirmed</AlertTitle><AlertDescription>
          <p>{activation.error}</p>
          {activation.reloadTabIds.length > 0 && <p>Reload matching website tabs to activate the latest rules.</p>}
          <p>Retry activation or reload the extension and matching websites. Your saved import will not be added again.</p>
        </AlertDescription></Alert>}
        <DialogFooter>
          <Button variant="ghost" size="default" disabled={busy} onClick={() => setOpen(false)}>{activation ? 'Close' : 'Cancel'}</Button>
          {activation ? <Button disabled={busy} onClick={() => { void run() }}>{busy ? 'Applying…' : 'Retry activation'}</Button>
            : review && (review.overlaps.length ? <>
              <Button disabled={busy || !count} onClick={() => { void run('replace') }}>{review.issues.length ? 'Replace with valid rules' : 'Replace'}</Button>
              <Button disabled={busy || !count} onClick={() => { void run('add') }}>{review.issues.length ? 'Add valid rules' : 'Add'}</Button>
            </> : <Button disabled={busy || !count} onClick={() => { void run('add') }}>{busy ? 'Importing…' : review.issues.length && count > 0 ? `Import ${count} valid rule${count === 1 ? '' : 's'}` : 'Import'}</Button>)}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
