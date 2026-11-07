import type { HeaderPair } from './types.ts'

export type ExecutionRule = {
  id: string; kind: 'header-rule' | 'switch-rule' | 'network-rule'; name: string; url: string; headers: HeaderPair[]
  option?: string; requestUrl?: string; method?: string; mode?: string; status?: number; body?: string; bodyOmitted?: string
}
export type ExecutionRecord = {
  id: string; time: number; startedAt: number; source: 'chrome' | 'interceptor'; result: 'Matched' | 'Mocked' | 'Failed'
  rule: ExecutionRule
  request?: { url: string; method: string; type?: string; frameId?: number }
  response?: { status: number; headers: HeaderPair[]; body?: string; bodyOmitted?: string }
  error?: string
}
export const EXECUTION_HISTORY_BYTES = 50 * 1024 * 1024
export type RequestObservation = { id: string; url: string; method: string; time: number; before?: HeaderPair[]; after?: HeaderPair[] }
export type ExecutionSnapshot = { records: readonly ExecutionRecord[]; observations: readonly RequestObservation[]; bytes: number; removed: number; paused: boolean; notice: string }

export function createExecutionHistory({ now = Date.now, budget = EXECUTION_HISTORY_BYTES }: { now?: () => number; budget?: number } = {}) {
  const listeners = new Set<() => void>()
  let periods: { from: number; to?: number }[] = [{ from: now() }]
  let snapshot: ExecutionSnapshot = { records: [], observations: [], bytes: 0, removed: 0, paused: false, notice: '' }
  const sizes = new Map<string, number>()
  const sizeOf = (record: ExecutionRecord) => JSON.stringify(record).length * 2 + 128
  function publish(next: ExecutionSnapshot) { snapshot = next; listeners.forEach(listener => listener()) }
  function retain(records: ExecutionRecord[], observations: RequestObservation[], bytes: number, removed: number, notice = snapshot.notice) {
    records.sort((left, right) => left.time - right.time)
    while (bytes > budget) {
      if (observations.length && (!records.length || observations[0].time < records[0].time)) {
        const oldest = observations.shift()!
        bytes -= sizes.get(`observation:${oldest.id}`)!
        sizes.delete(`observation:${oldest.id}`)
      } else {
        const oldest = records.shift()!
        bytes -= sizes.get(oldest.id)!
        sizes.delete(oldest.id)
        removed++
      }
    }
    publish({ ...snapshot, records, observations, bytes, removed, notice })
  }
  function addMany(inputs: ExecutionRecord[]) {
    const records = [...snapshot.records]
    let total = snapshot.bytes
    let removed = snapshot.removed
    let notice = snapshot.notice
    for (const input of inputs) {
      if (!periods.some(period => input.startedAt >= period.from && (period.to === undefined || input.startedAt < period.to))) continue
      if (sizes.has(input.id)) continue
      const record = structuredClone(input)
      let bytes = sizeOf(record)
      if (bytes > budget && (record.response?.body !== undefined || record.rule.body !== undefined)) {
        delete record.rule.body
        record.rule.bodyOmitted = 'Configured body not retained: execution exceeds the history budget.'
        if (record.response) {
          delete record.response.body
          record.response.bodyOmitted = 'Body not retained: execution exceeds the history budget.'
        }
        bytes = sizeOf(record)
      }
      if (bytes > budget) {
        removed++
        notice = 'An execution could not be retained because its metadata exceeds the history budget.'
        continue
      }
      sizes.set(record.id, bytes)
      records.push(record)
      total += bytes
    }
    retain(records, [...snapshot.observations], total, removed, notice)
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    add(input: ExecutionRecord) { addMany([input]) },
    addMany,
    observe(input: Omit<RequestObservation, 'time'>, stage: 'before' | 'after') {
      if (snapshot.paused) return
      const existing = snapshot.observations.find(entry => entry.id === input.id)
      const observation = { ...existing, id: input.id, url: input.url, method: input.method, time: existing?.time ?? now(), [stage]: structuredClone(input[stage]) }
      const key = `observation:${input.id}`
      const prior = sizes.get(key) ?? 0
      const bytes = JSON.stringify(observation).length * 2 + 128
      if (bytes > budget) { publish({ ...snapshot, notice: 'A request-header observation exceeds the history budget and was not retained.' }); return }
      sizes.set(key, bytes)
      retain([...snapshot.records], [...snapshot.observations.filter(entry => entry.id !== input.id), observation].sort((a, b) => a.time - b.time), snapshot.bytes - prior + bytes, snapshot.removed)
    },
    pause() {
      if (snapshot.paused) return
      periods[periods.length - 1].to = now()
      publish({ ...snapshot, paused: true })
    },
    resume() {
      if (!snapshot.paused) return
      periods.push({ from: now() })
      publish({ ...snapshot, paused: false })
    },
    clear() {
      periods = snapshot.paused ? [] : [{ from: now() }]
      sizes.clear()
      publish({ ...snapshot, records: [], observations: [], bytes: 0, removed: 0, notice: '' })
    },
    notice(message: string) { publish({ ...snapshot, notice: message }) },
  }
}

export type HeaderOccurrence = { rule: { ruleId: number; rulesetId: string }; tabId: number; timeStamp: number }
export type HeaderInstallation = { id: number; tabId: number; rule: ExecutionRule; signature: string; retiredAt?: number }

// Polls overlap at the last timestamp. Count occurrences instead of using a Set:
// Chrome can expose two different executions with identical public tuples.
export function createHeaderMatchReader(tabId: number, history: ReturnType<typeof createExecutionHistory>, start: number) {
  let time = start
  let counts = new Map<number, number>()
  return {
    get since() { return time },
    read(matches: HeaderOccurrence[], installations: HeaderInstallation[]) {
      const byId = new Map(installations.map(entry => [entry.id, entry]))
      const current = new Map<number, number>()
      let latest = time
      const records: ExecutionRecord[] = []
      for (const match of [...matches].sort((a, b) => a.timeStamp - b.timeStamp)) {
        if (match.timeStamp < time || match.rule.rulesetId !== '_session') continue
        const installed = byId.get(match.rule.ruleId)
        if (!installed || installed.tabId !== tabId) continue
        if (match.timeStamp !== latest) { current.clear(); latest = match.timeStamp }
        const occurrence = (current.get(installed.id) ?? 0) + 1
        current.set(installed.id, occurrence)
        if (match.timeStamp === time && occurrence <= (counts.get(installed.id) ?? 0)) continue
        records.push({ id: `chrome:${installed.id}:${match.timeStamp}:${occurrence}`, time: match.timeStamp, startedAt: match.timeStamp,
          source: 'chrome', result: 'Matched', rule: installed.rule })
      }
      if (records.length) history.addMany(records)
      if (latest > time) { time = latest; counts = current }
      else for (const [id, count] of current) counts.set(id, Math.max(count, counts.get(id) ?? 0))
    },
  }
}
