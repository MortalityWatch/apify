import { test } from '@playwright/test'
import { dl } from './lib'

const id = process.env.TEST_ID
const flat = process.env.FLAT === '1'

test('test', async ({ page }) => {
  const codes = id.split('-')
  await page.goto(
    `https://www-genesis.destatis.de/datenbank/online/statistic/${codes[0]}/table/${id}/table-toolbar`,
    { waitUntil: 'networkidle' }
  )

  // Select All Years
  if (
    (await page
      .locator('.gor-table-toolbar-filter-input-control')
      .first()
      .textContent()) == 'Merkmal: Jahr'
  ) {
    await page.click('[data-id="colTitle.0"]')
    if ((await page.locator('#Checkbox_3').count()) > 0) {
      await page.click('#Checkbox_3')
      await page.getByRole('button', { name: 'Anwenden' }).click()
    }
  } else if (
    (await page.getByLabel('Merkmal: Jahr').locator('svg').count()) > 0
  ) {
    await page.getByLabel('Merkmal: Jahr').locator('svg').click()
    if (
      (await page.getByRole('checkbox', { name: 'Alles auswählen' }).count()) >
      0
    ) {
      await page.getByRole('checkbox', { name: 'Alles auswählen' }).click()
    }
    await page.getByRole('button', { name: 'Anwenden' }).click()
  } else if (
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

  const filename = flat ? `destatis-genesis/${id}-flat` : `destatis-genesis/${id}`
  await dl(page, filename, flat)
})
