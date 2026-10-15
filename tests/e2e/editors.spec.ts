import { test, expect, fetchResult } from './extension'
import * as z from 'zod/mini'
import { NetworkOverrideSchema } from '../../src/lib/network-schemas'
import { HeaderEntrySchema, HeaderSwitcherSchema } from '../../src/lib/header-schemas'

test('Network rule editor preserves raw body, warnings, headers, toggles and keyboard submission', async ({ extension, override }) => {
  const page = extension.settings
  await page.goto(`chrome-extension://${extension.id}/options.html#/network-overrides/new`)
  await page.getByLabel('Network rule name', { exact: true }).fill('Featured chats')
  await page.getByLabel('Website domain', { exact: true }).fill(override.url)
  await page.getByLabel('Request URL', { exact: true }).fill(override.requestUrl)
  const body = '  {broken json\n  '
  await page.getByLabel('Response body', { exact: true }).fill(body)
  await page.getByLabel('Response body', { exact: true }).press('Enter')
  await expect(page).toHaveURL(/network-overrides\/new$/)
  await expect(page.getByText('The body is not valid JSON.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Add header', exact: true }).click()
  await page.getByLabel('Response header 2 name').fill('X-Empty')
  await page.getByRole('switch', { name: 'Network rule enabled' }).click()
  await page.getByLabel('Response body', { exact: true }).press('Control+Enter')
  await expect(page).toHaveURL(/#\/network-overrides$/)
  const entries = z.array(NetworkOverrideSchema).parse((await page.evaluate(() => chrome.storage.local.get('networkOverrides'))).networkOverrides)
  expect(entries[0]).toMatchObject({ body: body + '\n', enabled: false, method: 'GET', status: 200 })
  expect(entries[0].headers).toEqual([{ key: 'Content-Type', value: 'application/json' }, { key: 'X-Empty', value: '' }])
  await page.getByRole('link', { name: /Featured chats/ }).click()
  await expect(page.getByLabel('Response body', { exact: true })).toHaveValue(body + '\n')
  await page.getByLabel('Response header 2 name').fill('Set-Cookie')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Mock headers cannot set browser cookies')
  await page.getByRole('button', { name: 'Remove response header 2', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/#\/network-overrides$/)
  await page.getByRole('link', { name: /Featured chats/ }).click()
  await page.getByLabel('Network rule name', { exact: true }).press('Escape')
  await expect(page).toHaveURL(/#\/network-overrides$/)
  await page.getByRole('link', { name: /Featured chats/ }).click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Delete network rule', exact: true }).click()
  await expect(page).toHaveURL(/#\/network-overrides$/)
  expect((await page.evaluate(() => chrome.storage.local.get('networkOverrides'))).networkOverrides).toEqual([])
})

test('Header rule editor keeps header rows stable and preserves Enter and save behavior', async ({ extension }) => {
  const page = extension.settings
  await page.goto(`chrome-extension://${extension.id}/options.html#/new`)
  await page.getByLabel('Header rule name', { exact: true }).fill('Authentication')
  await page.getByLabel('Header 1 name').fill('X-First')
  await page.getByLabel('Header 1 value').fill('first')
  await page.getByRole('button', { name: 'Add header', exact: true }).click()
  await page.getByLabel('Header 2 name').fill('X-Second')
  await page.getByLabel('Header 2 value').fill('second')
  await page.getByRole('button', { name: 'Remove header 1', exact: true }).click()
  await expect(page.getByLabel('Header 1 value')).toHaveValue('second')
  await page.getByRole('button', { name: 'Remove header 1', exact: true }).click()
  await expect(page.getByLabel('Header 1 name')).toHaveValue('')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Add at least one header pair')
  await page.getByLabel('Header 1 name').fill('Authorization')
  await page.getByLabel('Header 1 value').fill('Bearer test')
  await page.getByLabel('Header rule name', { exact: true }).press('Enter')
  await expect(page).toHaveURL(/#\/new$/)
  await page.getByLabel('Header rule name', { exact: true }).press('Control+Enter')
  await expect(page).toHaveURL(/#\/$/)
  const entries = z.array(HeaderEntrySchema).parse((await page.evaluate(() => chrome.storage.local.get('headerRules'))).headerRules)
  expect(entries[0]).toMatchObject({ kind: 'rule', name: 'Authentication', headers: [{ key: 'Authorization', value: 'Bearer test' }] })
})

test('Switch rule editor retains option identity, inactive fields, selection, validation and undo', async ({ extension }) => {
  const page = extension.settings
  await page.evaluate(() => chrome.storage.local.set({ headerRules: [{
    id: 'switcher', kind: 'switcher', name: 'Accounts', url: '*', enabled: true, order: 0, selectedOptionId: 'guest',
    options: [{ id: 'admin', name: 'Admin', headers: [{ key: 'Authorization', value: 'admin' }] }, { id: 'guest', name: 'Guest', headers: [{ key: 'X-Role', value: 'guest' }] }],
  }] }))
  await page.goto(`chrome-extension://${extension.id}/options.html#/switchers/switcher`)
  await expect(page.getByLabel('Option name', { exact: true })).toHaveValue('Guest')
  await page.getByLabel('Header 1 value').fill('guest-edited')
  await page.getByRole('button', { name: 'Admin', exact: true }).click()
  await expect(page.getByLabel('Header 1 value')).toHaveValue('admin')
  await page.getByRole('button', { name: 'Guest', exact: true }).click()
  await expect(page.getByLabel('Header 1 value')).toHaveValue('guest-edited')
  await page.getByRole('button', { name: 'Delete option Guest', exact: true }).click()
  await expect(page.getByLabel('Option name', { exact: true })).toHaveValue('Admin')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByLabel('Header 1 value')).toHaveValue('guest-edited')
  await page.getByLabel('Option name', { exact: true }).fill('Admin')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Give each option a different name')
  await page.getByLabel('Option name', { exact: true }).fill('Guest')
  await page.getByRole('button', { name: 'Add option', exact: true }).click()
  await page.getByLabel('Option name', { exact: true }).fill('New account')
  await page.getByLabel('Header 1 name').fill('X-New')
  await page.getByLabel('Header 1 value').fill('new')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/#\/switchers$/)
  const entries = z.array(HeaderEntrySchema).parse((await page.evaluate(() => chrome.storage.local.get('headerRules'))).headerRules)
  const switcher = HeaderSwitcherSchema.parse(entries[0])
  expect(switcher.selectedOptionId).toBe('guest')
  expect(switcher.options.slice(0, 2)).toEqual([
    { id: 'admin', name: 'Admin', headers: [{ key: 'Authorization', value: 'admin' }] },
    { id: 'guest', name: 'Guest', headers: [{ key: 'X-Role', value: 'guest-edited' }] },
  ])
  expect(new Set(switcher.options.map(option => option.id)).size).toBe(3)
})

test('popup toggles apply live and layouts fit desktop and mobile', async ({ extension, site, server, override, seed }, testInfo) => {
  await seed([override]); await site.goto(server.origin)
  const popup = await extension.context.newPage()
  await site.bringToFront(); await popup.goto(`chrome-extension://${extension.id}/popup.html`)
  await popup.getByRole('switch', { name: 'Enable Mock response', exact: true }).click()
  await expect(popup.getByText('Changes apply to the next request.', { exact: true })).toBeVisible()
  expect((await fetchResult(site)).status).toBe(200)
  await popup.getByRole('switch', { name: 'Enable Mock response', exact: true }).click()
  await expect(popup.getByRole('switch', { name: 'Enable Mock response', exact: true })).toBeChecked()
  await expect.poll(async () => (await fetchResult(site)).status).toBe(201)
  const page = extension.settings
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`chrome-extension://${extension.id}/options.html#/network-overrides`)
    await page.getByRole('heading', { name: 'Network Rules', exact: true }).waitFor()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`list-${width}.png`), fullPage: true, animations: 'disabled' })
    await page.getByRole('link', { name: /Mock response/ }).click()
    await page.getByLabel('Response body', { exact: true }).waitFor()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`editor-${width}.png`), fullPage: true, animations: 'disabled' })
  }
})
