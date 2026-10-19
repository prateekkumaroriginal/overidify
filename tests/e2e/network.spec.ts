import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, fetchResult, xhrResult } from './extension'

test('first inline fetch under CSP uses bypass; response fields, clones and XHR types are preserved', async ({ site, server, networkRule, seed }) => {
  await seed([networkRule]); await site.goto(server.origin)
  expect(await site.evaluate(() => Reflect.get(window, 'firstFetch'))).toEqual({ status: 201, body: networkRule.body })
  expect(server.hits).toHaveLength(0)
  expect(await fetchResult(site)).toMatchObject({ status: 201, body: networkRule.body, url: `${server.origin}/api/start?b=2&a=1` })
  for (const type of ['', 'json', 'blob', 'arraybuffer'] as const) expect(await xhrResult(site, undefined, type)).toMatchObject({ status: 201, nativeInstance: true })
  expect(await xhrResult(site, undefined, '', true)).toMatchObject({ status: 201, body: networkRule.body })
  await seed([{ ...networkRule, headers: [] }])
  expect((await fetchResult(site)).headers).toEqual([])
  expect(await site.evaluate(async () => { const r = (await fetch('/api/start?b=2&a=1')).clone(); return { body: await r.text(), url: r.url } })).toEqual({ body: networkRule.body, url: `${server.origin}/api/start?b=2&a=1` })
})

test('an unmatched startup XHR completes exactly once without a stale timeout', async ({ site, server, networkRule, seed }) => {
  await seed([networkRule]); await site.goto(`${server.origin}/startup-xhr`)
  await site.waitForFunction(() => Reflect.get(window, 'startupEvents').includes('loadend'))
  // Observe past the configured deadline; a stale startup timer used to fire here.
  await site.waitForTimeout(600)
  expect(await site.evaluate(() => Reflect.get(window, 'startupEvents'))).toEqual(['load', 'loadend'])
})

test('send from OPENED captures the new request URL before callbacks execute', async ({ site, server, networkRule, seed }) => {
  await seed([networkRule]); await site.goto(server.origin)
  await site.evaluate(() => Reflect.get(window, 'firstFetch'))
  const result = await site.evaluate(() => new Promise(resolve => {
    const xhr = new XMLHttpRequest()
    xhr.onreadystatechange = () => { if (xhr.readyState === 1) xhr.send() }
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText })
    xhr.open('GET', '/api/start?b=2&a=1')
  }))
  expect(result).toEqual({ status: 201, body: networkRule.body }); expect(server.hits).toHaveLength(0)
})

for (const mode of ['bypass', 'call-server'] as const) {
  test(`${mode} XHR allows responseType changes at headers and rejects them at loading`, async ({ site, server, networkRule, seed }) => {
    await seed([{ ...networkRule, mode }]); await site.goto(server.origin)
    const result = await site.evaluate(() => new Promise(resolve => {
      const xhr = new XMLHttpRequest(); const errors: string[] = []
      xhr.open('GET', '/api/start?b=2&a=1')
      xhr.onreadystatechange = () => {
        try {
          if (xhr.readyState === 2) xhr.responseType = 'json'
          if (xhr.readyState === 3) xhr.responseType = 'text'
        } catch (error) { errors.push((error as DOMException).name) }
      }
      xhr.onload = () => resolve({ response: xhr.response, errors })
      xhr.send()
    }))
    expect(result).toEqual({ response: { mock: true }, errors: ['InvalidStateError'] })
  })
}

