import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Plugin } from 'vite'

export function favicon(): Plugin {
  let root: string
  return {
    name: 'overidify-favicon',
    apply: 'build',
    configResolved(config) {
      root = config.root
    },
    async buildStart() {
      const sizes = [16, 32, 48, 128]
      const images = await Promise.all(sizes.map(size => readFile(join(root, 'icons', `icon-${size}.png`))))
      // ICO directory entries point to the original PNG payloads, preserving transparency.
      const directory = Buffer.alloc(6 + 16 * images.length)
      directory.writeUInt16LE(1, 2)
      directory.writeUInt16LE(images.length, 4)
      let offset = directory.length
      for (const [index, image] of images.entries()) {
        const entry = 6 + 16 * index
        directory[entry] = sizes[index]
        directory[entry + 1] = sizes[index]
        directory.writeUInt16LE(1, entry + 4)
        directory.writeUInt16LE(32, entry + 6)
        directory.writeUInt32LE(image.length, entry + 8)
        directory.writeUInt32LE(offset, entry + 12)
        offset += image.length
      }
      const source = Buffer.concat([directory, ...images])
      await writeFile(join(root, 'favicon.ico'), source)
      this.emitFile({ type: 'asset', fileName: 'favicon.ico', source })
    },
  }
}
