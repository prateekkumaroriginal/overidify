import type { Page } from '@playwright/test'
import { test, expect } from './extension'

declare global {
  interface Window { releaseActivation?: () => void; releaseWrite?: () => void; releaseInitialRead?: () => void }
}

for (const kind of ['header', 'network'] as const) {
  test(`concurrent ${kind} toggles from two settings pages preserve both edits`, async ({ extension, networkRule, seed }) => {
    const first = extension.settings
    const key = kind === 'header' ? 'requestHeaderRules' : 'networkRules'
    await first.evaluate(() => chrome.storage.local.set({ requestHeaderRules: ['first', 'second'].map((id, order) => ({
      kind: 'header-rule', id: order ? '00000000-0000-4000-8000-000000000042' : '00000000-0000-4000-8000-000000000041', name: id, url: '*', enabled: true, order,
      headers: [{ key: `X-${id}`, value: 'local' }],
    })) }))
    await seed(['first', 'second'].map((id, order) => ({ ...networkRule, id: order ? '00000000-0000-4000-8000-000000000042' : '00000000-0000-4000-8000-000000000041', name: id, order })))
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
        { kind: 'header-rule', id: '00000000-0000-4000-8000-000000000031', name: 'Request context', url: '*', enabled: true, order: 0,
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
        { kind: 'header-rule', id: '00000000-0000-4000-8000-000000000031', name: 'Request context', url: '*', enabled: true, order: 0,
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
