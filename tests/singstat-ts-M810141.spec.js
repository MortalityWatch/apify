import { test } from '@playwright/test'

const filename = 'singstat-ts-M810141'

test('test', async ({ page }) => {
  await page.goto('https://tablebuilder.singstat.gov.sg/table/TS/M810141')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Skip').click()
  await page.getByLabel('Close', { exact: true }).click()
  await page.getByRole('button', { name: 'Download data' }).click()
  await page.getByLabel('CSV').check()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const download = await downloadPromise
  await download.saveAs(`./temp/${filename}.csv`)
  await page.close()
})
