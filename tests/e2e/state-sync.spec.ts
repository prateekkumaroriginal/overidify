import type { Page } from '@playwright/test'
import { test, expect, fetchResult } from './extension'

declare global {
  interface Window { releaseActivation?: () => void; releaseWrite?: () => void; releaseInitialRead?: () => void }
}

for (const recoveryFails of [false, true]) {
  test(`queued network activation ${recoveryFails ? 'reports a failed recovery pass' : 'recovers after the first pass fails'}`, async ({ extension, site, server, networkRule, seed }) => {
    const first = extension.settings
    await seed([networkRule, { ...networkRule, id: 'second', name: 'Second response', order: 1,
      requestUrl: `${server.origin}/api/second`, status: 202 }])
    await site.goto(server.origin)
    expect((await fetchResult(site)).status).toBe(201)
    expect((await fetchResult(site, '/api/second')).status).toBe(202)
    await first.evaluate(() => { location.hash = '/network-rules' })
    const second = await extension.context.newPage()
    await second.goto(`chrome-extension://${extension.id}/options.html#/network-rules`)
    const firstToggle = first.getByRole('switch', { name: `Enable ${networkRule.name}`, exact: true })
    const secondToggle = second.getByRole('switch', { name: 'Enable Second response', exact: true })
    await expect(firstToggle).toBeChecked()
    await expect(secondToggle).toBeChecked()
    // Drain setup events before intercepting the next network activation query.
    await first.evaluate(async () => {
      await chrome.runtime.sendMessage({ type: 'sync-request-header-rules' })
      await chrome.runtime.sendMessage({ type: 'sync-network-rules' })
    })
    const worker = extension.context.serviceWorkers()[0]
    await worker.evaluate(recoveryFails => {
      const query = chrome.tabs.query.bind(chrome.tabs)
      const probe: { calls: number; requests: number; release?: () => void } = { calls: 0, requests: 0 }
      Reflect.set(globalThis, 'networkSyncProbe', probe)
      chrome.runtime.onMessage.addListener(message => {
        if (message?.type === 'sync-network-rules') probe.requests++
      })
      Object.defineProperty(chrome.tabs, 'query', {
        configurable: true,
        value: async (info: chrome.tabs.QueryInfo) => {
          const call = ++probe.calls
          if (call === 1) await new Promise<void>(resolve => { probe.release = resolve })
          if (call === 1 || recoveryFails) throw new Error('Network activation query failed for this test.')
          return query(info)
        },
      })
    }, recoveryFails)
    await firstToggle.click()
    await expect.poll(() => worker.evaluate(() => Boolean(Reflect.get(globalThis, 'networkSyncProbe').release))).toBe(true)
    await expect.poll(() => worker.evaluate(() => Reflect.get(globalThis, 'networkSyncProbe').requests)).toBe(1)
    await secondToggle.click()
    await expect.poll(() => worker.evaluate(() => Reflect.get(globalThis, 'networkSyncProbe').requests)).toBe(2)
    expect(await first.evaluate(async () => ((await chrome.storage.local.get('networkRules')).networkRules as { enabled: boolean }[]).map(rule => rule.enabled))).toEqual([false, false])
    await worker.evaluate(() => Reflect.get(globalThis, 'networkSyncProbe').release())
    await expect(firstToggle).not.toHaveAttribute('aria-busy', 'true')
    await expect(secondToggle).not.toHaveAttribute('aria-busy', 'true')
    expect(await worker.evaluate(() => Reflect.get(globalThis, 'networkSyncProbe').calls)).toBeGreaterThanOrEqual(2)
    if (recoveryFails) {
      await expect(first.getByRole('alert')).toContainText('Network activation query failed')
      await expect(second.getByRole('alert')).toContainText('Network activation query failed')
      expect((await fetchResult(site)).status).toBe(201)
      expect((await fetchResult(site, '/api/second')).status).toBe(202)
    } else {
      await expect(first.getByRole('alert')).toHaveCount(0)
      await expect(second.getByRole('alert')).toHaveCount(0)
      expect((await fetchResult(site)).status).toBe(200)
      expect((await fetchResult(site, '/api/second')).status).toBe(200)
    }
  })
}

