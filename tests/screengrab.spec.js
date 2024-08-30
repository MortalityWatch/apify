import { test } from '@playwright/test'

const query = JSON.parse(decodeURI(process.env.QUERY))
const url = query.url
const file = process.env.FILE
const selector = query.selector
const width = query.width ? parseInt(query.width) : 720
const height = query.height ? parseInt(query.width) : 480

test.use({ timeout: 10, deviceScaleFactor: 2, viewport: { width, height } })

test('test', async ({ page }) => {
  const options = { path: './temp/screengrab/' + file }
  await page.goto(url)
  if (selector) {
    await page.locator(selector).screenshot(options)
  } else {
    await page.screenshot(options)
  }
})
