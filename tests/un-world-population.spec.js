import { test } from '@playwright/test'

test('test', async ({ page }) => {
  await page.goto('https://population.un.org/wpp/downloads')
  const downloadPromise = page.waitForEvent('download')
  await page
    .getByRole('link', {
      name: 'Compact (most used: estimates and medium projections) (XLSX)',
    })
    .click()
  const download = await downloadPromise
  await download.saveAs(`./temp/un-world-population.xlsx`)
  await page.close()
})
