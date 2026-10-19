import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { test, expect } from './extension'

const header = { id: '10000000-0000-4000-8000-000000000001', kind: 'header-rule', name: 'Auth export', url: '*',
  enabled: false, order: 0, headers: [{ key: 'Authorization', value: 'Bearer exact token' }] }
const accounts = { ...header, id: '10000000-0000-4000-8000-000000000002', kind: 'switch-rule', name: 'Accounts export', order: 1,
  options: [
    { id: '10000000-0000-4000-8000-000000000003', name: 'Admin', headers: header.headers },
    { id: '10000000-0000-4000-8000-000000000004', name: 'Guest', headers: [{ key: 'X-Role', value: 'guest' }] },
  ], selectedOptionId: '10000000-0000-4000-8000-000000000004' }
const mock = { id: '10000000-0000-4000-8000-000000000005', name: 'Network export', url: '*', enabled: false, order: 0,
  requestUrl: 'https://api.example.com/mock', method: 'GET', mode: 'bypass', body: '  {not JSON\n', status: 201,
  headers: [{ key: 'Content-Type', value: 'application/json' }] }

async function exported(page: Page, name = 'Export') {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name, exact: true }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^overidify-.*\.json$/)
  const path = await file.path()
  if (!path) throw new Error('Download missing')
  return JSON.parse(await readFile(path, 'utf8'))
}

async function chooseImport(page: Page, data: unknown) {
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.getByLabel('Import file').setInputFiles({ name: 'rules.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) })
  return page.getByRole('dialog')
}

test('tab export, selection across rule types, and editor save requirements use the agreed controls', async ({ extension }) => {
  const page = extension.settings
  await page.evaluate(rules => chrome.storage.local.set(rules), { requestHeaderRules: [header, accounts], networkRules: [mock] })
  await page.reload()
  await expect(page.getByRole('link', { name: /Auth export/ })).toBeVisible()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  const tabFile = await exported(page)
  expect(tabFile.requestHeaderRules).toEqual([header])
  expect(tabFile.networkRules).toEqual([])
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Export selected (0)', exact: true })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Select Auth export', exact: true }).check()
  await page.getByRole('tab', { name: 'Network Rules', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Select Network export', exact: true }).check()
  await page.getByRole('tab', { name: 'Switch Rules', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Select Accounts export', exact: true }).check()
  const selection = await exported(page, 'Export selected (3)')
  expect(selection.requestHeaderRules[1].options).toEqual(accounts.options)
  expect(selection.requestHeaderRules[1].selectedOptionId).toBe(accounts.selectedOptionId)
  expect(selection.networkRules[0].body).toBe(mock.body)
  await page.getByRole('button', { name: 'Cancel selection', exact: true }).click()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await page.getByRole('link', { name: /Accounts export/ }).click()
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled()
  expect((await exported(page)).requestHeaderRules).toHaveLength(1)
  await page.getByLabel('Switch rule name', { exact: true }).fill('Unsaved')
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeDisabled()
  await expect(page.getByText('Save changes to export')).toBeVisible()
  await page.getByRole('link', { name: 'Back to switch rules', exact: true }).click()
  await page.getByRole('link', { name: /New Switch Rule/ }).first().click()
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeDisabled()
})

test('import rejects unsupported files and asks before importing valid rules beside invalid UUID duplicates', async ({ extension }) => {
  const page = extension.settings
  let dialog = await chooseImport(page, { format: 'overidify', version: 2, requestHeaderRules: [], networkRules: [] })
  await expect(dialog.getByRole('alert')).toContainText('version')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  dialog = await chooseImport(page, { format: 'overidify', version: 1, requestHeaderRules: [header, header, { ...accounts, selectedOptionId: crypto.randomUUID() }], networkRules: [mock] })
  await expect(dialog.getByRole('status')).toContainText('1 valid · 3 invalid · 0 overlaps')
  await expect(dialog.getByRole('button', { name: 'Import 1 valid rule', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Import 1 valid rule', exact: true }).click()
  await expect(dialog.getByText('Rules imported', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('tab', { name: 'Network Rules', exact: true }).click()
  await expect(page.getByRole('link', { name: /Network export/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('switch', { name: 'Enable Network export', exact: true })).not.toBeChecked()
  expect((await exported(page)).networkRules[0].body).toBe(mock.body)
})

test('one overlap choice replaces in place or adds distinct copies without removing unrelated rules', async ({ extension }, testInfo) => {
  const page = extension.settings
  await page.evaluate(rules => chrome.storage.local.set(rules), { requestHeaderRules: [header], networkRules: [] })
  await page.reload()
  const file = { format: 'overidify', version: 1, requestHeaderRules: [{ ...header, name: 'Updated auth' },
    { ...header, id: '10000000-0000-4000-8000-000000000006', name: 'New sibling', order: 1 }], networkRules: [] }
  let dialog = await chooseImport(page, file)
  await expect(dialog.getByRole('status')).toContainText('1 overlap')
  await dialog.getByRole('button', { name: 'Replace', exact: true }).click()
  await expect(dialog.getByText('Rules imported', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  expect((await exported(page)).requestHeaderRules.map((rule: { name: string }) => rule.name)).toEqual(['Updated auth', 'New sibling'])
  dialog = await chooseImport(page, file)
  await expect(dialog.getByRole('status')).toContainText('2 overlaps')
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(dialog.getByText('Rules imported', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  const added = (await exported(page)).requestHeaderRules
  expect(added.map((rule: { name: string }) => rule.name)).toEqual(['Updated auth', 'New sibling', 'Updated auth', 'New sibling'])
  expect(new Set(added.map((rule: { id: string }) => rule.id)).size).toBe(4)
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`selection-list-${width}.png`), fullPage: true, animations: 'disabled' })
    dialog = await chooseImport(page, file)
    await expect(dialog.getByRole('button', { name: 'Replace', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`import-review-${width}.png`), fullPage: true, animations: 'disabled' })
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  }
})