test('call-server preserves Header Rules, transport failures, aborts and timeouts', async ({ site, server, extension, networkRule, seed }) => {
  await seed([{ ...networkRule, mode: 'call-server' }]); await site.goto(server.origin)
  await extension.settings.evaluate(async url => {
    await chrome.storage.local.set({ requestHeaderRules: [{ kind: 'header-rule', id: '00000000-0000-4000-8000-00000000000d', name: 'Headers', url, enabled: true, order: 0, headers: [{ key: 'X-Test-Header', value: 'header-rule' }] }] })
    await chrome.runtime.sendMessage({ type: 'sync-request-header-rules' })
  }, networkRule.url)
  expect(await fetchResult(site)).toMatchObject({ status: 201, body: networkRule.body })
  expect(server.hits.at(-1)?.headers['x-test-header']).toBe('header-rule')
  expect(await xhrResult(site, undefined, 'json')).toMatchObject({ status: 201, body: { mock: true } })
  expect((await fetchResult(site)).headers.some(([key]) => key === 'x-real')).toBe(false)
  await seed([{ ...networkRule, mode: 'call-server', requestUrl: `${server.origin}/api/fail` }])
  expect(await site.evaluate(() => fetch('/api/fail').then(() => 'load', () => 'error'))).toBe('error')
  expect(await xhrResult(site, '/api/fail')).toMatchObject({ error: 'error', status: 0 })
  await seed([{ ...networkRule, mode: 'call-server', requestUrl: `${server.origin}/api/slow` }])
  expect(await site.evaluate(() => new Promise(resolve => {
    const xhr = new XMLHttpRequest(); xhr.open('GET', '/api/slow'); xhr.timeout = 30
    xhr.ontimeout = () => resolve(xhr.status); xhr.send()
  }))).toBe(0)
  expect(await site.evaluate(async () => {
    const controller = new AbortController(); const promise = fetch('/api/slow', { signal: controller.signal })
    setTimeout(() => controller.abort(), 30)
    try { await promise; return 'load' } catch (error) { return (error as DOMException).name }
  })).toBe('AbortError')
})

test('call-server fetch and XHR use the mock after headers even if the real body fails', async ({ site, server, networkRule, seed }) => {
  await seed([{ ...networkRule, mode: 'call-server', requestUrl: `${server.origin}/api/truncated` }]); await site.goto(server.origin)
  expect(await fetchResult(site, '/api/truncated')).toMatchObject({ status: 201, body: networkRule.body })
  expect(await xhrResult(site, '/api/truncated')).toMatchObject({ status: 201, body: networkRule.body })
})

test('live changes affect subsequent requests while fetch and XHR keep in-flight snapshots', async ({ site, server, networkRule, seed }) => {
  const entry = { ...networkRule, mode: 'call-server' as const, requestUrl: `${server.origin}/api/slow`, body: 'old' }
  await seed([entry]); await site.goto(server.origin)
  const pendingFetch = fetchResult(site, '/api/slow')
  await expect.poll(() => server.hits.filter(hit => hit.url === '/api/slow').length).toBe(1)
  await seed([{ ...entry, body: 'new' }]); expect((await pendingFetch).body).toBe('old')
  expect((await fetchResult(site, '/api/slow')).body).toBe('new')
  const pendingXHR = xhrResult(site, '/api/slow')
  await expect.poll(() => server.hits.filter(hit => hit.url === '/api/slow').length).toBe(3)
  await seed([{ ...entry, body: 'next' }]); expect(await pendingXHR).toMatchObject({ body: 'new' })
  await seed([{ ...entry, enabled: false }]); expect((await fetchResult(site, '/api/slow')).status).toBe(200)
  await seed([entry]); expect((await fetchResult(site, '/api/slow')).status).toBe(201)
})

test('website scope includes cross-origin iframes but excludes an ineligible top-level page', async ({ site, server, extension, networkRule, seed }) => {
  await seed([networkRule]); await site.goto(server.origin)
  const otherOrigin = server.origin.replace('127.0.0.1', 'localhost')
  const other = await extension.context.newPage(); await other.goto(otherOrigin)
  expect((await fetchResult(other, networkRule.requestUrl)).status).toBe(200)
  const framed = site.waitForEvent('framenavigated', { predicate: frame => frame !== site.mainFrame() && frame.url().startsWith(otherOrigin) })
  await site.evaluate(url => { const frame = document.createElement('iframe'); frame.src = url; document.body.append(frame) }, otherOrigin)
  expect(await (await framed).evaluate(async url => (await fetch(url)).status, networkRule.requestUrl)).toBe(201)
})

