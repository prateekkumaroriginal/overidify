import { test, expect } from './extension'

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
    expect(samples[0].violet).toEqual([95, 58, 252, 255])
    expect(samples[0].violet).toEqual(samples[1].violet)
    await page.close()
  }
})

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
