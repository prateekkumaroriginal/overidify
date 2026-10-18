import type { Locator, Page } from '@playwright/test'
import { test, expect } from './extension'

type SaveGate = { calls: number; release?: () => void; fail: boolean }

declare global {
  interface Window { saveGate: SaveGate }
}

async function delayActivation(page: Page) {
  await page.evaluate(() => {
    const state: SaveGate = { calls: 0, fail: false }
    window.saveGate = state
    const sendMessage = chrome.runtime.sendMessage.bind(chrome.runtime)
    Object.defineProperty(chrome.runtime, 'sendMessage', {
      value: async (message: { type: string }) => {
        if (!['sync-request-header-rules', 'sync-network-rules'].includes(message.type)) return sendMessage(message)
        state.calls++
        const response = await sendMessage(message)
        await new Promise<void>(resolve => { state.release = resolve })
        return state.fail ? { ok: false, error: 'Activation failed for this test.' } : response
      },
    })
  })
}

async function expectStableControls(page: Page, active: Locator) {
  await expect.poll(() => page.evaluate(() => Boolean(window.saveGate.release))).toBe(true)
  await expect(active).toBeFocused()
  await expect(active).toHaveAttribute('aria-busy', 'true')
  for (const control of await page.locator('[role="switch"]:visible, [role="combobox"]:visible').all()) {
    await expect(control).toHaveCSS('opacity', '1')
  }
  // Programmatic clicks bypass Playwright's aria-disabled check, exercising our guard.
  await active.evaluate(element => { if (element instanceof HTMLElement) element.click() })
  await active.press('Space')
  expect(await page.evaluate(() => window.saveGate.calls)).toBe(1)
  await expect(page.getByRole('listbox')).toHaveCount(0)
}

async function finishSave(page: Page, active: Locator) {
  await page.evaluate(() => {
    const state = window.saveGate
    state.release!()
    delete state.release
    state.calls = 0
  })
  await expect(active).not.toHaveAttribute('aria-busy', 'true')
  await expect(active).toBeFocused()
}

for (const surface of ['settings', 'popup'] as const) {
  test(`${surface} toggles keep controls opaque and focused throughout activation`, async ({ extension, site, server, networkRule, seed }) => {
    const requestHeaderRules = [
      { kind: 'header-rule', id: 'headers', name: 'Request context', url: '*', enabled: true, order: 0,
        headers: [{ key: 'X-Context', value: 'local' }] },
      { kind: 'header-rule', id: 'other-headers', name: 'Other headers', url: '*', enabled: true, order: 1,
        headers: [{ key: 'X-Other', value: 'local' }] },
      ...['accounts', 'other-accounts'].map((id, index) => ({ kind: 'switch-rule', id,
        name: index ? 'Other accounts' : 'Accounts', url: '*', enabled: true, order: index + 2, selectedOptionId: 'admin',
        options: [
          { id: 'admin', name: 'Admin', headers: [{ key: `X-Account-${index}`, value: 'admin' }] },
          { id: 'guest', name: 'Guest', headers: [{ key: `X-Account-${index}`, value: 'guest' }] },
        ],
      })),
    ]
    await extension.settings.evaluate(rules => chrome.storage.local.set({ requestHeaderRules: rules }), requestHeaderRules)
    await seed([networkRule, { ...networkRule, id: 'other-network', name: 'Other network rule', order: 1 }])
    const page = surface === 'settings' ? extension.settings : await extension.context.newPage()
    if (surface === 'popup') {
      await site.goto(server.origin)
      await site.bringToFront()
      await page.goto(`chrome-extension://${extension.id}/popup.html`)
    }
    await delayActivation(page)

    for (const [route, name] of [['header-rules', 'Request context'], ['switch-rules', 'Accounts'], ['network-rules', networkRule.name]]) {
      if (surface === 'settings') {
        // A hash change preserves the delayed activation hook on this document.
        await page.evaluate(route => { location.hash = `/${route}` }, route)
      }
      const toggle = page.getByRole('switch', { name: `Enable ${name}`, exact: true })
      await expect(toggle).toBeChecked()
      const element = await toggle.elementHandle()
      for (const enabled of [false, true]) {
        await toggle.click()
        await expectStableControls(page, toggle)
        await expect(toggle).toBeChecked({ checked: enabled })
        expect(await element!.evaluate(node => node.isConnected)).toBe(true)
        await finishSave(page, toggle)
        await expect(toggle).toBeChecked({ checked: enabled })
      }
      if (route === 'switch-rules') {
        const select = page.getByRole('combobox', { name: 'Option for Accounts', exact: true })
        await select.click()
        await page.getByRole('option', { name: 'Guest', exact: true }).click()
        await expectStableControls(page, select)
        await expect(select).toHaveText('Guest')
        await finishSave(page, select)
      }
    }

    // A failed activation must clear the busy state and allow a retry.
    await page.evaluate(() => { window.saveGate.fail = true })
    const toggle = page.getByRole('switch', { name: `Enable ${networkRule.name}`, exact: true })
    await toggle.click()
    await expectStableControls(page, toggle)
    await finishSave(page, toggle)
    await expect(page.getByRole('alert')).toContainText('Activation failed for this test.')
    await page.evaluate(() => { window.saveGate.fail = false })
    await toggle.click()
    await expectStableControls(page, toggle)
    await finishSave(page, toggle)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(toggle).toBeChecked()
  })
}
