import { test } from '@playwright/test'

const query = JSON.parse(decodeURI(process.env.QUERY))
const url = query.url
const file = './temp/screengrab/' + process.env.FILE
const selector = query.selector
const width = query.viewportWidth ? parseInt(query.viewportWidth) : 1920
const height = query.viewportHeight ? parseInt(query.viewportHeight) : 1080
const clip =
  query.x && query.width && query.y && query.height
    ? {
        x: parseInt(query.x),
        y: parseInt(query.y),
        width: parseInt(query.width),
        height: parseInt(query.height),
      }
    : undefined
const fullPage = query.fullPage ? Boolean(parseInt(query.fullPage)) : undefined
test.use({
  timeout: 10000,
  deviceScaleFactor: 2,
  viewport: { width, height },
})

test('test', async ({ page }) => {
  await page.goto(url)
  const options = { path: file }
  if (clip) options.clip = clip
  if (fullPage) options.fullPage = fullPage
  console.log(options)
  if (selector) {
    const element = await page.waitForSelector(selector, {
      state: 'visible',
      timeout: 10000,
    })
    if (!element) {
      console.log('Element not found:', selector)
    } else {
      await element.screenshot(options)
    }
  } else {
    await page.screenshot(options)
  }
})
