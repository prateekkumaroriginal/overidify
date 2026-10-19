import { test, expect } from './extension'

test('toolbar follows Chrome appearance from options and with extension pages closed', async ({ extension, server }) => {
  const prefix = `chrome-extension://${extension.id}/`
  const worker = extension.context.serviceWorkers().find(worker => worker.url().startsWith(prefix))!
  const light = await extension.settings.locator('header img').nth(0).getAttribute('src')
  const dark = await extension.settings.locator('header img').nth(1).getAttribute('src')
  const driver = await extension.context.newPage()
  await driver.goto('chrome://settings/appearance')
  // Playwright otherwise forces a light media preference on visible pages.
  await driver.emulateMedia({ colorScheme: null })
  await extension.settings.emulateMedia({ colorScheme: null })
  await driver.locator('#colorSchemeModeSelect').selectOption({ label: 'Dark' })
  await extension.settings.bringToFront()
  await expect.poll(() => worker.evaluate(() => chrome.storage.session.get('browserIconTheme'))).toEqual({ browserIconTheme: 'dark' })
  try {
    await worker.evaluate(() => {
      const original = chrome.action.setIcon.bind(chrome.action)
      Reflect.set(chrome.action, 'setIcon', async (details: Parameters<typeof chrome.action.setIcon>[0]) => {
        await original(details)
        Reflect.set(globalThis, 'lastIconPath', details.path)
      })
    })
    for (const [label, path] of [['Light', light], ['Dark', dark]] as const) {
      await driver.bringToFront()
      await driver.locator('#colorSchemeModeSelect').selectOption({ label })
      await extension.settings.bringToFront()
      await expect.poll(() => worker.evaluate(() => Reflect.get(globalThis, 'lastIconPath')?.[128])).toBe(path)
    }
    const paths = await worker.evaluate(() => Reflect.get(globalThis, 'lastIconPath'))
    for (const path of Object.values(paths)) expect(path).toMatch(/^\/assets\/.*\.png$/)

    await extension.settings.close()
    expect(extension.context.pages().every(page => !page.url().startsWith(prefix))).toBe(true)

    const website = await extension.context.newPage()
    await website.emulateMedia({ colorScheme: null })
    await website.goto(server.origin)
    await driver.bringToFront()
    await driver.locator('#colorSchemeModeSelect').selectOption({ label: 'Light' })
    await website.bringToFront()
    await expect.poll(() => worker.evaluate(() => Reflect.get(globalThis, 'lastIconPath')?.[128])).toBe(light)
  } finally {
    await driver.close().catch(() => {})
  }
})
