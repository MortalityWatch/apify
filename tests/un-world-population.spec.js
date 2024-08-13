import { test } from '@playwright/test'

test('test', async ({ page }) => {
  await page.goto('https://population.un.org/wpp/Download/Standard/MostUsed/')
  const downloadPromise = page.waitForEvent('download')
  await page
    .getByRole('link', { name: 'Compact (most used: estimates' })
    .click()
  const download = await downloadPromise
  await download.saveAs(`./temp/un-world-population.xlsx`)
  await page.close()
})
