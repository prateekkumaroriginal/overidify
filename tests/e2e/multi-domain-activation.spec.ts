import { test, expect, fetchResult } from './extension'
import type { RequestHeaderRule } from '../../src/lib/types'
import type { NetworkRule } from '../../src/lib/network-rules'

test('real header and mock behavior reaches both listed website hosts and stops after one is removed', async ({ extension, site, server, networkRule }) => {
  const port = new URL(server.origin).port
  const secondOrigin = `http://localhost:${port}`
  const domains = [`127.0.0.1:${port}`, `localhost:${port}`]
  const requestUrl = `${server.origin}/api/start?a=1&b=2`
  await extension.settings.evaluate(async ({ domains, networkRule, requestUrl }) => {
    await chrome.storage.local.set({ requestHeaderRules: [{ kind: 'header-rule', id: crypto.randomUUID(), name: 'Shared header', enabled: true, order: 0, url: domains, headers: [{ key: 'X-Shared', value: 'yes' }] }], networkRules: [{ ...networkRule, requestUrl, url: domains, body: 'shared mock' }] })
    await chrome.runtime.sendMessage({ type: 'sync-request-header-rules' })
    await chrome.runtime.sendMessage({ type: 'sync-network-rules' })
  }, { domains, networkRule, requestUrl })
  const second = await extension.context.newPage()
  await site.goto(server.origin)
  await second.goto(secondOrigin)
  for (const page of [site, second]) {
    expect((await fetchResult(page, requestUrl)).body).toBe('shared mock')
    await fetchResult(page, `${server.origin}/api/header`)
    expect(server.hits.at(-1)?.headers['x-shared']).toBe('yes')
  }
  await extension.settings.evaluate(async domains => {
    const saved = await chrome.storage.local.get(['requestHeaderRules', 'networkRules'])
    await chrome.storage.local.set({ requestHeaderRules: (saved.requestHeaderRules as RequestHeaderRule[]).map(rule => ({ ...rule, url: [domains[0]] })), networkRules: (saved.networkRules as NetworkRule[]).map(rule => ({ ...rule, url: [domains[0]] })) })
    await chrome.runtime.sendMessage({ type: 'sync-request-header-rules' })
    await chrome.runtime.sendMessage({ type: 'sync-network-rules' })
  }, domains)
  expect((await fetchResult(site, requestUrl)).body).toBe('shared mock')
  expect((await fetchResult(second, requestUrl)).body).toBe('{"real":true}')
  await fetchResult(second, `${server.origin}/api/header`)
  expect(server.hits.at(-1)?.headers['x-shared']).toBeUndefined()
  await second.close()
})
