import { test, expect, fetchResult } from './extension'

test('XHR subclasses retain identity, methods and native method overrides without or with mocks', async ({ site, server, override, seed }) => {
  await site.goto(server.origin)
  await site.evaluate(() => Reflect.get(window, 'firstFetch'))
  for (const enabled of [false, true]) {
    await seed(enabled ? [override] : [])
    const result = await site.evaluate(() => new Promise(resolve => {
      class CustomXHR extends XMLHttpRequest {
        calls: string[] = []
        custom() { return 'custom' }
        override open(method: string, url: string | URL, async = true) {
          this.calls.push('open'); super.open(method, url, async)
        }
        override send(body?: Document | XMLHttpRequestBodyInit | null) {
          this.calls.push('send'); super.send(body)
        }
      }
      const xhr = new CustomXHR()
      const identity = { customInstance: xhr instanceof CustomXHR, xhrInstance: xhr instanceof XMLHttpRequest, method: typeof xhr.custom }
      xhr.onload = () => resolve({ ...identity, calls: xhr.calls, status: xhr.status, done: XMLHttpRequest.DONE })
      xhr.open('GET', '/api/start?b=2&a=1'); xhr.send()
    }))
    expect(result).toEqual({ customInstance: true, xhrInstance: true, method: 'function', calls: ['open', 'send'], status: enabled ? 201 : 200, done: 4 })
  }
})

test('XHR internal listeners and events do not invoke subclass public overrides', async ({ site, server, override, seed }) => {
  await site.goto(server.origin)
  await site.evaluate(() => Reflect.get(window, 'firstFetch'))
  for (const mode of ['disabled', 'bypass', 'call-server'] as const) {
    await seed(mode === 'disabled' ? [] : [{ ...override, mode }])
    const result = await site.evaluate(() => new Promise(resolve => {
      class CustomXHR extends XMLHttpRequest {
        calls: string[] = []
        override addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
          this.calls.push(type); super.addEventListener(type, listener, options)
        }
        override dispatchEvent(event: Event): boolean { throw new Error(`public dispatch ${event.type}`) }
      }
      const xhr = new CustomXHR()
      const initialCalls = [...xhr.calls]
      let explicitError = ''
      try { xhr.dispatchEvent(new Event('explicit')) } catch (error) { explicitError = (error as Error).message }
      xhr.addEventListener('load', () => resolve({ initialCalls, calls: xhr.calls, explicitError, status: xhr.status }))
      xhr.open('GET', '/api/start?b=2&a=1'); xhr.send()
    }))
    expect(result).toEqual({ initialCalls: [], calls: ['load'], explicitError: 'public dispatch explicit', status: mode === 'disabled' ? 200 : 201 })
  }
})

test('fetch matches Request objects from another frame and respects inherited signals', async ({ site, server, override, seed }) => {
  await seed([override]); await site.goto(server.origin)
  await site.evaluate(() => Reflect.get(window, 'firstFetch'))
  const result = await site.evaluate(async () => {
    const frame = document.createElement('iframe'); frame.src = '/frame'; document.body.append(frame)
    await new Promise<void>(resolve => { frame.onload = () => resolve() })
    const FrameRequest = Reflect.get(frame.contentWindow!, 'Request') as typeof Request
    const response = await fetch(new FrameRequest('/api/start?b=2&a=1'))
    const controller = new AbortController()
    const aborted = new FrameRequest('/api/start?b=2&a=1', { signal: controller.signal })
    controller.abort('frame-cancelled')
    const cancelled = await fetch(aborted).then(() => 'success', reason => reason)
    return { status: response.status, body: await response.text(), cancelled }
  })
  expect(result).toEqual({ status: 201, body: override.body, cancelled: 'frame-cancelled' })
  expect(server.hits).toHaveLength(0)
})

test('fetch retains Request cancellation for undefined options and allows explicit signal detachment', async ({ site, server, override, seed }) => {
  await seed([override]); await site.goto(server.origin)
  const result = await site.evaluate(async () => {
    const controller = new AbortController()
    const request = new Request('/api/start?b=2&a=1', { signal: controller.signal })
    controller.abort('cancelled')
    const send = (request: Request, signal?: AbortSignal) => fetch(request, { signal })
    const inherited = await send(request).then(() => 'success', reason => reason)
    const omitted = await fetch(request).then(() => 'success', reason => reason)
    const detached = await fetch(request, { signal: null })
    return { inherited, omitted, detached: detached.status }
  })
  expect(result).toEqual({ inherited: 'cancelled', omitted: 'cancelled', detached: 201 })
  expect(server.hits).toHaveLength(0)
})

for (const mode of ['bypass', 'call-server'] as const) {
  test(`${mode} XHR abort handlers can reopen and complete the same instance`, async ({ site, server, override, seed }) => {
    await seed([{ ...override, mode, requestUrl: `${server.origin}/api/slow` }, { ...override, id: 'retry', order: 1, mode }])
    await site.goto(server.origin)
    await site.evaluate(() => Reflect.get(window, 'firstFetch'))
    const result = await site.evaluate(() => new Promise(resolve => {
      const xhr = new XMLHttpRequest(); let aborts = 0
      const timeout = setTimeout(() => resolve({ status: xhr.status, state: xhr.readyState, aborts }), 1000)
      xhr.onabort = () => {
        aborts++
        if (aborts === 1) { xhr.open('GET', '/api/start?b=2&a=1'); xhr.send() }
      }
      xhr.onload = () => { clearTimeout(timeout); resolve({ status: xhr.status, state: xhr.readyState, aborts, body: xhr.responseText }) }
      xhr.open('GET', '/api/slow'); xhr.send(); xhr.abort()
    }))
    expect(result).toEqual({ status: 201, state: 4, aborts: 1, body: override.body })
  })
}

