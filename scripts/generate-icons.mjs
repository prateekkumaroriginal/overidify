import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const source = await readFile(new URL('../src/assets/logo.svg', import.meta.url), 'utf8')
const icons = new URL('../icons/', import.meta.url)
await mkdir(icons, { recursive: true })

// Chrome's management card uses a static manifest icon. A filled light mark
// with a thin dark inner edge stays visible on light and dark backgrounds.
const withFallbackKeyline = artwork => `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <filter id="keyline" color-interpolation-filters="sRGB">
      <feMorphology in="SourceAlpha" operator="erode" radius="2" result="inset" />
      <feComposite in="SourceAlpha" in2="inset" operator="out" result="edge" />
      <feFlood flood-color="#343438" result="ink" />
      <feComposite in="ink" in2="edge" operator="in" result="keyline" />
      <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="keyline" /></feMerge>
    </filter>
  </defs>
  <image width="128" height="128" href="data:image/svg+xml;base64,${Buffer.from(artwork).toString('base64')}" filter="url(#keyline)" />
</svg>`

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  const dark = await page.evaluate(source => {
    const document = new DOMParser().parseFromString(source, 'image/svg+xml')
    const body = document.querySelector('[data-body]')
    if (!body) throw new Error('The source SVG must identify its main shape with data-body.')
    // Recolor the main shape explicitly; the violet geometry and fill are shared.
    body.setAttribute('fill', '#f0f0f0')
    return new XMLSerializer().serializeToString(document)
  }, source)

  for (const [theme, artwork] of Object.entries({ fallback: withFallbackKeyline(dark), light: source, dark })) {
    const directory = theme === 'fallback' ? icons : new URL(`${theme}/`, icons)
    await mkdir(directory, { recursive: true })
    for (const size of [16, 32, 48, 128]) {
      const png = await page.evaluate(async ({ artwork, size }) => {
        const image = new Image()
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artwork)}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = size
        const context = canvas.getContext('2d')
        context.imageSmoothingQuality = 'high'
        context.drawImage(image, 0, 0, size, size)
        return canvas.toDataURL('image/png').split(',')[1]
      }, { artwork, size })
      await writeFile(new URL(`icon-${size}.png`, directory), Buffer.from(png, 'base64'))
    }
  }
} finally {
  await browser.close()
}
