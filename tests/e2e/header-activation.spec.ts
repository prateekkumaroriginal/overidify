import { test, expect, fetchResult } from './extension'
import type { RequestHeaderRule } from '../../src/lib/types'

test('Header and Switch Rules share website scope and saved option and enabled changes reach real requests', async ({ extension, site, server }) => {
  await extension.settings.evaluate(async url => {
    const base = { url, enabled: true }
    await chrome.storage.local.set({ requestHeaderRules: [
      { ...base, kind: 'header-rule', id: '00000000-0000-4000-8000-00000000000d', name: 'Request context', order: 0,
        headers: [{ key: 'X-Context', value: 'local' }] },
      { ...base, kind: 'switch-rule', id: '00000000-0000-4000-8000-000000000002', name: 'Accounts', order: 1, selectedOptionId: '00000000-0000-4000-8000-000000000004',
        options: [
          { id: '00000000-0000-4000-8000-000000000004', name: 'Admin', headers: [{ key: 'X-Account', value: 'admin' }] },
          { id: '00000000-0000-4000-8000-00000000000b', name: 'Guest', headers: [{ key: 'X-Account', value: 'guest' }] },
        ] },
      { ...base, url: 'unmatched.example.com', kind: 'header-rule', id: '00000000-0000-4000-8000-000000000017', name: 'Other website', order: 2,
        headers: [{ key: 'X-Other', value: 'hidden' }] },
    ] })
    await chrome.runtime.sendMessage({ type: 'sync-request-header-rules' })
  }, new URL(server.origin).host)
  await site.goto(server.origin)
  await fetchResult(site)
  expect(server.hits.at(-1)?.headers).toMatchObject({ 'x-context': 'local', 'x-account': 'admin' })
  expect(server.hits.at(-1)?.headers['x-other']).toBeUndefined()
  await extension.settings.evaluate(async () => {
    const stored = await chrome.storage.local.get('requestHeaderRules')
    await chrome.storage.local.set({ requestHeaderRules: (stored.requestHeaderRules as RequestHeaderRule[]).map(rule =>
      rule.kind === 'switch-rule' ? { ...rule, selectedOptionId: '00000000-0000-4000-8000-00000000000b' } : { ...rule, enabled: false }) })
    await chrome.runtime.sendMessage({ type: 'sync-request-header-rules' })
  })
  await fetchResult(site)
  expect(server.hits.at(-1)?.headers['x-account']).toBe('guest')
  expect(server.hits.at(-1)?.headers['x-context']).toBeUndefined()
  expect(server.hits.at(-1)?.headers['x-other']).toBeUndefined()
})
