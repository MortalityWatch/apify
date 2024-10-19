import { test } from '@playwright/test'
import { dlCdc } from '../lib'

test('test', async ({ page }) => {
  await page.goto('https://wonder.cdc.gov/mcd-icd10.html')
  await page.getByRole('button', { name: 'I Agree' }).click()
  await page.getByLabel('Group Results By').selectOption('D77.V1-level2')
  await page.locator('select[name="B_2"]').selectOption('D77.V51')
  await dlCdc(page, './temp/cdc-wonder/mcd-icd10-month-5y-neoplasm.txt')
})