for (const kind of ['header', 'network'] as const) {
  test(`delayed ${kind} activation does not block edits in another settings page`, async ({ extension, networkRule, seed }) => {
    const first = extension.settings
    const key = kind === 'header' ? 'requestHeaderRules' : 'networkRules'
    await first.evaluate(() => chrome.storage.local.set({ requestHeaderRules: ['first', 'second'].map((id, order) => ({
      kind: 'header-rule', id, name: id, url: '*', enabled: true, order,
      headers: [{ key: `X-${id}`, value: 'local' }],
    })) }))
    await seed(['first', 'second'].map((id, order) => ({ ...networkRule, id, name: id, order })))
    await first.evaluate(kind => { location.hash = `/${kind}-rules` }, kind)
    const second = await extension.context.newPage()
    await second.goto(`chrome-extension://${extension.id}/options.html#/${kind}-rules`)
    const firstToggle = first.getByRole('switch', { name: 'Enable first', exact: true })
    const secondToggle = second.getByRole('switch', { name: 'Enable second', exact: true })
    await expect(firstToggle).toBeChecked()
    await expect(secondToggle).toBeChecked()
    await holdActivation(first)
    await firstToggle.click()
    await expect.poll(() => first.evaluate(() => Boolean(window.releaseActivation))).toBe(true)
    await secondToggle.click()
    await expect(secondToggle).not.toHaveAttribute('aria-busy', 'true')
    await expect(secondToggle).not.toBeChecked()
    await expect(firstToggle).toHaveAttribute('aria-busy', 'true')
    expect(await first.evaluate(async key => ((await chrome.storage.local.get(key))[key] as { enabled: boolean }[]).map(rule => rule.enabled), key)).toEqual([false, false])
    await first.evaluate(() => { window.releaseActivation!(); delete window.releaseActivation })
    await expect(firstToggle).not.toHaveAttribute('aria-busy', 'true')
    await expect(firstToggle).not.toBeChecked()
  })

  test(`concurrent ${kind} toggles from two settings pages preserve both edits`, async ({ extension, networkRule, seed }) => {
    const first = extension.settings
    const key = kind === 'header' ? 'requestHeaderRules' : 'networkRules'
    await first.evaluate(() => chrome.storage.local.set({ requestHeaderRules: ['first', 'second'].map((id, order) => ({
      kind: 'header-rule', id, name: id, url: '*', enabled: true, order,
      headers: [{ key: `X-${id}`, value: 'local' }],
    })) }))
    await seed(['first', 'second'].map((id, order) => ({ ...networkRule, id, name: id, order })))
    await first.evaluate(kind => { location.hash = `/${kind}-rules` }, kind)
    const second = await extension.context.newPage()
    await second.goto(`chrome-extension://${extension.id}/options.html#/${kind}-rules`)
    const firstToggle = first.getByRole('switch', { name: 'Enable first', exact: true })
    const secondToggle = second.getByRole('switch', { name: 'Enable second', exact: true })
    await expect(firstToggle).toBeChecked()
    await expect(secondToggle).toBeChecked()
    await first.evaluate(() => {
      const set = chrome.storage.local.set.bind(chrome.storage.local)
      Object.defineProperty(chrome.storage.local, 'set', {
        value: async (items: Record<string, unknown>) => {
          await new Promise<void>(resolve => { window.releaseWrite = resolve })
          return set(items)
        },
      })
    })
    await firstToggle.click()
    await expect.poll(() => first.evaluate(() => Boolean(window.releaseWrite))).toBe(true)
    await secondToggle.click()
    await first.evaluate(() => { window.releaseWrite!(); delete window.releaseWrite })
    await expect(firstToggle).not.toHaveAttribute('aria-busy', 'true')
    await expect(secondToggle).not.toHaveAttribute('aria-busy', 'true')
    expect(await first.evaluate(async key => ((await chrome.storage.local.get(key))[key] as { enabled: boolean }[]).map(rule => rule.enabled), key)).toEqual([false, false])
    await expect(firstToggle).not.toBeChecked()
    await expect(secondToggle).not.toBeChecked()
  })
}

async function holdActivation(page: Page) {
  await page.evaluate(() => {
    const sendMessage = chrome.runtime.sendMessage.bind(chrome.runtime)
    Object.defineProperty(chrome.runtime, 'sendMessage', {
      value: async (message: { type: string }) => {
        const response = await sendMessage(message)
        if (['sync-request-header-rules', 'sync-network-rules'].includes(message.type)) {
          await new Promise<void>(resolve => { window.releaseActivation = resolve })
        }
        return response
      },
    })
  })
}

