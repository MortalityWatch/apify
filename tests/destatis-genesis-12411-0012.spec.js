import { test } from '@playwright/test'
import { dl } from './lib'

test('test', async ({ page }) => {
  await page.goto(
    'https://www-genesis.destatis.de/genesis/online?operation=table&code=12411-0012#astructure'
  )

  await dl(page, 'destatis-genesis-12411-0012')
})
