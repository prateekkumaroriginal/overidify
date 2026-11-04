import { test, expect, fetchResult } from './extension'
import type { Page } from '@playwright/test'
import type { ExecutionRecord, HeaderInstallation, HeaderOccurrence } from '../../src/lib/execution-history'

type Packet = { type: string; record?: ExecutionRecord; matches?: HeaderOccurrence[]; installations?: HeaderInstallation[] }
type RecorderWindow = Window & { executionMessages: Packet[]; executionPort: chrome.runtime.Port }
async function startRecording(settings: Page, tabId: number) {
  await settings.evaluate(tabId => {
    const state = window as unknown as RecorderWindow
    state.executionMessages = []
    state.executionPort = chrome.runtime.connect({ name: 'overidify-executions' })
    state.executionPort.onMessage.addListener(message => state.executionMessages.push(message))
    state.executionPort.postMessage({ type: 'subscribe', tabId, since: Date.now() })
  }, tabId)
  await expect.poll(() => settings.evaluate(() => (window as unknown as RecorderWindow).executionMessages.some(message => message.type === 'ready'))).toBe(true)
}
const records = (settings: Page) => settings.evaluate(() => (window as unknown as RecorderWindow).executionMessages.flatMap(message => message.record ? [message.record] : []))
const inspectedTab = (settings: Page, origin: string) => settings.evaluate(async origin => (await chrome.tabs.query({})).find(tab => tab.url?.startsWith(origin))!.id!, origin)

test('Network executions preserve configured snapshots and report delivered headers, body and observed failures', async ({ extension, site, server, networkRule, seed }) => {
  await seed([{ ...networkRule, headers: [...networkRule.headers, { key: 'X-Tag', value: 'a' }, { key: 'x-tag', value: 'b' }] }])
  await site.goto(server.origin)
  await site.evaluate(() => (window as unknown as { firstFetch: Promise<unknown> }).firstFetch)
  await startRecording(extension.settings, await inspectedTab(extension.settings, server.origin))
  // randomUUID is unavailable to MAIN-world code on ordinary insecure HTTP sites.
  await site.evaluate(() => Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined }))
  const response = await fetchResult(site)
  await expect.poll(async () => (await records(extension.settings)).length).toBe(1)
  const [record] = await records(extension.settings)
  expect(record.result).toBe('Mocked')
  expect(record.response?.body).toBe('{"mock":true}')
  expect(record.response?.headers.map(header => [header.key, header.value])).toEqual(response.headers)
  await seed([{ ...networkRule, name: 'Edited', body: 'new body' }])
  expect(record.rule.name).toBe('Mock response')
  expect(record.rule.body).toBe('{"mock":true}')
  await seed([{ ...networkRule, mode: 'call-server', body: 'configured failure body', requestUrl: `${server.origin}/api/fail` }])
  await site.evaluate(() => fetch('/api/fail').catch(() => undefined))
  await expect.poll(async () => (await records(extension.settings)).some(record => record.result === 'Failed')).toBe(true)
  expect((await records(extension.settings)).find(record => record.result === 'Failed')?.rule.body).toBe('configured failure body')
})

test('an open recorder captures document-start Network executions after navigation', async ({ extension, site, server, networkRule, seed }) => {
  await seed([networkRule])
  await site.goto(server.origin)
  await site.evaluate(() => (window as unknown as { firstFetch: Promise<unknown> }).firstFetch)
  await startRecording(extension.settings, await inspectedTab(extension.settings, server.origin))
  await site.reload()
  await site.evaluate(() => (window as unknown as { firstFetch: Promise<unknown> }).firstFetch)
  await expect.poll(async () => (await records(extension.settings)).filter(record => record.rule.name === 'Mock response').length).toBe(1)
})

test('Header and Switch confirmation uses browser occurrences while request observations keep their own identity', async ({ extension, site, server }) => {
  test.setTimeout(60_000)
  const scope = new URL(server.origin).host
  await extension.settings.evaluate(async scope => {
    await chrome.storage.local.set({ requestHeaderRules: [
      { kind: 'header-rule', id: '00000000-0000-4000-8000-000000000011', name: 'Local auth', url: scope, enabled: true, order: 0, headers: [{ key: 'X-Header', value: 'header-value' }] },
      { kind: 'switch-rule', id: '00000000-0000-4000-8000-000000000012', name: 'Test account', url: scope, enabled: true, order: 1, selectedOptionId: '00000000-0000-4000-8000-000000000013', options: [{ id: '00000000-0000-4000-8000-000000000013', name: 'Alice', headers: [{ key: 'X-Switch', value: 'alice' }] }] },
    ] })
    await chrome.runtime.sendMessage({ type: 'sync-request-header-rules' })
  }, scope)
  await site.goto(server.origin)
  await startRecording(extension.settings, await inspectedTab(extension.settings, server.origin))
  await fetchResult(site, '/api/unmatched')
  await expect.poll(() => extension.settings.evaluate(() => (window as unknown as RecorderWindow).executionMessages.filter(packet => packet.type === 'request-observation').length)).toBeGreaterThanOrEqual(2)
  await expect.poll(() => extension.settings.evaluate(() => (window as unknown as RecorderWindow).executionMessages.some(packet => packet.type === 'header-executions' && (packet.matches?.length ?? 0) >= 2)), { timeout: 45_000 }).toBe(true)
  const snapshots = await extension.settings.evaluate(() => (window as unknown as RecorderWindow).executionMessages.findLast(packet => packet.type === 'header-executions')!.installations!)
  expect(snapshots.some(entry => entry.rule.name === 'Local auth')).toBe(true)
  expect(snapshots.some(entry => entry.rule.name === 'Test account' && entry.rule.option === 'Alice')).toBe(true)
  expect(server.hits.some(hit => hit.headers['x-header'] === 'header-value' && hit.headers['x-switch'] === 'alice')).toBe(true)
})
