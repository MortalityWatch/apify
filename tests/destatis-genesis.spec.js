import { test } from '@playwright/test'
import { dl } from './lib'

const id = process.env.TEST_ID

test('test', async ({ page }) => {
  await page.goto(
    `https://www-genesis.destatis.de/genesis/online?operation=table&code=${id}#astructure`
  )

  if (await page.getByRole('button', { name: 'Zeit auswählen' }).isVisible()) {
    await page.getByRole('button', { name: 'Zeit auswählen' }).click()
    await page.getByText('Alle verfügbaren Zeitangaben').click()
    await page.getByRole('button', { name: 'übernehmen' }).click()
  }

  await dl(page, `destatis-genesis/${id}`)
})
