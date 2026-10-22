import { useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { downloadRules } from '../lib/rule-download'
import { ruleType } from '../lib/rule-transfer'
import type { RuleCollection, TransferRule } from '../lib/rule-transfer'
import { activateImportedRules, persistRuleDeletion, duplicateSavedRule, getSavedRules } from '../lib/rule-transfer-storage'
import type { TransferActivation } from '../lib/rule-transfer-storage'
import type { RuleRowActionHandlers } from './RuleRowActions'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog'

function openRule(rule: TransferRule) {
  const type = ruleType(rule)
  window.location.hash = `/${type === 'network-rule' ? 'network-rules' : type === 'switch-rule' ? 'switch-rules' : 'header-rules'}/${encodeURIComponent(rule.id)}`
}

export function useRuleActions(pending: boolean, requestHeaderRules: RuleCollection['requestHeaderRules'], networkRules: RuleCollection['networkRules']) {
  const [busy, setBusy] = useState(false)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<TransferRule | null>(null)
  const submitting = useRef(false)
  const exporting = useRef(false)
  const retries = useRef(new Set<string>())
  const deleteTrigger = useRef<HTMLElement | null>(null)
  const scroll = useRef<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    if (scroll.current) {
      window.scrollTo(scroll.current.x, scroll.current.y)
      scroll.current = null
    }
  }, [requestHeaderRules, networkRules])

  function showSavedResult(id: string, message: string, result: TransferActivation, copy?: TransferRule) {
    const edit = copy ? { label: 'Edit', onClick: () => openRule(copy) } : undefined
    const description = result.reloadTabIds.length ? 'Reload matching website tabs to apply the latest rules.' : undefined
    if (result.ok) {
      toast.success(message, { id, description, duration: description ? Infinity : 4000, action: edit, cancel: undefined })
    } else {
      toast.warning(`${message}; activation not confirmed`, {
        id, duration: Infinity, description: [result.error, description, 'The change is saved. Retrying activation will not repeat it.'].filter(Boolean).join(' '),
        cancel: edit,
        action: { label: 'Retry activation', onClick: event => {
          event.preventDefault()
          if (retries.current.has(id)) return
          retries.current.add(id)
          toast.loading('Retrying activation...', { id, description: undefined, action: undefined, cancel: undefined })
          void activateImportedRules().then(next => showSavedResult(id, message, next, copy)).finally(() => retries.current.delete(id))
        } },
      })
    }
  }

  const actions: RuleRowActionHandlers = {
    busy: pending || busy,
    exportingId,
    onDuplicate: rule => {
      if (pending || submitting.current) return
      submitting.current = true
      setBusy(true)
      scroll.current = { x: window.scrollX, y: window.scrollY }
      void duplicateSavedRule(rule.id).then(result => {
        showSavedResult(`duplicate-${result.copy.id}`, 'Rule duplicated', result.activation, result.copy)
      }).catch(reason => {
        scroll.current = null
        toast.error('Could not duplicate rule', { description: `No copy was created. ${reason instanceof Error ? reason.message : 'Try again.'}` })
      }).finally(() => { submitting.current = false; setBusy(false) })
    },
    onExport: rule => {
      if (exporting.current) return
      exporting.current = true
      setExportingId(rule.id)
      void getSavedRules().then(saved => {
        const requestHeaderRules = saved.requestHeaderRules.filter(entry => entry.id === rule.id)
        const networkRules = saved.networkRules.filter(entry => entry.id === rule.id)
        if (!requestHeaderRules.length && !networkRules.length) throw new Error('This rule no longer exists.')
        downloadRules({ requestHeaderRules, networkRules }, ruleType(rule))
      }).catch(reason => toast.error('Export failed', { description: reason instanceof Error ? reason.message : 'Could not read this saved rule. Try again.' }))
        .finally(() => { exporting.current = false; setExportingId(null) })
    },
    onDelete: rule => {
      if (pending || submitting.current) return
      submitting.current = true
      deleteTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      void getSavedRules().then(saved => {
        const current = [...saved.requestHeaderRules, ...saved.networkRules].find(entry => entry.id === rule.id)
        if (!current) throw new Error('This rule no longer exists.')
        setDeleting(current)
      }).catch(reason => toast.error('Could not open deletion', { description: reason instanceof Error ? reason.message : 'Try again.' }))
        .finally(() => { submitting.current = false })
    },
  }

  async function confirmDelete() {
    if (!deleting || pending || submitting.current) return
    submitting.current = true
    setBusy(true)
    try {
      const result = await persistRuleDeletion(new Set([deleting.id]))
      setDeleting(null)
      const activation = result.deletedCount ? await activateImportedRules() : { ok: true, reloadTabIds: [] }
      showSavedResult(`delete-${deleting.id}`, result.deletedCount ? 'Rule deleted' : 'Rule already deleted', activation)
    } catch (reason) {
      toast.error('Could not delete rule', { description: reason instanceof Error ? reason.message : 'Try again.' })
    } finally { submitting.current = false; setBusy(false) }
  }

  const dialog = <AlertDialog open={deleting !== null} onOpenChange={open => { if (!open && !submitting.current) setDeleting(null) }}>
    <AlertDialogContent onKeyDown={event => event.stopPropagation()}
      onCloseAutoFocus={event => {
        event.preventDefault()
        if (deleteTrigger.current?.isConnected) deleteTrigger.current.focus({ preventScroll: true })
        else document.querySelector<HTMLElement>('.rule-row a')?.focus({ preventScroll: true })
      }}
      className="max-h-[calc(100dvh_-_2rem)] overflow-y-auto data-[size=default]:sm:max-w-md">
      <AlertDialogHeader>
        <AlertDialogTitle>Delete rule?</AlertDialogTitle>
        <AlertDialogDescription className="wrap-anywhere">&quot;{deleting?.name}&quot; will be permanently deleted. This action cannot be undone.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={pending || busy} onClick={event => { event.preventDefault(); void confirmDelete() }}>{busy ? 'Deleting...' : 'Delete'}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  return { actions, dialog }
}
