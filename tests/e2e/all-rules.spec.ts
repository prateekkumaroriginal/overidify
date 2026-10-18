import { test, expect } from './extension'

test('All settings searches and updates every rule type', async ({ extension, networkRule, seed }) => {
  const page = extension.settings
  await page.evaluate(() => chrome.storage.local.set({ requestHeaderRules: [
    { kind: 'header-rule', id: 'headers', name: 'Request context', url: '*', enabled: true, order: 0,
      headers: [{ key: 'X-Context', value: 'local' }] },
    { kind: 'switch-rule', id: 'accounts', name: 'Accounts', url: '*', enabled: true, order: 1,
      selectedOptionId: 'admin', options: [
        { id: 'admin', name: 'Admin', headers: [{ key: 'X-Account', value: 'admin' }] },
        { id: 'guest', name: 'Guest', headers: [{ key: 'X-Account', value: 'guest' }] },
      ] },
  ] }))
  await seed([networkRule])
  await page.getByRole('tab', { name: 'All', exact: true }).click()
  await expect(page).toHaveURL(/#\/all$/)
  await expect(page.getByRole('switch')).toHaveCount(3)

  for (const name of ['Request context', 'Accounts', networkRule.name]) {
    const toggle = page.getByRole('switch', { name: `Enable ${name}`, exact: true })
    await toggle.click()
    await expect(toggle).not.toBeChecked()
    await expect(toggle).not.toHaveAttribute('aria-busy', 'true')
  }
  await page.getByRole('combobox', { name: 'Option for Accounts', exact: true }).click()
  await page.getByRole('option', { name: 'Guest', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('tab', { name: 'All', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('switch', { checked: false })).toHaveCount(3)
  await expect(page.getByRole('combobox', { name: 'Option for Accounts', exact: true })).toHaveText('Guest')

  const search = page.getByRole('textbox', { name: 'Search rules', exact: true })
  for (const [term, name] of [['X-Context', 'Request context'], ['Guest', 'Accounts'], [networkRule.requestUrl, networkRule.name]]) {
    await search.fill(term)
    await expect(page.getByRole('switch')).toHaveCount(1)
    await expect(page.getByRole('region')).toHaveCount(1)
    await expect(page.getByRole('switch', { name: `Enable ${name}`, exact: true })).toBeVisible()
  }
  await search.fill('no-such-rule')
  await expect(page.getByRole('heading', { name: 'No matching rules.' })).toBeVisible()
  await page.getByRole('button', { name: 'Show all rules', exact: true }).click()
  await expect(page.getByRole('switch')).toHaveCount(3)

  await search.fill('X-Context')
  await page.getByRole('tab', { name: 'Network Rules', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Search network rules' })).toHaveValue('')
  await page.getByRole('tab', { name: 'All', exact: true }).click()
  await expect(search).toHaveValue('X-Context')
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()

  for (const [name, route] of [['Request context', 'header-rules/headers'], ['Accounts', 'switch-rules/accounts'], [networkRule.name, `network-rules/${networkRule.id}`]]) {
    await page.getByRole('link').filter({ hasText: name }).click()
    expect(new URL(page.url()).hash).toBe(`#/${route}`)
    await page.goto(`chrome-extension://${extension.id}/options.html#/all`)
  }
})