for (const surface of ['settings', 'popup'] as const) {
  for (const kind of ['header', 'network'] as const) {
    test(`${surface} ${kind} startup read cannot overwrite a newer storage update`, async ({ extension, site, server, networkRule, seed }) => {
      await extension.settings.evaluate(() => chrome.storage.local.set({ requestHeaderRules: [
        { kind: 'header-rule', id: 'headers', name: 'Request context', url: '*', enabled: true, order: 0,
          headers: [{ key: 'X-Context', value: 'local' }] },
      ] }))
      await seed([networkRule])
      const key = kind === 'header' ? 'requestHeaderRules' : 'networkRules'
      const page = await extension.context.newPage()
      await page.addInitScript(key => {
        const get = chrome.storage.local.get.bind(chrome.storage.local)
        Object.defineProperty(chrome.storage.local, 'get', {
          value: async (storageKey: string) => {
            const result = await get(storageKey)
            if (storageKey === key) await new Promise<void>(resolve => { window.releaseInitialRead = resolve })
            return result
          },
        })
      }, key)
      if (surface === 'popup') {
        await site.goto(server.origin)
        await site.bringToFront()
      }
      await page.goto(`chrome-extension://${extension.id}/${surface === 'popup' ? 'popup' : 'options'}.html#/${kind}-rules`)
      await expect.poll(() => page.evaluate(() => Boolean(window.releaseInitialRead))).toBe(true)
      await page.evaluate(async key => {
        // Register after the UI subscription, so this acknowledgement observes delivery to React.
        const changed = new Promise<void>(resolve => {
          const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
            if (!(key in changes)) return
            chrome.storage.onChanged.removeListener(listener)
            resolve()
          }
          chrome.storage.onChanged.addListener(listener)
        })
        const stored = await chrome.storage.local.get(key === 'requestHeaderRules' ? ['requestHeaderRules'] : ['networkRules'])
        await chrome.storage.local.set({ [key]: (stored[key] as { enabled: boolean }[]).map(rule => ({ ...rule, enabled: false })) })
        await changed
        window.releaseInitialRead!()
        delete window.releaseInitialRead
      }, key)
      const name = kind === 'header' ? 'Request context' : networkRule.name
      await expect(page.getByRole('switch', { name: `Enable ${name}`, exact: true })).not.toBeChecked()
    })

    test(`${surface} ${kind} activation cannot overwrite a newer storage update`, async ({ extension, site, server, networkRule, seed }) => {
      await extension.settings.evaluate(() => chrome.storage.local.set({ requestHeaderRules: [
        { kind: 'header-rule', id: 'headers', name: 'Request context', url: '*', enabled: true, order: 0,
          headers: [{ key: 'X-Context', value: 'local' }] },
      ] }))
      await seed([networkRule])
      const page = surface === 'settings' ? extension.settings : await extension.context.newPage()
      if (surface === 'popup') {
        await site.goto(server.origin)
        await site.bringToFront()
        await page.goto(`chrome-extension://${extension.id}/popup.html`)
      } else {
        await page.evaluate(kind => { location.hash = `/${kind}-rules` }, kind)
      }
      const name = kind === 'header' ? 'Request context' : networkRule.name
      const key = kind === 'header' ? 'requestHeaderRules' : 'networkRules'
      const toggle = page.getByRole('switch', { name: `Enable ${name}`, exact: true })
      await expect(toggle).toBeChecked()
      await holdActivation(page)
      await toggle.click()
      await expect.poll(() => page.evaluate(() => Boolean(window.releaseActivation))).toBe(true)
      await expect(toggle).not.toBeChecked()

      // Another extension page changes the rule while this page awaits activation.
      await extension.settings.evaluate(async key => {
        const stored = await chrome.storage.local.get(key)
        await chrome.storage.local.set({ [key]: (stored[key] as { enabled: boolean }[]).map(rule => ({ ...rule, enabled: true })) })
      }, key)
      await expect(toggle).toBeChecked()
      await page.evaluate(() => { window.releaseActivation!(); delete window.releaseActivation })
      await expect(toggle).not.toHaveAttribute('aria-busy', 'true')
      await expect(toggle).toBeChecked()
      expect(await extension.settings.evaluate(async key => ((await chrome.storage.local.get(key))[key] as { enabled: boolean }[])[0].enabled, key)).toBe(true)
    })
  }
}
