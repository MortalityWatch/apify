import { readFileSync, unlinkSync, writeFileSync } from 'fs'
import { gzipSync } from 'zlib'
import AdmZip from 'adm-zip'

export const dl = async (page, filename) => {
  await page
    .locator('#statistics-table-page-table-container')
    .getByLabel('Download')
    .click()
  await page.getByLabel('Qualitätskennzeichen').click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'CSV', exact: true }).click()
  const download = await downloadPromise
  const zipPath = `./temp/${filename}.zip`
  const gzPath = `./temp/${filename}.csv.gz`

  await download.saveAs(zipPath)

  // Extract the ZIP file
  const zip = new AdmZip(zipPath)
  const extractedFiles = zip.getEntries().map((entry) => entry.entryName)

  // Find the first CSV file inside the ZIP
  const csvFilename = extractedFiles.find((f) => f.endsWith('.csv'))
  if (!csvFilename) throw new Error('No CSV file found in ZIP!')

  zip.extractEntryTo(csvFilename, './temp', false, true)

  // Path to the extracted CSV file
  const csvPath = `./temp/${csvFilename}`

  // Compress the CSV as GZ
  const data = readFileSync(csvPath)
  const compressedData = gzipSync(data)
  writeFileSync(gzPath, compressedData)

  // Clean up extracted files
  unlinkSync(zipPath)
  unlinkSync(csvPath)

  await page.close()
}

export const dlCdc = async (page, totals = true, showSuppressed = true) => {
  const file = `./temp/${getCallerFileName()}.txt`
  console.log('Using filename:', file)

  await page.check('#export-option')
  await page.locator('#CO_show_totals').setChecked(totals)
  await page.check('#CO_show_zeros')
  if (showSuppressed) await page.check('#CO_show_suppressed')

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

export const getCallerFileName = () => {
  const stack = new Error().stack
  const callerLine = stack.split('\n')[3]
  const match = callerLine.match(/\/tests\/(.+?)\.spec\.js/)
  return match ? match[1] : 'unknown'
}
