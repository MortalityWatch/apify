import { test } from '@playwright/test'

test('test', async ({ page }) => {
  // Login to mortality.org
  await page.goto('https://mortality.org/Account/Login')
  await page.getByRole('textbox', { name: 'Email' }).click()
  await page.getByRole('textbox', { name: 'Email' }).fill('usmortality@protonmail.com')
  await page.getByRole('textbox', { name: 'Password' }).click()
  await page.getByRole('textbox', { name: 'Password' }).fill('uem-ezg0FAF7ezx0cud')
  await page.getByRole('button', { name: 'Login' }).click()

  // Wait for login to complete
  await page.waitForURL('**/Home/**')

  // Download the STMF CSV file
  const downloadPromise = page.waitForEvent('download')
  // Navigation will abort because it's a file download, but download event still fires
  await page.goto('https://mortality.org/File/GetDocument/Public/STMF/Outputs/stmf.csv').catch(() => {})
  const download = await downloadPromise
  await download.saveAs('./temp/mortality-org-stmf.csv')
  await page.close()
})
