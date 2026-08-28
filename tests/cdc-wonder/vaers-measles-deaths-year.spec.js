import { test } from '@playwright/test'
import { dlCdc, openVaersRequestForm } from '../lib'

const measlesVaccineProductIds = [
  'MM',
  'MER',
  'MEA',
  'MMR',
  'MMRV',
]

test('test', async ({ page }) => {
  await openVaersRequestForm(page)
  await page.locator('select[name="B_1"]').selectOption('D8.V18-level1')

  await page.locator('select[id="codes-D8.V14"]').selectOption(measlesVaccineProductIds)
  await page.getByLabel('Event Category').selectOption('DTH')

  await dlCdc(page, true, false, false)
})
