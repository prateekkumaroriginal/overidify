import type { Readable } from 'node:stream'

// Chrome frames each message as a 32-bit native-endian length followed by UTF-8 JSON.
export function encodeNativeMessage(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  const header = Buffer.alloc(4)
  header.writeUInt32LE(body.length)
  return Buffer.concat([header, body])
}

export function readNativeMessages(input: Readable, onMessage: (message: unknown) => void): void {
  let buffered = Buffer.alloc(0)
  input.on('data', (chunk: Buffer) => {
    buffered = Buffer.concat([buffered, chunk])
    while (buffered.length >= 4) {
      const length = buffered.readUInt32LE(0)
      if (buffered.length < 4 + length) break
      const body = buffered.subarray(4, 4 + length)
      buffered = buffered.subarray(4 + length)
      onMessage(JSON.parse(body.toString('utf8')))
    }
  })
}
