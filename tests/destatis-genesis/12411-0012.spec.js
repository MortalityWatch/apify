import { test } from '@playwright/test'
import { dl } from '../lib'

test('test', async ({ page }) => {
  await page.goto(
    'https://www-genesis.destatis.de/genesis/online?operation=table&code=12411-0012#astructure'
  )
  await page.getByRole('button', { name: 'Zeit auswählen' }).click()
  await page.locator('input[name="ZI_ANZ_LETZTE"]').click()
  await page.locator('input[name="ZI_ANZ_LETZTE"]').fill('10')
  await page.getByRole('button', { name: 'übernehmen' }).click()

  await dl(page, 'destatis-genesis/12411-0012')
})
