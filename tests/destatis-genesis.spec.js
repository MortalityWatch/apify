import { test } from '@playwright/test'
import { dl } from './lib'

const id = process.env.TEST_ID

test('test', async ({ page }) => {
  const codes = id.split('-')
  await page.goto(
    `https://www-genesis.destatis.de/datenbank/online/statistic/${codes[0]}/table/${id}/table-toolbar`,
    { waitUntil: 'networkidle' }
  )

  // Select All Years
  if ((await page.locator('[data-id="colTitle.0"]').count()) > 0) {
    await page.click('[data-id="colTitle.0"]')
    if ((await page.locator('#Checkbox_3').count()) > 0) {
      await page.click('#Checkbox_3')
      await page.getByRole('button', { name: 'Anwenden' }).click()
    }
  }

  // Select All Years
  if (
    (await page
      .getByLabel(
        '[id="colTitle\\.0"] > .advanced-select-input-control > .advanced-select-input-control-icon'
      )
      .count()) > 0
  ) {
    await page
      .getByLabel(
        '[id="colTitle\\.0"] > .advanced-select-input-control > .advanced-select-input-control-icon'
      )
      .click()
    if (
      (await page.getByRole('checkbox', { name: 'Alles auswählen' }).count()) >
      0
    ) {
      await page.getByRole('checkbox', { name: 'Alles auswählen' }).click()
      await page.getByRole('button', { name: 'Anwenden' }).click()
    }
  }

  // Select All Years
  if ((await page.getByLabel('Merkmal: Stichtag').count()) > 0) {
    await page.getByLabel('Merkmal: Stichtag').click()
    if (
      (await page.getByRole('checkbox', { name: 'Alles auswählen' }).count()) >
      0
    ) {
      await page.getByRole('checkbox', { name: 'Alles auswählen' }).click()
      await page.getByRole('button', { name: 'Anwenden' }).click()
    }
  }

  await dl(page, `destatis-genesis/${id}`)
})
