import { test } from '@playwright/test'
import { dlCdc, openVaersRequestForm } from '../lib'

test('test', async ({ page }) => {
  await openVaersRequestForm(page)
  await page.locator('select[name="B_1"]').selectOption('D8.V18-level2')
  await dlCdc(page, true, false)
})
