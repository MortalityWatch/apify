export const dl = async (page, filename) => {
  await page.getByRole('button', { name: 'Werteabruf' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Tabelle im Daten-CSV-Format' })
    .click()
  const download = await downloadPromise
  await download.saveAs(`./temp/${filename}.csv`)
  await page.close()
}

export const dlCdc = async (page, file, totals = true) => {
  await page.check('#export-option')
  await page.locator('#CO_show_totals').setChecked(totals)
  await page.check('#CO_show_zeros')
  await page.check('#CO_show_suppressed')

  await waitUntilLoaded(page)

  const downloadPromise = page.waitForEvent('download')
  await page.click('#submit-button1')
  const download = await downloadPromise
  await download.saveAs(file)
}

export const delay = (time) =>
  new Promise((resolve) => {
    setTimeout(resolve, time)
  })

export const waitUntilLoaded = async (page) => {
  await page.waitForFunction(() => document.readyState === 'complete')
  await delay(1000)
}
