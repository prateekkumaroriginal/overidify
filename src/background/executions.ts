import { readHeaderInstallations } from '../lib/dnr'
import { ExecutionRecordSchema } from '../lib/execution-schemas'

type Subscriber = { port: chrome.runtime.Port; tabId: number; since: number; paused: boolean; generation: number }
const subscribers = new Set<Subscriber>()
const tokens = new Map<number, string>()
const observers = new Map<number, () => void>()
let timer: ReturnType<typeof setTimeout> | undefined
let polling = false
const POLL_INTERVAL = 35_000

export function recordingTokenForTab(tabId?: number) {
  return tabId !== undefined && [...subscribers].some(item => item.tabId === tabId && !item.paused) ? tokens.get(tabId) ?? null : null
}

function send(subscriber: Subscriber, message: unknown) {
  try { subscriber.port.postMessage(message) } catch { subscribers.delete(subscriber) }
}
async function updateRecording(tabId: number) {
  const active = [...subscribers].some(item => item.tabId === tabId && !item.paused)
  if (active && !tokens.has(tabId)) tokens.set(tabId, crypto.randomUUID())
  await chrome.tabs.sendMessage(tabId, { type: 'record-network-executions', token: active ? tokens.get(tabId) : null }).catch(() => undefined)
}

async function poll() {
  if (polling || !subscribers.size) return
  polling = true
  try {
    const stored = await chrome.storage.session.get('executionLastPoll')
    const last = typeof stored.executionLastPoll === 'number' ? stored.executionLastPoll : 0
    const wait = last + POLL_INTERVAL - Date.now()
    if (wait > 0) {
      clearTimeout(timer)
      timer = setTimeout(() => { timer = undefined; void poll() }, wait)
      return
    }
    // Persist before calling: reconnecting the worker must not reset the quota.
    await chrome.storage.session.set({ executionLastPoll: Date.now() })
    const since = Math.min(...[...subscribers].map(item => item.since))
    const result = await chrome.declarativeNetRequest.getMatchedRules({ minTimeStamp: since })
    const installations = await readHeaderInstallations()
    for (const subscriber of subscribers) {
      const entries = installations.filter(entry => entry.tabId === subscriber.tabId)
      const ids = new Set(entries.map(entry => entry.id))
      if (result.rulesMatchedInfo.some(match => match.tabId === subscriber.tabId && match.rule.rulesetId === '_session' && !ids.has(match.rule.ruleId))) {
        send(subscriber, { type: 'notice', message: 'Some Chrome matches have no retained rule snapshot and cannot be shown.' })
      }
      send(subscriber, { type: 'header-executions', matches: result.rulesMatchedInfo.filter(match => ids.has(match.rule.ruleId)), installations: entries })
    }
  } catch (error) {
    for (const subscriber of subscribers) send(subscriber, { type: 'notice', message: `Header/Switch confirmation is unavailable: ${error instanceof Error ? error.message : String(error)}` })
  } finally {
    polling = false
    if (subscribers.size && timer === undefined) timer = setTimeout(() => { timer = undefined; void poll() }, POLL_INTERVAL)
  }
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'overidify-executions' || port.sender?.id !== chrome.runtime.id ||
    !port.sender.url?.startsWith(chrome.runtime.getURL(''))) return
  let subscriber: Subscriber | undefined
  port.onMessage.addListener(message => {
    if (message?.type === 'subscribe' && !subscriber && Number.isInteger(message.tabId) && message.tabId >= 0 && Number.isFinite(message.since)) {
      subscriber = { port, tabId: message.tabId, since: message.since, paused: false, generation: 0 }
      subscribers.add(subscriber)
      if (!observers.has(subscriber.tabId)) observers.set(subscriber.tabId, observeTab(subscriber.tabId))
      void updateRecording(subscriber.tabId).then(() => { if (subscriber) send(subscriber, { type: 'ready' }) })
      void poll()
    } else if (subscriber && message?.type === 'state' && typeof message.paused === 'boolean' && Number.isFinite(message.since)) {
      subscriber.since = Math.max(subscriber.since, message.since)
      subscriber.paused = message.paused
      if (Number.isInteger(message.generation)) subscriber.generation = message.generation
      if (message.clear === true) tokens.set(subscriber.tabId, crypto.randomUUID())
      void updateRecording(subscriber.tabId)
    } else if (subscriber && message?.type === 'heartbeat') { void poll() }
  })
  port.onDisconnect.addListener(() => {
    if (!subscriber) return
    const tabId = subscriber.tabId
    subscribers.delete(subscriber)
    if (![...subscribers].some(item => item.tabId === tabId)) {
      tokens.delete(tabId)
      observers.get(tabId)?.()
      observers.delete(tabId)
      void updateRecording(tabId)
    }
    if (!subscribers.size) { clearTimeout(timer); timer = undefined }
  })
})

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.tab?.id === undefined) return
  const tabId = sender.tab.id
  if (message?.type === 'get-execution-recording') {
    respond({ token: recordingTokenForTab(tabId) })
  } else if (message?.type === 'network-execution' && message.token === tokens.get(tabId)) {
    const parsed = ExecutionRecordSchema.safeParse(message.record)
    if (!parsed.success || parsed.data.source !== 'interceptor' || parsed.data.rule.kind !== 'network-rule' || parsed.data.result === 'Matched') return
    for (const subscriber of subscribers) if (subscriber.tabId === tabId) send(subscriber, { type: 'network-execution', record: parsed.data })
    respond({ ok: true })
  }
})

// Observations carry their own browser request identity. The match-history API
// has no shared request ID, so these events must never be joined by time alone.
function observeTab(tabId: number) {
  const requests = new Map<string, string>()
  const filter = { urls: ['<all_urls>'], tabId }
  const removals: (() => void)[] = []
  for (const stage of ['onBeforeSendHeaders', 'onSendHeaders'] as const) {
    const observe = (details: chrome.webRequest.OnBeforeSendHeadersDetails | chrome.webRequest.OnSendHeadersDetails) => {
      const token = tokens.get(tabId)
      if (stage === 'onBeforeSendHeaders' && token && [...subscribers].some(item => item.tabId === tabId && !item.paused)) requests.set(details.requestId, token)
      const startedToken = requests.get(details.requestId)
      if (stage === 'onSendHeaders') requests.delete(details.requestId)
      if (!startedToken || startedToken !== token) return undefined
      for (const subscriber of subscribers) if (subscriber.tabId === tabId && !subscriber.paused) {
        send(subscriber, { type: 'request-observation', generation: subscriber.generation, stage, requestId: details.requestId, url: details.url,
          method: details.method, headers: details.requestHeaders, time: details.timeStamp })
      }
      return undefined
    }
    chrome.webRequest[stage].addListener(observe, filter, ['requestHeaders', 'extraHeaders'])
    removals.push(() => chrome.webRequest[stage].removeListener(observe))
  }
  const finished = (details: { requestId: string }) => { requests.delete(details.requestId) }
  for (const event of [chrome.webRequest.onCompleted, chrome.webRequest.onErrorOccurred, chrome.webRequest.onBeforeRedirect]) {
    event.addListener(finished, filter)
    removals.push(() => event.removeListener(finished))
  }
  return () => removals.forEach(remove => remove())
}
