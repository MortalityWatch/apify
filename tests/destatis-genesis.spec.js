import { test } from '@playwright/test'
import { dl } from './lib'

const id = process.env.TEST_ID

test('test', async ({ page }) => {
  const codes = id.split('-')
  await page.goto(
    `https://www-genesis.destatis.de/datenbank/online/statistic/${codes[0]}/table/${id}/table-toolbar`
  )
  await page.click('[data-id="colTitle.0"]')
  await page.click('#Checkbox_3')
  await page.getByRole('button', { name: 'Anwenden' }).click()

  await dl(page, `destatis-genesis/${id}`)
})
