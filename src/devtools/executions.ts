import { createExecutionHistory, createHeaderMatchReader, HIDDEN_FROM_VARIABLE } from '../lib/execution-history'
import type { ObservedHeader } from '../lib/execution-history'
import { ExecutionRecordSchema, HeaderLedgerSchema } from '../lib/execution-schemas'
import type { HeaderOccurrence } from '../lib/execution-history'

export function observeExecutions(tabId: number) {
  const history = createExecutionHistory()
  const reader = createHeaderMatchReader(tabId, history, Date.now())
  let port: chrome.runtime.Port | undefined
  let disposed = false
  let reconnect: ReturnType<typeof setTimeout> | undefined
  let connectedOnce = false
  let generation = 0
  function state(clear = false) {
    if (clear) generation++
    try { port?.postMessage({ type: 'state', since: reader.since, paused: history.getSnapshot().paused, clear, generation }) }
    catch { history.notice('Execution capture is reconnecting. Some events may be missing.') }
  }
  function connect() {
    if (disposed) return
    port = chrome.runtime.connect({ name: 'overidify-executions' })
    port.onMessage.addListener(message => {
      if (disposed) return
      if (message?.type === 'ready') {
        if (connectedOnce) history.notice('Execution capture reconnected. Some events may be missing.')
        connectedOnce = true
        state()
      } else if (message?.type === 'network-execution') {
        const parsed = ExecutionRecordSchema.safeParse(message.record)
        if (parsed.success) history.add(parsed.data)
      } else if (message?.type === 'header-executions') {
        const ledger = HeaderLedgerSchema.safeParse({ next: 0, entries: message.installations })
        if (ledger.success && Array.isArray(message.matches)) {
          const matches = message.matches.filter((match: HeaderOccurrence) => Number.isFinite(match?.timeStamp) &&
            Number.isInteger(match?.rule?.ruleId) && typeof match?.rule?.rulesetId === 'string')
          reader.read(matches, ledger.data.entries)
          state()
        }
      } else if (message?.type === 'request-observation' && message.generation === generation && typeof message.observationId === 'string' && typeof message.method === 'string') {
        // The worker already removed values Overidify set from variables.
        const headers = Array.isArray(message.headers) ? message.headers.flatMap((header: { key?: unknown; value?: unknown }): ObservedHeader[] =>
          typeof header.key !== 'string' ? [] : typeof header.value === 'string' ? [{ key: header.key, value: header.value }]
            : header.value && typeof header.value === 'object' && (header.value as { hidden?: unknown }).hidden === 'variable' ? [{ key: header.key, value: HIDDEN_FROM_VARIABLE }] : []) : undefined
        const stage = message.stage === 'onBeforeSendHeaders' ? 'before' : 'after'
        history.observe({ id: message.observationId, method: message.method, [stage]: headers,
          ...(typeof message.url === 'string' ? { url: message.url } : {}),
          ...(typeof message.urlOmitted === 'string' ? { urlOmitted: message.urlOmitted } : {}),
          ...(typeof message.detailsHidden === 'string' ? { detailsHidden: message.detailsHidden } : {}),
          ...(Number.isInteger(message.hiddenHeaders) && message.hiddenHeaders > 0 ? { hiddenHeaders: message.hiddenHeaders } : {}) }, stage)
      } else if (message?.type === 'notice' && typeof message.message === 'string') history.notice(message.message)
    })
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError
      port = undefined
      if (!disposed) {
        history.notice('Execution capture disconnected. Reconnecting; some events may be missing.')
        reconnect = setTimeout(connect, 1000)
      }
    })
    port.postMessage({ type: 'subscribe', tabId, since: reader.since })
  }
  connect()
  // A live DevTools page owns the history. Traffic on the port keeps routing
  // active without relying on service-worker globals to retain executions.
  const heartbeat = setInterval(() => { try { port?.postMessage({ type: 'heartbeat' }) } catch { /* onDisconnect reconnects. */ } }, 15_000)
  return {
    getSnapshot: history.getSnapshot, subscribe: history.subscribe,
    pause() { history.pause(); state() }, resume() { history.resume(); state() }, clear() { history.clear(); state(true) },
    dispose() { disposed = true; clearInterval(heartbeat); clearTimeout(reconnect); port?.disconnect() },
  }
}
export type ExecutionController = ReturnType<typeof observeExecutions>
export type ExecutionWindow = Window & { overidifyExecutions?: ExecutionController }
