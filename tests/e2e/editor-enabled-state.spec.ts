import { test, expect } from './extension'

const id = '00000000-0000-4000-8000-000000000061'
const rule = { kind: 'header-rule', id, name: 'Stage API', url: '*', enabled: true, order: 0, headers: [{ key: 'X-Stage', value: 'on' }] }
const storedEnabled = (page: import('@playwright/test').Page) =>
  page.evaluate(async () => ((await chrome.storage.local.get('requestHeaderRules')).requestHeaderRules as { enabled: boolean }[])[0].enabled)

// Another page, such as Variables, can turn a rule off while its editor is open.
async function openEditorThenTurnOffElsewhere({ extension }: { extension: { settings: import('@playwright/test').Page; context: import('@playwright/test').BrowserContext; id: string } }) {
  const editor = extension.settings
  await editor.evaluate(rule => chrome.storage.local.set({ requestHeaderRules: [rule] }), rule)
  await editor.goto(`chrome-extension://${extension.id}/options.html#/header-rules/${id}`)
  const toggle = editor.getByRole('switch', { name: 'Header rule enabled' })
  await expect(toggle).toBeChecked()
  return { editor, toggle, turnOff: async () => {
    const other = await extension.context.newPage()
    await other.goto(`chrome-extension://${extension.id}/options.html#/all`)
    await other.evaluate(rule => chrome.storage.local.set({ requestHeaderRules: [{ ...rule, enabled: false }] }), rule)
    await other.close()
  } }
}

test('an open editor keeps a rule turned off elsewhere when Save changes something else', async ({ extension }) => {
  const { editor, toggle, turnOff } = await openEditorThenTurnOffElsewhere({ extension })
  await turnOff()
  await expect(toggle).not.toBeChecked()
  await editor.getByPlaceholder('e.g. Authenticated API').fill('Stage API renamed')
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await editor.waitForURL(/#\/header-rules$/)
  expect(await storedEnabled(editor)).toBe(false)
})

test('an explicit toggle choice wins over a stored update that arrives later', async ({ extension }) => {
  const { editor, toggle, turnOff } = await openEditorThenTurnOffElsewhere({ extension })
  await toggle.click()
  await toggle.click()
  await turnOff()
  await expect(toggle).toBeChecked()
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await editor.waitForURL(/#\/header-rules$/)
  expect(await storedEnabled(editor)).toBe(true)
})
