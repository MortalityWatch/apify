import { test } from '@playwright/test'
import { dlCdc } from '../lib'

test('test', async ({ page }) => {
  await page.goto('https://wonder.cdc.gov/mcd-icd10-provisional.html')
  await page.getByRole('button', { name: 'I Agree' }).click()
  await page.getByLabel('Group Results By').selectOption('D176.V1-level2')
  await page.locator('select[name="B_2"]').selectOption('D176.V51')
  await page
    .getByRole('cell', {
      name: 'UCD - ICD-10 Codes    *All*  (All Causes of Death)',
      exact: true,
    })
    .getByLabel('UCD - ICD-10 Codes')
    .selectOption('C00-D48')
  await dlCdc(page, './temp/cdc-wonder/provisional-month-5y-ucd-neoplasm.txt')
})
