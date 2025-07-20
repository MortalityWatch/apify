import { test } from '@playwright/test'
import { dlCdc } from '../lib'

test('test', async ({ page }) => {
  await page.goto('https://wonder.cdc.gov/vaers.html')
  await page.getByRole('button', { name: 'I have read and understand' }).click()
  await page.getByRole('button', { name: 'VAERS Data Search' }).click()
  await page.getByLabel('Group Results By').selectOption('D8.V18-level2')
  await dlCdc(page, true, false)
})
