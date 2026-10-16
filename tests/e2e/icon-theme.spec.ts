import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from './extension'

async function attachObserver(context: BrowserContext, page: Page, url: string) {
  const client = await context.newCDPSession(page)
  const { targetInfos } = await client.send('Target.getTargets')
  const target = targetInfos.find(target => target.url === url)!
  expect(target).toBeDefined()
  const { sessionId } = await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: false })
  let nextId = 0
  const pending = new Map<number, { resolve: () => void; reject: (error: Error) => void }>()
  client.on('Target.receivedMessageFromTarget', event => {
    if (event.sessionId !== sessionId) return
    const response = JSON.parse(event.message)
    const request = pending.get(response.id)
    if (!request) return
    pending.delete(response.id)
    if (response.error) request.reject(new Error(response.error.message))
    else request.resolve()
  })
  return {
    client,
    theme: (value: 'light' | 'dark') => new Promise<void>((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      const message = JSON.stringify({ id, method: 'Emulation.setEmulatedMedia',
        params: { features: [{ name: 'prefers-color-scheme', value }] } })
      void client.send('Target.sendMessageToTarget', { sessionId, message }).catch(error => {
        pending.delete(id)
        reject(error)
      })
    }),
  }
}

test('page logos select transparent light and dark artwork without recoloring violet', async ({ extension }) => {
  for (const name of ['options', 'popup']) {
    const page = await extension.context.newPage()
    await page.goto(`chrome-extension://${extension.id}/${name}.html`)
    const samples = []
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme)
      const logo = page.locator('header img:visible')
      await expect(logo).toHaveCount(1)
      const sample = await logo.evaluate(async element => {
        const image = element as HTMLImageElement
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 128
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, 0)
        return { body: [...context.getImageData(32, 64, 1, 1).data],
          violet: [...context.getImageData(94, 64, 1, 1).data],
          corner: context.getImageData(0, 0, 1, 1).data[3], filter: getComputedStyle(image).filter }
      })
      expect(sample.filter).toBe('none')
      expect(sample.corner).toBe(0)
      samples.push(sample)
    }
    expect(Math.max(...samples[0].body.slice(0, 3))).toBeLessThan(40)
    expect(samples[1].body).toEqual([240, 240, 240, 255])
    expect(samples[0].violet).toEqual(samples[1].violet)
    await page.close()
  }
})

test('toolbar follows live theme changes without open extension pages and reuses its observer after restart', async ({ extension }) => {
  const prefix = `chrome-extension://${extension.id}/`
  const worker = extension.context.serviceWorkers().find(worker => worker.url().startsWith(prefix))!
  await expect.poll(() => worker.evaluate(() => chrome.runtime.sendMessage({ type: 'read-icon-theme' })).catch(() => undefined))
    .toHaveProperty('theme')
  const before = await worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }))
  expect(before).toHaveLength(1)
  const light = await extension.settings.locator('header img').nth(0).getAttribute('src')
  const dark = await extension.settings.locator('header img').nth(1).getAttribute('src')
  const driver = await extension.context.newPage()
  const observer = await attachObserver(extension.context, driver, `${prefix}offscreen.html`)
  try {
    await worker.evaluate(() => {
      const original = chrome.action.setIcon.bind(chrome.action)
      const updates: object[] = []
      Reflect.set(globalThis, 'iconUpdates', updates)
      Reflect.set(chrome.action, 'setIcon', async (details: Parameters<typeof chrome.action.setIcon>[0]) => {
        await original(details)
        updates.push(details)
      })
    })
    // Wait for each transition, including hidden-document sampling.
    await observer.theme('light')
    await expect.poll(() => worker.evaluate(() => chrome.runtime.sendMessage({ type: 'read-icon-theme' }))).toEqual({ theme: 'light' })
    await observer.theme('dark')
    await expect.poll(() => worker.evaluate(() => Reflect.get(globalThis, 'iconUpdates').at(-1)?.path[128])).toBe(dark)
    const paths = await worker.evaluate(() => Reflect.get(globalThis, 'iconUpdates').at(-1).path)
    for (const path of Object.values(paths)) expect(path).toMatch(/^\/assets\/.*\.png$/)

    await extension.settings.close()
    expect(extension.context.pages().every(page => !page.url().startsWith(prefix))).toBe(true)
    await observer.theme('light')
    await expect.poll(() => worker.evaluate(() => Reflect.get(globalThis, 'iconUpdates').at(-1)?.path[128])).toBe(light)

    const { targetInfos } = await observer.client.send('Target.getTargets')
    const target = targetInfos.find(target => target.type === 'service_worker' && target.url.startsWith(prefix))!
    await worker.evaluate(() => Reflect.set(globalThis, 'restartMarker', true))
    expect((await observer.client.send('Target.closeTarget', { targetId: target.targetId })).success).toBe(true)
    await observer.theme('dark')
    // Chromium can reuse the worker target across restarts, so check execution
    // state rather than waiting for a new Playwright serviceworker event.
    await expect.poll(async () => {
      const current = extension.context.serviceWorkers().find(worker => worker.url().startsWith(prefix))
      if (!current) return 'stopped'
      return current.evaluate(() => Reflect.get(globalThis, 'restartMarker')).catch(() => 'stopped')
    }).toBeUndefined()
    const replacement = extension.context.serviceWorkers().find(worker => worker.url().startsWith(prefix))!
    await expect.poll(() => replacement.evaluate(() => chrome.runtime.sendMessage({ type: 'read-icon-theme' })))
      .toEqual({ theme: 'dark' })
    const after = await replacement.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }))
    expect(after).toHaveLength(1)
    expect(after[0].documentId).toBe(before[0].documentId)
  } finally {
    await observer.client.detach().catch(() => {})
    await driver.close().catch(() => {})
  }
})