test('aborts and reentrant XHR event handlers never double-complete in either mode', async ({ site, server, networkRule, seed }) => {
  await seed([networkRule]); await site.goto(server.origin)
  expect(await site.evaluate(async () => {
    const controller = new AbortController(); controller.abort('cancelled')
    try { await fetch('/api/start?b=2&a=1', { signal: controller.signal }); return 'load' } catch (error) { return error }
  })).toBe('cancelled')
  for (const mode of ['bypass', 'call-server'] as const) {
    await seed([{ ...networkRule, mode }])
  for (const phase of ['loadstart', 'headers', 'done']) {
    const result = await site.evaluate(phase => new Promise(resolve => {
      const xhr = new XMLHttpRequest(); let loads = 0, aborts = 0
      xhr.open('GET', '/api/start?b=2&a=1'); xhr.onabort = () => aborts++; xhr.onload = () => loads++
      if (phase === 'loadstart') xhr.onloadstart = () => xhr.abort()
      if (phase === 'headers') xhr.onreadystatechange = () => { if (xhr.readyState === 2) xhr.abort() }
      xhr.onloadend = () => {
        let repeated = 'allowed'; try { xhr.send() } catch (error) { repeated = (error as DOMException).name }
        resolve({ loads, aborts, repeated })
      }; xhr.send()
    }), phase)
    expect(result).toEqual({ loads: phase === 'done' ? 1 : 0, aborts: phase === 'done' ? 0 : 1, repeated: 'InvalidStateError' })
  }
  }
})

test('HEAD, bodyless statuses, method selection and document-base URL matching are preserved', async ({ site, server, networkRule, seed }) => {
  await seed([{ ...networkRule, status: 204 }]); await site.goto(server.origin)
  expect((await fetchResult(site)).body).toBe('')
  await seed([{ ...networkRule, method: 'HEAD' }]); expect((await fetchResult(site, undefined, 'HEAD')).body).toBe('')
  await seed([{ ...networkRule, method: 'ANY', status: 422 }]); expect((await fetchResult(site, undefined, 'POST')).status).toBe(422)
  await seed([{ ...networkRule, requestUrl: `${server.origin}/api/relative` }])
  await site.evaluate(origin => { const base = document.createElement('base'); base.href = `${origin}/api/`; document.head.append(base) }, server.origin)
  expect((await fetchResult(site, 'relative')).status).toBe(201)
  expect(await xhrResult(site, 'relative')).toMatchObject({ status: 201 })
})

test('native DevTools remains usable and records the real call-server response', async ({ site, server, extension, networkRule, seed }) => {
  await seed([{ ...networkRule, mode: 'call-server' }]); await site.goto(server.origin)
  const protocol = await extension.context.newCDPSession(site)
  const target = (await protocol.send('Target.getTargetInfo')).targetInfo.targetId
  const port = (await readFile(join(extension.profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]
  const devtools = await extension.context.newPage()
  await devtools.goto(`devtools://devtools/bundled/inspector.html?ws=127.0.0.1:${port}/devtools/page/${target}&panel=network`)
  await devtools.waitForFunction(() => Boolean(document.querySelector('.root-view')))
  const openNetwork = `(async () => {const ui=await import('devtools://devtools/bundled/ui/legacy/legacy.js');await ui.InspectorView.InspectorView.instance().showPanel('network');})()`
  await devtools.evaluate(openNetwork)
  expect((await fetchResult(site)).status).toBe(201)
  await devtools.waitForFunction(`async () => {const logs=await import('devtools://devtools/bundled/models/logs/logs.js');return logs.NetworkLog.NetworkLog.instance().requests().some(r=>r.url().includes('/api/start')&&r.finished);}`)
  const native = await devtools.evaluate(`(async () => {const logs=await import('devtools://devtools/bundled/models/logs/logs.js');const request=logs.NetworkLog.NetworkLog.instance().requests().find(r=>r.url().includes('/api/start')&&r.finished);const body=await request.requestContentData();return {status:request.statusCode,body:body.text??body.content};})()`)
  expect(native).toEqual({ status: 200, body: '{"real":true}' })
})
