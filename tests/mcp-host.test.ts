import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { request } from 'node:http'
import { test } from 'node:test'
import type { AddressInfo } from 'node:net'
import { createMcpHttpServer } from '../mcp-host/server.ts'
import { encodeNativeMessage, readNativeMessages } from '../mcp-host/native-messaging.ts'
import { createChunkAssembler, splitNativeMessage } from '../src/lib/mcp-protocol.ts'
import type { HostToExtensionMessage, McpToolResult } from '../src/lib/mcp-protocol.ts'

const TOKEN = 'secret-token'
type Rpc = {
  result: { tools: { name: string }[]; protocolVersion: string; serverInfo: unknown; instructions: string }
  error: { code: number }
}

async function withServer(run: (send: (body: unknown, headers?: Record<string, string>, method?: string) => Promise<{ status: number; body: Rpc }>, calls: unknown[]) => Promise<void>) {
  const calls: unknown[] = []
  const server = createMcpHttpServer({
    token: TOKEN, version: '1.2.3', instructions: 'Use rules.',
    tools: [{ name: 'list_rules', description: 'List', inputSchema: { type: 'object' } }],
    callTool: async (name, args): Promise<McpToolResult> => { calls.push({ name, args }); return { content: [{ type: 'text', text: 'ok' }] } },
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const send = (body: unknown, headers: Record<string, string> = {}, method = 'POST') => new Promise<{ status: number; body: Rpc }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/mcp', method, headers: {
      'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, ...headers,
    } }, response => {
      let text = ''
      response.on('data', chunk => { text += chunk })
      response.on('end', () => {
        let parsed: unknown = text
        try { parsed = JSON.parse(text) } catch { /* Plain-text error. */ }
        resolve({ status: response.statusCode!, body: parsed as Rpc })
      })
    })
    req.on('error', reject)
    req.end(method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body))
  })
  try { await run(send, calls) } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
}

test('the endpoint rejects unauthenticated, browser, and DNS-rebound requests before reaching tools', async () => {
  await withServer(async (send, calls) => {
    const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_rules' } }
    assert.equal((await send(call, { authorization: '' })).status, 401)
    assert.equal((await send(call, { authorization: 'Bearer wrong' })).status, 401)
    assert.equal((await send(call, { origin: 'http://localhost:4200' })).status, 403)
    assert.equal((await send(call, { host: 'attacker.example:47821' })).status, 403)
    assert.equal((await send(call, { 'content-type': 'text/plain' })).status, 415)
    assert.equal((await send(call, {}, 'GET')).status, 405)
    assert.equal((await send(call, { 'mcp-protocol-version': '1999-01-01' })).status, 400)
    assert.deepEqual(calls, [])
    assert.equal((await send(call, { host: 'localhost:47821' })).status, 200)
    assert.equal(calls.length, 1)
  })
})

test('JSON-RPC methods negotiate the protocol, list tools, relay calls, and acknowledge notifications', async () => {
  await withServer(async (send, calls) => {
    const init = await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } })
    assert.deepEqual(init.body.result.serverInfo, { name: 'overidify', title: 'Overidify', version: '1.2.3' })
    assert.equal(init.body.result.protocolVersion, '2025-06-18')
    assert.equal(init.body.result.instructions, 'Use rules.')
    const future = await send({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2099-01-01' } })
    assert.equal(future.body.result.protocolVersion, '2025-11-25')

    assert.deepEqual(await send({ jsonrpc: '2.0', method: 'notifications/initialized' }), { status: 202, body: '' })
    assert.deepEqual((await send({ jsonrpc: '2.0', id: 3, method: 'tools/list' })).body.result.tools.map(tool => tool.name), ['list_rules'])
    const call = await send({ jsonrpc: '2.0', id: 'call', method: 'tools/call', params: { name: 'list_rules', arguments: { type: 'header' } } })
    assert.deepEqual(call.body, { jsonrpc: '2.0', id: 'call', result: { content: [{ type: 'text', text: 'ok' }] } })
    assert.deepEqual(calls, [{ name: 'list_rules', args: { type: 'header' } }])

    assert.equal((await send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope' } })).body.error.code, -32602)
    assert.equal((await send({ jsonrpc: '2.0', id: 5, method: 'resources/list' })).body.error.code, -32601)
    assert.equal((await send('{bad json')).body.error.code, -32700)
    const batch = await send([{ jsonrpc: '2.0', id: 6, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/cancelled' }])
    assert.deepEqual(batch.body, [{ jsonrpc: '2.0', id: 6, result: {} }])
  })
})

test('native messages round-trip through framing and messages over Chrome\'s 1 MB limit are chunked', async () => {
  const body = 'é'.repeat(700_000)
  const message: HostToExtensionMessage = { type: 'call', id: 9, name: 'create_network_rule', arguments: { body } }
  const parts = splitNativeMessage(message, 1)
  assert.ok(parts.length > 1)
  for (const part of parts) assert.ok(encodeNativeMessage(part).length < 1024 * 1024)
  assert.deepEqual(splitNativeMessage({ type: 'call', id: 1, name: 'list_rules', arguments: {} }, 2).length, 1)

  const stream = new PassThrough()
  const received: unknown[] = []
  readNativeMessages(stream, value => received.push(value))
  const bytes = Buffer.concat(parts.map(encodeNativeMessage))
  // Deliver arbitrary slices, as pipes do.
  for (let offset = 0; offset < bytes.length; offset += 65_521) stream.write(bytes.subarray(offset, offset + 65_521))
  await new Promise(resolve => setImmediate(resolve))
  const assemble = createChunkAssembler()
  const assembled = received.map(part => (part as HostToExtensionMessage).type === 'chunk'
    ? assemble(part as Extract<HostToExtensionMessage, { type: 'chunk' }>) : part).filter(Boolean)
  assert.deepEqual(assembled, [message])
})
