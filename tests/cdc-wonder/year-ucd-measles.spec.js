import { test } from '@playwright/test'
import { dlCdc, waitUntilLoaded } from '../lib'

test('test', async ({ page }) => {
  await page.goto('https://wonder.cdc.gov/mcd-icd10.html')
  await page.getByRole('button', { name: 'I Agree' }).click()

  await page.getByLabel('Group Results By').selectOption('D77.V1-level1')

  await page
    .getByRole('cell', {
      name: 'UCD - ICD-10 Codes    *All*  (All Causes of Death)',
      exact: true,
    })
    .getByLabel('UCD - ICD-10 Codes')
    .selectOption('A00-B99')
  await waitUntilLoaded(page)

  await page.locator('input[name="finder-action-D77\\.V2-Open Fully"]').click()
  await waitUntilLoaded(page)

  await page.locator('select[id="codes-D77.V2"]').selectOption('B05')
  await waitUntilLoaded(page)

  await dlCdc(page)
})
