import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { NetworkRuleEditor } from '../components/NetworkRuleEditor'
import { getCapturedNetworkRuleDraft } from '../lib/network-rule-drafts'
import type { NetworkRuleDraft } from '../lib/network-rules'

export function CapturedNetworkRuleEditor({ draftId, pending, onSave }: {
  draftId: string
  pending: boolean
  onSave: (draft: NetworkRuleDraft) => Promise<void>
}) {
  const [draft, setDraft] = useState<NetworkRuleDraft | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    void getCapturedNetworkRuleDraft(draftId)
      .then(value => { if (alive) setDraft(value) })
      .catch(() => { if (alive) setError('Could not load this captured response. Return to DevTools and create the rule again.') })
    return () => { alive = false }
  }, [draftId])

  if (error) return <div className="flex flex-col items-start gap-4">
    <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
    <Button asChild variant="outline"><a href="#/network-rules">Network Rules</a></Button>
  </div>
  if (!draft) return <p className="text-xs text-muted-foreground" role="status">Loading captured response...</p>
  return <NetworkRuleEditor initialDraft={draft} pending={pending} onSave={onSave} />
}
