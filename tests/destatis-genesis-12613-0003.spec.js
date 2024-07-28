import { test } from '@playwright/test'
import { dl } from './lib'

test('test', async ({ page }) => {
  await page.goto(
    'https://www-genesis.destatis.de/genesis/online?operation=table&code=12613-0003#astructure'
  )
  await page.getByRole('button', { name: 'Zeit auswählen' }).click()
  await page.getByText('Alle verfügbaren Zeitangaben').click()
  await page.getByRole('button', { name: 'übernehmen' }).click()

  await dl(page, 'destatis-genesis-12613-0003')
})
