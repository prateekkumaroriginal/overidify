import { test as base, expect, chromium } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { createServer } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createNetworkRuleDraft } from '../../src/lib/network-rules.ts'
import type { NetworkRule } from '../../src/lib/network-rules.ts'

type Server = { origin: string; hits: { url: string; headers: IncomingHttpHeaders; method: string }[] }
type Extension = { context: BrowserContext; settings: Page; id: string; profile: string }
type Fixtures = {
  server: Server; extension: Extension; site: Page; networkRule: NetworkRule
  seed: (entries: NetworkRule[]) => Promise<{ ok: boolean; reloadTabIds?: number[] }>
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture dependencies.
  server: async ({}, provide) => {
    const hits: Server['hits'] = []
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://test')
      if (url.pathname.startsWith('/api/')) {
        hits.push({ url: request.url!, headers: request.headers, method: request.method! })
        if (url.pathname === '/api/fail') { request.socket.destroy(); return }
        if (url.pathname === '/api/truncated') {
          response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': 1000 })
          response.write('{"partial":')
          setTimeout(() => response.destroy(), 50)
          return
        }
        const reply = () => {
          response.writeHead(200, { 'Content-Type': 'application/json', 'X-Real': 'server', 'Access-Control-Allow-Origin': '*' })
          response.end('{"real":true}')
        }
        if (url.pathname === '/api/slow') setTimeout(reply, 250)
        else reply()
        return
      }
      const script = url.pathname === '/startup-xhr' ? `
        window.startupEvents = [];
        const xhr = new XMLHttpRequest(); xhr.open('GET', '/api/unmatched'); xhr.timeout = 500;
        for (const event of ['load', 'loadend', 'timeout', 'error']) xhr.addEventListener(event, () => window.startupEvents.push(event));
        xhr.send();
      ` : `window.firstFetch = fetch('/api/start?b=2&a=1').then(async r => ({status:r.status,body:await r.text()}));`
      response.writeHead(200, {
        'Content-Type': 'text/html',
        'Content-Security-Policy': "script-src 'nonce-test'; connect-src *; frame-src *",
      })
      const frame = url.pathname === '/sandbox' ? '<iframe sandbox srcdoc="<h1>No scripts</h1>"></iframe>' : ''
      const shadow = url.pathname === '/declarative-shadow' ? '<div id="shadow-host"><template shadowrootmode="open"><iframe sandbox="allow-same-origin" srcdoc="<h1>No scripts</h1>"></iframe></template></div>' : ''
      response.end(`<!doctype html><title>Extension test</title><script nonce="test">${script}</script><h1>Extension test</h1>${frame}${shadow}`)
    })
    await new Promise<void>(done => server.listen(0, '0.0.0.0', done))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Test server did not start.')
    try { await provide({ origin: `http://127.0.0.1:${address.port}`, hits }) }
    finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())) }
  },
  // eslint-disable-next-line no-empty-pattern -- This fixture owns its isolated browser context.
  extension: async ({}, provide) => {
    const profile = await mkdtemp(join(tmpdir(), 'overidify-e2e-'))
    const path = resolve('dist')
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`, '--remote-debugging-port=0', '--remote-allow-origins=devtools://devtools'],
    })
    try {
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
      const id = new URL(worker.url()).host
      const settings = await context.newPage()
      await settings.goto(`chrome-extension://${id}/options.html`)
      await provide({ context, settings, id, profile })
    } finally { await context.close(); await rm(profile, { recursive: true, force: true }) }
  },
  site: async ({ extension }, provide) => {
    const page = await extension.context.newPage()
    try { await provide(page) } finally { await page.close() }
  },
  networkRule: async ({ server }, provide) => {
    await provide({ ...createNetworkRuleDraft(), id: '00000000-0000-4000-8000-000000000016', name: 'Mock response', order: 0,
      url: new URL(server.origin).host, requestUrl: `${server.origin}/api/start?a=1&b=2`,
      status: 201, body: '{"mock":true}', headers: [{ key: 'Content-Type', value: 'application/json' }, { key: 'X-Mock', value: 'configured' }],
    })
  },
  seed: async ({ extension }, provide) => {
    await provide(entries => extension.settings.evaluate(async entries => {
      await chrome.storage.local.set({ networkRules: entries })
      return chrome.runtime.sendMessage({ type: 'sync-network-rules' })
    }, entries))
  },
})
export { expect }

export const fetchResult = (page: Page, url = '/api/start?b=2&a=1', method = 'GET') => page.evaluate(async ({ url, method }) => {
  const response = await fetch(url, { method })
  return { status: response.status, body: await response.text(), headers: [...response.headers], url: response.url }
}, { url, method })

export const xhrResult = (page: Page, url = '/api/start?b=2&a=1', type: XMLHttpRequestResponseType = '', sync = false) => page.evaluate(({ url, type, sync }) => {
  const xhr = new XMLHttpRequest()
  xhr.open('GET', url, !sync)
  if (type) xhr.responseType = type
  const result = () => ({ status: xhr.status, body: type === 'blob' ? xhr.response.size : type === 'arraybuffer' ? Array.from(new Uint8Array(xhr.response)) : xhr.response,
    headers: xhr.getAllResponseHeaders(), nativeInstance: xhr instanceof XMLHttpRequest })
  if (sync) { xhr.send(); return Promise.resolve(result()) }
  return new Promise(resolve => {
    xhr.onload = () => resolve(result())
    xhr.onerror = () => resolve({ error: 'error', status: xhr.status })
    xhr.ontimeout = () => resolve({ error: 'timeout', status: xhr.status })
    xhr.timeout = 3000
    xhr.send()
  })
}, { url, type, sync })