test('failed disable and delete warnings survive a worker restart until the page reloads', async ({ extension, site, server, override, seed }) => {
  await site.addInitScript(() => window.addEventListener('message', event => {
    if (Reflect.get(window, 'blockNetworkConfig') && event.data?.source === 'overidify-network-bridge' && event.data?.type === 'config') event.stopImmediatePropagation()
  }))
  await seed([override]); await site.goto(server.origin)
  expect((await fetchResult(site)).status).toBe(201)
  // Reproduce a stale page interceptor whose bridge cannot deliver new config.
  await site.evaluate(() => Reflect.set(window, 'blockNetworkConfig', true))
  for (const entries of [[{ ...override, enabled: false }], []]) {
    const result = await seed(entries)
    expect(result.ok).toBe(true)
    expect((await fetchResult(site)).status).toBe(201)
    expect(result.reloadTabIds).toHaveLength(1)
    if (entries.length) {
      const worker = extension.context.serviceWorkers().find(worker => worker.url().startsWith(`chrome-extension://${extension.id}/`))!
      await worker.evaluate(() => Reflect.set(globalThis, 'restartMarker', true))
      const protocol = await extension.context.newCDPSession(extension.settings)
      const { targetInfos } = await protocol.send('Target.getTargets')
      const target = targetInfos.find(target => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${extension.id}/`))!
      expect((await protocol.send('Target.closeTarget', { targetId: target.targetId })).success).toBe(true)
      const restarted = await seed(entries)
      const replacement = extension.context.serviceWorkers().find(worker => worker.url().startsWith(`chrome-extension://${extension.id}/`))!
      expect(await replacement.evaluate(() => Reflect.get(globalThis, 'restartMarker'))).toBeUndefined()
      expect(restarted.reloadTabIds).toHaveLength(1)
      expect((await fetchResult(site)).status).toBe(201)
    }
  }
  await site.reload()
  expect((await fetchResult(site)).status).toBe(200)
  expect((await seed([])).reloadTabIds).toEqual([])
  expect((await extension.settings.evaluate(() => chrome.storage.session.get('networkOverrideActiveTabs'))).networkOverrideActiveTabs).toEqual([])
})

test('XHR async arguments use native boolean conversion and defaults in both modes', async ({ browser, site, server, override, seed }) => {
  await site.goto(server.origin)
  await site.evaluate(() => Reflect.get(window, 'firstFetch'))
  const native = await browser.newPage(); await native.goto(server.origin)
  for (const mode of ['bypass', 'call-server'] as const) {
    await seed([{ ...override, mode }])
    for (const args of [[], [false], [null], [0], [''], [undefined], [true]]) {
      const results = await Promise.all([native, site].map(page => page.evaluate(args => {
        const xhr = new XMLHttpRequest(); const states: number[] = []
        xhr.onreadystatechange = () => states.push(xhr.readyState)
        Reflect.apply(xhr.open, xhr, ['GET', '/api/start?b=2&a=1', ...args]); xhr.send()
        return { states, state: xhr.readyState, status: xhr.status, body: xhr.responseText }
      }, args)))
      expect(results[1].states, `${mode}, async=${args.length ? String(args[0]) : 'omitted'}`).toEqual(results[0].states)
      expect(results[1].state).toBe(results[0].state)
      expect(results[1].status).toBe(results[0].status === 200 ? 201 : 0)
      expect(results[1].body).toBe(results[0].state === 4 ? override.body : '')
    }
  }
  await native.close()
})

test('bypass XHR rejects header edits after send just like native XHR', async ({ site, server, override, seed }) => {
  await seed([override]); await site.goto(server.origin)
  const result = await site.evaluate(() => {
    const xhr = new XMLHttpRequest(); xhr.open('GET', '/api/start?b=2&a=1'); xhr.send()
    try { xhr.setRequestHeader('X-Too-Late', 'value'); return 'allowed' } catch (error) { return (error as DOMException).name }
  })
  expect(result).toBe('InvalidStateError')
})

test('synchronous call-server XHR preserves native failure state and exceptions', async ({ browser, site, server, override, seed }) => {
  await seed([{ ...override, mode: 'call-server', requestUrl: `${server.origin}/api/truncated` }])
  await site.goto(server.origin)
  await site.evaluate(() => Reflect.get(window, 'firstFetch'))
  const native = await browser.newPage(); await native.goto(server.origin)
  for (const target of ['/api/truncated', '/api/fail']) {
    await seed([{ ...override, mode: 'call-server', requestUrl: `${server.origin}${target}` }])
    const results = await Promise.all([native, site].map(page => page.evaluate(target => {
      const xhr = new XMLHttpRequest(); xhr.open('GET', target, false)
      let error = ''
      try { xhr.send() } catch (reason) { error = (reason as DOMException).name }
      return { error, state: xhr.readyState, status: xhr.status, body: xhr.responseText }
    }, target)))
    expect(results[0].error).toBe('NetworkError')
    expect(results[1]).toEqual(results[0])
  }
  await seed([{ ...override, mode: 'call-server' }])
  expect(await site.evaluate(() => {
    const xhr = new XMLHttpRequest(); xhr.open('GET', '/api/start?b=2&a=1', false); xhr.send()
    return { status: xhr.status, body: xhr.responseText }
  })).toEqual({ status: 201, body: override.body })
  await native.close()
})
