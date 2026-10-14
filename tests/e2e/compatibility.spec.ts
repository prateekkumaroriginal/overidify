import { test, expect, fetchResult } from './extension'

for (const mode of ['bypass', 'call-server'] as const) {
  test(`${mode} failed XHR open preserves pending and completed mocks`, async ({ site, server, override, seed }) => {
    await seed([{ ...override, mode }]); await site.goto(server.origin)
    await site.evaluate(() => Reflect.get(window, 'firstFetch'))
    const result = await site.evaluate(() => new Promise(resolve => {
      const xhr = new XMLHttpRequest(); const errors: string[] = []
      const failOpen = () => {
        for (const [method, url] of [['TRACE', '/api/slow'], ['GET', 'http://[']]) {
          try { xhr.open(method, url) } catch (error) { errors.push((error as DOMException).name) }
        }
      }
      const timer = setTimeout(() => resolve({ timeout: true, state: xhr.readyState }), 1500)
      xhr.onload = () => {
        failOpen(); clearTimeout(timer)
        resolve({ errors, status: xhr.status, state: xhr.readyState, body: xhr.responseText })
      }
      xhr.open('GET', '/api/start?b=2&a=1'); xhr.send(); failOpen()
    }))
    expect(result).toEqual({ errors: ['SecurityError', 'SyntaxError', 'SecurityError', 'SyntaxError'], status: 201, state: 4, body: override.body })
  })

  test(`${mode} fetch cancellation reaches pending requests and unread mock bodies`, async ({ site, server, override, seed }) => {
    await seed([{ ...override, mode }]); await site.goto(server.origin)
    await site.evaluate(() => Reflect.get(window, 'firstFetch'))
    const result = await site.evaluate(async () => {
      const immediate = new AbortController()
      const pending = fetch('/api/start?b=2&a=1', { signal: immediate.signal })
      immediate.abort('cancelled')
      const request = await pending.then(() => 'success', reason => reason)
      const later = new AbortController()
      const response = await fetch('/api/start?b=2&a=1', { signal: later.signal })
      const clone = response.clone()
      later.abort('cancelled')
      const bodies = await Promise.all([response, clone].map(body => body.text().then(() => 'success', reason => reason)))
      return { request, status: response.status, bodies }
    })
    expect(result).toEqual({ request: 'cancelled', status: 201, bodies: ['cancelled', 'cancelled'] })
  })
}

test('XHR converts method and URL arguments once, including pass-through traffic', async ({ browser, site, server, override, seed }) => {
  await site.goto(server.origin); await site.evaluate(() => Reflect.get(window, 'firstFetch'))
  const native = await browser.newPage(); await native.goto(server.origin)
  for (const mode of ['disabled', 'bypass', 'call-server'] as const) {
    await seed(mode === 'disabled' ? [] : [{ ...override, mode }])
    const results = await Promise.all([native, site].map(page => page.evaluate(async () => {
      const methods = [null, 123, { toString: () => 'GET' }].map(method => {
        const xhr = new XMLHttpRequest()
        try { Reflect.apply(xhr.open, xhr, [method, '/api/start?b=2&a=1']); return xhr.readyState }
        catch (error) { return (error as DOMException).name }
      })
      let calls = 0
      const response = await new Promise(resolve => {
        const xhr = new XMLHttpRequest()
        const url = { toString: () => ++calls === 1 ? '/api/start?b=2&a=1' : '/api/slow' }
        xhr.onload = () => resolve({ url: xhr.responseURL, status: xhr.status })
        Reflect.apply(xhr.open, xhr, ['GET', url]); xhr.send()
      })
      return { methods, calls, response }
    })))
    expect(results[1].methods).toEqual(results[0].methods)
    expect(results[1].calls).toBe(1)
    expect(results[1].response).toEqual({ url: `${server.origin}/api/start?b=2&a=1`, status: mode === 'disabled' ? 200 : 201 })
  }
  await native.close()
})

