import { test } from '@playwright/test'
import { dlCdc } from '../lib'

test('test', async ({ page }) => {
  await page.goto('https://wonder.cdc.gov/mcd-icd10-provisional.html')
  await page.getByRole('button', { name: 'I Agree' }).click()

  await page.getByLabel('Group Results By').selectOption('D176.V9-level1')
  await page.locator('select[name="B_2"]').selectOption('D176.V1-level1')
  await page.locator('select[name="B_3"]').selectOption('D176.V2-level1')

  await dlCdc(page)
})
