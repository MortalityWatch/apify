import { test } from '@playwright/test'
import { dlCdc } from '../lib'

test('test', async ({ page }) => {
  await page.goto('https://wonder.cdc.gov/mcd-icd10.html')
  await page.getByRole('button', { name: 'I Agree' }).click()
  await page.getByLabel('Group Results By').selectOption('D77.V1-level2')
  await page.locator('select[name="B_2"]').selectOption('D77.V51')
  await page
    .getByRole('cell', {
      name: 'MCD - ICD-10 Codes    *All*  (All Causes of Death)',
      exact: true,
    })
    .getByLabel('MCD - ICD-10 Codes')
    .selectOption('C00-D48')
  await page
    .getByRole('button', { name: 'Move Items Over <<<' })
    .first()
    .click()
  await dlCdc(page, './temp/cdc-wonder/month-5y-mcd-neoplasm.txt')
})
