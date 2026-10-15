import { test, expect, fetchResult } from './extension'
import * as z from 'zod/mini'
import { NetworkRuleSchema } from '../../src/lib/network-schemas'
import { RequestHeaderRuleSchema, SwitchRuleSchema } from '../../src/lib/request-header-schemas'

test('Network rule editor preserves raw body, warnings, headers, toggles and keyboard submission', async ({ extension, networkRule }) => {
  const page = extension.settings
  await page.goto(`chrome-extension://${extension.id}/options.html#/network-rules/new`)
  await page.getByLabel('Network rule name', { exact: true }).fill('Featured chats')
  await page.getByLabel('Website domain', { exact: true }).fill(networkRule.url)
  await page.getByLabel('Request URL', { exact: true }).fill(networkRule.requestUrl)
  const body = '  {broken json\n  '
  await page.getByLabel('Response body', { exact: true }).fill(body)
  await page.getByLabel('Response body', { exact: true }).press('Enter')
  await expect(page).toHaveURL(/network-rules\/new$/)
  await expect(page.getByText('The body is not valid JSON.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Add header', exact: true }).click()
  await page.getByLabel('Response header 2 name').fill('X-Empty')
  await page.getByRole('switch', { name: 'Network rule enabled' }).click()
  await page.getByLabel('Response body', { exact: true }).press('Control+Enter')
  await expect(page).toHaveURL(/#\/network-rules$/)
  const entries = z.array(NetworkRuleSchema).parse((await page.evaluate(() => chrome.storage.local.get('networkRules'))).networkRules)
  expect(entries[0]).toMatchObject({ body: body + '\n', enabled: false, method: 'GET', status: 200 })
  expect(entries[0].headers).toEqual([{ key: 'Content-Type', value: 'application/json' }, { key: 'X-Empty', value: '' }])
  await page.getByRole('link', { name: /Featured chats/ }).click()
  await expect(page.getByLabel('Response body', { exact: true })).toHaveValue(body + '\n')
  await page.getByLabel('Response header 2 name').fill('Set-Cookie')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Mock headers cannot set browser cookies')
  await page.getByRole('button', { name: 'Remove response header 2', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/#\/network-rules$/)
  await page.getByRole('link', { name: /Featured chats/ }).click()
  await page.getByLabel('Network rule name', { exact: true }).press('Escape')
  await expect(page).toHaveURL(/#\/network-rules$/)
  await page.getByRole('link', { name: /Featured chats/ }).click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Delete rule', exact: true }).click()
  await expect(page).toHaveURL(/#\/network-rules$/)
  expect((await page.evaluate(() => chrome.storage.local.get('networkRules'))).networkRules).toEqual([])
})

test('Header rule editor keeps header rows stable and preserves Enter and save behavior', async ({ extension }) => {
  const page = extension.settings
  await page.goto(`chrome-extension://${extension.id}/options.html#/header-rules/new`)
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
  await expect(page).toHaveURL(/#\/header-rules\/new$/)
  await page.getByLabel('Header rule name', { exact: true }).press('Control+Enter')
  await expect(page).toHaveURL(/#\/header-rules$/)
  const entries = z.array(RequestHeaderRuleSchema).parse((await page.evaluate(() => chrome.storage.local.get('requestHeaderRules'))).requestHeaderRules)
  expect(entries[0]).toMatchObject({ kind: 'header-rule', name: 'Authentication', headers: [{ key: 'Authorization', value: 'Bearer test' }] })
  await page.reload()
  await page.getByRole('link', { name: /Authentication/ }).click()
  await expect(page).toHaveURL(new RegExp(`#/header-rules/${entries[0].id}$`))
  await expect(page.getByLabel('Header 1 value')).toHaveValue('Bearer test')
  await page.getByRole('link', { name: 'Overidify home' }).click()
  await expect(page.getByRole('heading', { name: 'Header Rules', exact: true })).toBeVisible()
})

test('Switch rule editor retains option identity, inactive fields, selection, validation and undo', async ({ extension }) => {
  const page = extension.settings
  await page.evaluate(() => chrome.storage.local.set({ requestHeaderRules: [{
    id: 'switch-rule', kind: 'switch-rule', name: 'Accounts', url: '*', enabled: true, order: 0, selectedOptionId: 'guest',
    options: [{ id: 'admin', name: 'Admin', headers: [{ key: 'Authorization', value: 'admin' }] }, { id: 'guest', name: 'Guest', headers: [{ key: 'X-Role', value: 'guest' }] }],
  }] }))
  await page.goto(`chrome-extension://${extension.id}/options.html#/switch-rules/switch-rule`)
  await expect(page.getByLabel('Option name', { exact: true })).toHaveValue('Guest')
  await page.getByLabel('Header 1 value').fill('guest-edited')
  await page.getByRole('button', { name: 'Admin', exact: true }).click()
  await expect(page.getByLabel('Header 1 value')).toHaveValue('admin')
  await page.getByRole('button', { name: 'Guest', exact: true }).click()
  await expect(page.getByLabel('Header 1 value')).toHaveValue('guest-edited')
  await page.getByRole('button', { name: 'Delete option Guest', exact: true }).click()
  await expect(page.getByLabel('Option name', { exact: true })).toHaveValue('Admin')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByLabel('Option name', { exact: true })).toHaveAttribute('name', 'options.1.name')
  await expect(page.getByLabel('Header 1 value')).toHaveValue('guest-edited')
  await page.getByLabel('Option name', { exact: true }).fill('Admin')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Give each option a different name')
  await page.getByLabel('Option name', { exact: true }).fill('Guest')
  await page.getByRole('button', { name: 'Add option', exact: true }).click()
  await expect(page.getByLabel('Option name', { exact: true })).toHaveAttribute('name', 'options.2.name')
  await expect(page.getByLabel('Option name', { exact: true })).toHaveValue('Option 3')
  await page.getByLabel('Option name', { exact: true }).fill('New account')
  await page.getByLabel('Header 1 name').fill('X-New')
  await page.getByLabel('Header 1 value').fill('new')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/#\/switch-rules$/)
  const entries = z.array(RequestHeaderRuleSchema).parse((await page.evaluate(() => chrome.storage.local.get('requestHeaderRules'))).requestHeaderRules)
  const switchRule = SwitchRuleSchema.parse(entries[0])
  expect(switchRule.selectedOptionId).toBe('guest')
  expect(switchRule.options.slice(0, 2)).toEqual([
    { id: 'admin', name: 'Admin', headers: [{ key: 'Authorization', value: 'admin' }] },
    { id: 'guest', name: 'Guest', headers: [{ key: 'X-Role', value: 'guest-edited' }] },
  ])
  expect(new Set(switchRule.options.map(option => option.id)).size).toBe(3)
  expect(switchRule.options[2]).toMatchObject({ name: 'New account', headers: [{ key: 'X-New', value: 'new' }] })
  await page.reload()
  await page.getByRole('link', { name: /Accounts/ }).click()
  await expect(page).toHaveURL(/#\/switch-rules\/switch-rule$/)
  await expect(page.getByLabel('Option name', { exact: true })).toHaveValue('Guest')
})

test('Header and Switch Rules share website scope and popup edits reach real requests', async ({ extension, site, server }) => {
  await extension.settings.evaluate(async url => {
    const base = { url, enabled: true }
    await chrome.storage.local.set({ requestHeaderRules: [
      { ...base, kind: 'header-rule', id: 'headers', name: 'Request context', order: 0,
        headers: [{ key: 'X-Context', value: 'local' }] },
      { ...base, kind: 'switch-rule', id: 'accounts', name: 'Accounts', order: 1, selectedOptionId: 'admin',
        options: [
          { id: 'admin', name: 'Admin', headers: [{ key: 'X-Account', value: 'admin' }] },
          { id: 'guest', name: 'Guest', headers: [{ key: 'X-Account', value: 'guest' }] },
        ] },
      { ...base, url: 'unmatched.example.com', kind: 'header-rule', id: 'unmatched', name: 'Other website', order: 2,
        headers: [{ key: 'X-Other', value: 'hidden' }] },
    ] })
    await chrome.runtime.sendMessage({ type: 'sync-request-header-rules' })
  }, new URL(server.origin).host)
  await site.goto(server.origin)
  await fetchResult(site)
  expect(server.hits.at(-1)?.headers).toMatchObject({ 'x-context': 'local', 'x-account': 'admin' })
  const popup = await extension.context.newPage()
  await site.bringToFront()
  await popup.goto(`chrome-extension://${extension.id}/popup.html`)
  await expect(popup.getByRole('switch', { name: 'Enable Request context', exact: true })).toBeChecked()
  await expect(popup.getByRole('switch', { name: 'Enable Accounts', exact: true })).toBeChecked()
  await expect(popup.getByRole('switch', { name: 'Enable Other website', exact: true })).toHaveCount(0)
  await popup.getByRole('combobox', { name: 'Option for Accounts' }).click()
  await popup.getByRole('option', { name: 'Guest', exact: true }).click()
  await expect(popup.getByRole('combobox', { name: 'Option for Accounts' })).toBeEnabled()
  await expect.poll(async () => { await fetchResult(site); return server.hits.at(-1)?.headers['x-account'] }).toBe('guest')
  await popup.getByRole('switch', { name: 'Enable Request context', exact: true }).click()
  await expect(popup.getByRole('switch', { name: 'Enable Request context', exact: true })).toBeEnabled()
  await expect.poll(async () => { await fetchResult(site); return server.hits.at(-1)?.headers['x-context'] }).toBeUndefined()
  const entries = z.array(RequestHeaderRuleSchema).parse((await extension.settings.evaluate(() => chrome.storage.local.get('requestHeaderRules'))).requestHeaderRules)
  expect(entries[0].enabled).toBe(false)
  expect(SwitchRuleSchema.parse(entries[1]).selectedOptionId).toBe('guest')
  await expect(popup.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('href', 'options.html#/header-rules')
})

test('popup toggles apply live and layouts fit desktop and mobile', async ({ extension, site, server, networkRule, seed }, testInfo) => {
  await seed([networkRule]); await site.goto(server.origin)
  const popup = await extension.context.newPage()
  await site.bringToFront(); await popup.goto(`chrome-extension://${extension.id}/popup.html`)
  await popup.getByRole('switch', { name: 'Enable Mock response', exact: true }).click()
  await expect(popup.getByRole('switch', { name: 'Enable Mock response', exact: true })).toBeEnabled()
  await expect(popup.getByRole('status')).toHaveCount(0)
  expect((await fetchResult(site)).status).toBe(200)
  await popup.getByRole('switch', { name: 'Enable Mock response', exact: true }).click()
  await expect(popup.getByRole('switch', { name: 'Enable Mock response', exact: true })).toBeChecked()
  await expect(popup.getByRole('switch', { name: 'Enable Mock response', exact: true })).toBeEnabled()
  await expect(popup.getByRole('status')).toHaveCount(0)
  await expect.poll(async () => (await fetchResult(site)).status).toBe(201)
  const page = extension.settings
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`chrome-extension://${extension.id}/options.html#/network-rules`)
    await page.getByRole('heading', { name: 'Network Rules', exact: true }).waitFor()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`list-${width}.png`), fullPage: true, animations: 'disabled' })
    await page.getByRole('link', { name: /Mock response/ }).click()
    await page.getByLabel('Response body', { exact: true }).waitFor()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`editor-${width}.png`), fullPage: true, animations: 'disabled' })
  }
})
