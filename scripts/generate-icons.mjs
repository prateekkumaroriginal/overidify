import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const source = await readFile(new URL('../src/assets/logo.png', import.meta.url))
const icons = new URL('../icons/', import.meta.url)
await mkdir(icons, { recursive: true })

// An inner keyline preserves the transparent silhouette and gap between the
// pieces while making the charcoal mark visible on dark browser toolbars.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <filter id="keyline" color-interpolation-filters="sRGB">
      <feMorphology in="SourceAlpha" operator="erode" radius="4" result="inset" />
      <feComposite in="SourceAlpha" in2="inset" operator="out" result="edge" />
      <feFlood flood-color="#d9d9de" result="ink" />
      <feComposite in="ink" in2="edge" operator="in" result="keyline" />
      <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="keyline" /></feMerge>
    </filter>
  </defs>
  <image width="128" height="128" href="data:image/png;base64,${source.toString('base64')}" filter="url(#keyline)" />
</svg>`

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  const rendered = await page.evaluate(async svg => {
    const image = new Image()
    image.src = `data:image/svg+xml;base64,${btoa(svg)}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    canvas.getContext('2d').drawImage(image, 0, 0)
    return canvas.toDataURL('image/png')
  }, svg)

  for (const size of [16, 32, 48, 128]) {
    const png = await page.evaluate(async ({ rendered, size }) => {
      const image = new Image()
      image.src = rendered
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const context = canvas.getContext('2d')
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, size, size)
      return canvas.toDataURL('image/png').split(',')[1]
    }, { rendered, size })
    await writeFile(new URL(`icon-${size}.png`, icons), Buffer.from(png, 'base64'))
  }
} finally {
  await browser.close()
}