test('script-disabled sandbox frames do not cause persistent reload warnings', async ({ site, server, override, seed }) => {
  await seed([override]); await site.goto(`${server.origin}/sandbox`)
  await site.evaluate(() => Reflect.get(window, 'firstFetch'))
  expect((await seed([override])).reloadTabIds).toEqual([])
  expect((await fetchResult(site)).status).toBe(201)
  await site.reload()
  expect((await seed([override])).reloadTabIds).toEqual([])
})

test('parent calls to same-origin script-disabled iframe APIs receive live mocks', async ({ site, server, override, seed }) => {
  await seed([override]); await site.goto(server.origin)
  await site.evaluate(() => Reflect.get(window, 'firstFetch'))
  await site.evaluate(() => new Promise<void>(resolve => {
    const frame = document.createElement('iframe'); frame.sandbox.value = 'allow-same-origin'; frame.srcdoc = '<h1>No scripts</h1>'
    frame.onload = () => resolve(); document.body.append(frame)
  }))
  for (const mode of ['bypass', 'call-server', 'disabled'] as const) {
    expect((await seed(mode === 'disabled' ? [] : [{ ...override, mode }])).reloadTabIds).toEqual([])
    const result = await site.evaluate(async () => {
      const frame = document.querySelector('iframe')!.contentWindow!
      const request = Reflect.get(frame, 'fetch') as typeof fetch
      const Constructor = Reflect.get(frame, 'XMLHttpRequest') as typeof XMLHttpRequest
      const response = await request.call(frame, '/api/start?b=2&a=1')
      const xhr = await new Promise(resolve => {
        const xhr = new Constructor(); xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText })
        xhr.open('GET', '/api/start?b=2&a=1'); xhr.send()
      })
      return { fetch: { status: response.status, body: await response.text() }, xhr }
    })
    const expected = { status: mode === 'disabled' ? 200 : 201, body: mode === 'disabled' ? '{"real":true}' : override.body }
    expect(result).toEqual({ fetch: expected, xhr: expected })
  }
})

test('mock XHR rejects no malformed header names and skips LOADING for HEAD', async ({ browser, site, server, override, seed }) => {
  await site.goto(server.origin); await site.evaluate(() => Reflect.get(window, 'firstFetch'))
  const native = await browser.newPage(); await native.goto(server.origin)
  for (const mode of ['bypass', 'call-server'] as const) {
    await seed([{ ...override, method: 'ANY', mode }])
    const results = await Promise.all([native, site].map(page => page.evaluate(() => new Promise(resolve => {
      const xhr = new XMLHttpRequest(); const states: number[] = []
      xhr.onreadystatechange = () => states.push(xhr.readyState)
      xhr.onload = () => resolve({ states, headers: ['', 'x space', 'x\nnewline'].map(name => xhr.getResponseHeader(name)), body: xhr.responseText })
      xhr.open('HEAD', '/api/start?b=2&a=1'); xhr.send()
    }))))
    expect(results[1]).toEqual(results[0])
    expect(results[1]).toEqual({ states: [1, 2, 4], headers: [null, null, null], body: '' })
  }
  await native.close()
})

test('XHR MIME overrides survive open and instance reuse', async ({ browser, site, server, override, seed }) => {
  await seed([override]); await site.goto(server.origin)
  await site.evaluate(() => Reflect.get(window, 'firstFetch'))
  const native = await browser.newPage(); await native.goto(server.origin)
  const results = await Promise.all([native, site].map(page => page.evaluate(async () => {
    const xhr = new XMLHttpRequest(); xhr.overrideMimeType('text/custom')
    const send = () => new Promise<string>(resolve => {
      xhr.open('GET', '/api/start?b=2&a=1'); xhr.responseType = 'blob'
      xhr.onload = () => resolve((xhr.response as Blob).type); xhr.send()
    })
    return [await send(), await send()]
  })))
  expect(results[1]).toEqual(results[0])
  expect(results[1]).toEqual(['text/custom', 'text/custom'])
  await native.close()
})

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
