import { useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Button } from './ui/button'
import { applyImport, reviewImport } from '../lib/rule-transfer'
import type { ImportAction, ImportReview, RuleCollection } from '../lib/rule-transfer'
import { activateImportedRules, getSavedRules, saveImportedRules } from '../lib/rule-transfer-storage'
import type { TransferActivation } from '../lib/rule-transfer-storage'

export function ImportRulesDialog({ open, onClose, onSaved }: {
  open: boolean; onClose: () => void
  onSaved: (rules: RuleCollection) => void
}) {
  const [review, setReview] = useState<ImportReview | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [activation, setActivation] = useState<TransferActivation | null>(null)
  const submitting = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const count = review ? review.rules.requestHeaderRules.length + review.rules.networkRules.length : 0
  const enabled = review ? [...review.rules.requestHeaderRules, ...review.rules.networkRules].filter(rule => rule.enabled).length : 0

  async function chooseFile(file?: File) {
    if (!file) return
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
      if (action && review) {
        const rules = applyImport(await getSavedRules(), review, action)
        const result = await saveImportedRules(rules)
        onSaved(rules)
        setActivation(result)
      } else setActivation(await activateImportedRules())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the import. Try again.')
    } finally { submitting.current = false; setBusy(false) }
  }

  return <Dialog open={open} onOpenChange={next => { if (!next && !busy) onClose() }}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto" showCloseButton={!busy && !activation}>
      <DialogHeader><DialogTitle>Import rules</DialogTitle><DialogDescription>Choose an Overidify JSON file, then review its rules before importing.</DialogDescription></DialogHeader>
      {!activation && <div className="flex flex-wrap items-center gap-3">
        <input ref={fileInput} className="sr-only" type="file" accept=".json,application/json" aria-label="Import file" disabled={busy}
          onChange={event => { void chooseFile(event.target.files?.[0]); event.target.value = '' }} />
        <Button variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>Choose file</Button>
        <span className="min-w-0 break-all text-sm text-muted-foreground">{fileName || 'No file chosen'}</span>
      </div>}
      {error && <Alert variant="destructive"><AlertTitle>Import could not finish</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {review && !activation && <>
        <p className="text-sm" role="status">{count} valid · {review.issues.length} invalid · {review.overlaps.length} overlap{review.overlaps.length === 1 ? '' : 's'}</p>
        <p className="text-sm text-muted-foreground">{enabled} enabled rules will keep their saved state. New rules are appended; later enabled rules can take priority.</p>
        {review.overlaps.length > 0 && <div><h3 className="mb-2 font-medium">Already present</h3><ul className="list-disc pl-5 text-sm">{review.overlaps.map(rule => <li key={rule.id} className="break-words">{rule.name} · {'kind' in rule ? rule.kind === 'header-rule' ? 'Header Rule' : 'Switch Rule' : 'Network Rule'}</li>)}</ul><p className="mt-2 text-sm text-muted-foreground">Replace updates overlapping rules. Add keeps both as separate rules. Other existing rules are kept.</p></div>}
        {review.issues.length > 0 && <Alert variant="destructive"><AlertTitle>Some rules cannot be imported</AlertTitle><AlertDescription><ul className="list-disc pl-5">{review.issues.map((issue, index) => <li key={index} className="break-words">{issue.name}: {issue.message}</li>)}</ul>{count > 0 ? <p>Import only the valid rules below, or cancel.</p> : <p>No valid rules remain. Choose another file.</p>}</AlertDescription></Alert>}
      </>}
      {activation && <Alert><AlertTitle>{activation.ok ? 'Rules imported' : 'Rules saved; activation not confirmed'}</AlertTitle><AlertDescription>
        <p>{activation.ok ? `${count} rules were saved.` : activation.error}</p>
        {activation.reloadTabIds.length > 0 && <p>Reload matching website tabs to activate the latest rules.</p>}
        {!activation.ok && <p>Retry activation or reload the extension and matching websites. Your saved import will not be added again.</p>}
      </AlertDescription></Alert>}
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={onClose}>{activation ? 'Close' : 'Cancel'}</Button>
        {activation ? !activation.ok && <Button disabled={busy} onClick={() => { void run() }}>{busy ? 'Applying…' : 'Retry activation'}</Button>
          : review && (review.overlaps.length ? <>
            <Button disabled={busy || !count} onClick={() => { void run('replace') }}>{review.issues.length ? 'Replace with valid rules' : 'Replace'}</Button>
            <Button disabled={busy || !count} onClick={() => { void run('add') }}>{review.issues.length ? 'Add valid rules' : 'Add'}</Button>
          </> : <Button disabled={busy || !count} onClick={() => { void run('add') }}>{busy ? 'Importing…' : review.issues.length ? `Import ${count} valid rule${count === 1 ? '' : 's'}` : 'Import'}</Button>)}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
