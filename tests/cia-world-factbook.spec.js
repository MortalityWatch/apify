import { test } from '@playwright/test'

const file = process.env.TEST_ID
const filename = 'cia-world-factbook/' + file

test('test', async ({ page }) => {
  await page.goto(
    'https://www.cia.gov/the-world-factbook/field/' +
      file +
      '/country-comparison/'
  )
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Data' }).click()
  const download = await downloadPromise
  await download.saveAs(`./temp/${filename}.csv`)
  await page.close()
})
