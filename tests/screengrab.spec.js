import { test } from '@playwright/test'

const url = process.env.URL
const file = process.env.FILE
const selector = process.env.SELECTOR ?? '#chart'
const width = process.env.WIDTH ?? 720
const height = process.env.HEIGHT ?? 480

test.use({ deviceScaleFactor: 2, viewport: { width, height } })

test('test', async ({ page }) => {
  await page.goto(url)
  await page.locator(selector).screenshot({ path: './temp/screengrab/' + file })
})
