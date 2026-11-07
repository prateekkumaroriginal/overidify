import { createExecutionHistory, createHeaderMatchReader } from '../lib/execution-history'
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
      } else if (message?.type === 'request-observation' && message.generation === generation && typeof message.observationId === 'string' && typeof message.url === 'string' && typeof message.method === 'string') {
        const headers = Array.isArray(message.headers) ? message.headers.flatMap((header: { name?: unknown; value?: unknown }) =>
          typeof header.name === 'string' && typeof header.value === 'string' ? [{ key: header.name, value: header.value }] : []) : []
        const stage = message.stage === 'onBeforeSendHeaders' ? 'before' : 'after'
        history.observe({ id: message.observationId, url: message.url, method: message.method, [stage]: headers }, stage)
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
