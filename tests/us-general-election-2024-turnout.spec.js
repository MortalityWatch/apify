import { test } from '@playwright/test'

test('test', async ({ page }) => {
  await page.goto('https://election.lab.ufl.edu/2024-general-election-turnout/')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download CSV' }).click()
  const download = await downloadPromise
  await download.saveAs(`./temp/us-general-election-2024-turnout.csv`)
  await page.close()
})
