import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, fetchResult } from './extension'

async function freePort() {
  const server = createServer()
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  await new Promise(done => server.close(done))
  if (!address || typeof address === 'string') throw new Error('No free port.')
  return address.port
}

test('an MCP agent creates rules that the browser applies to real requests', async ({ extension, site, server }) => {
  const home = await mkdtemp(join(tmpdir(), 'overidify-mcp-home-'))
  try {
    const port = await freePort()
    await extension.settings.evaluate(port => chrome.storage.local.set({ mcpSettings: { enabled: false, port, token: '' } }), port)
    await extension.settings.goto(`chrome-extension://${extension.id}/options.html#/mcp`)
    await extension.settings.getByRole('switch', { name: 'MCP server enabled' }).click()

    // The downloaded setup file is self-contained: it carries the helper and this extension's ID.
    const [download] = await Promise.all([
      extension.settings.waitForEvent('download'),
      extension.settings.getByRole('button', { name: 'Download setup file', exact: true }).click(),
    ])
    const setup = join(home, download.suggestedFilename())
    await download.saveAs(setup)
    // Chrome reads native host manifests from the profile's NativeMessagingHosts folder.
    execFileSync(process.execPath, [setup, '--browser-dir', extension.profile], { cwd: home, env: { PATH: process.env.PATH, HOME: home } })
    // The page keeps retrying while setup is needed, so no Retry click is required.
    await expect(extension.settings.getByRole('status')).toContainText(`Running at http://127.0.0.1:${port}/mcp`)
    const token = await extension.settings.evaluate(async () => ((await chrome.storage.local.get('mcpSettings')).mcpSettings as { token: string }).token)

    let id = 0
    const rpc = async (method: string, params: Record<string, unknown>) => {
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` },
      })
      expect(response.status).toBe(200)
      return (await response.json()).result
    }
    expect((await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } })).serverInfo.name).toBe('overidify')
    const website = new URL(server.origin).host
    const header = await rpc('tools/call', { name: 'create_header_rule', arguments: { name: 'Agent header', websites: [website], headers: [{ name: 'X-Agent', value: 'created' }] } })
    expect(header.isError).toBeUndefined()
    const network = await rpc('tools/call', { name: 'create_network_rule', arguments: {
      name: 'Agent mock', websites: [website], requestUrl: `${server.origin}/api/start?a=1&b=2`, status: 202, body: '{"agent":true}',
    } })
    expect(network.structuredContent.activation.applied).toBe(true)

    await site.goto(server.origin)
    expect(await fetchResult(site)).toMatchObject({ status: 202, body: '{"agent":true}' })
    await fetchResult(site, '/api/other')
    expect(server.hits.at(-1)?.headers['x-agent']).toBe('created')
    await expect(extension.settings.evaluate(async () => (await chrome.storage.local.get('requestHeaderRules')).requestHeaderRules))
      .resolves.toMatchObject([{ name: 'Agent header', url: website }])
  } finally { await rm(home, { recursive: true, force: true }) }
})
