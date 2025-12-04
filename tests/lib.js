import { readFileSync, unlinkSync, writeFileSync } from 'fs'
import { gzipSync } from 'zlib'
import AdmZip from 'adm-zip'

const dlInternal = async (page, filename, flat = false) => {
  // Make sure that 'Qualitätskennzeichen' is not checked.
  const qualityLabel = page.getByLabel('Qualitätskennzeichen')
  if (await qualityLabel.isChecked()) await qualityLabel.click()

  // Add 10-second timeout to download waiting
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 })
  await page.getByRole('button', { name: flat ? 'CSV (Flat)' : 'CSV', exact: true }).click()

  try {
    const download = await downloadPromise
    const zipPath = `./temp/${filename}.zip`
    const csvPath = `./temp/${filename}.csv`
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
    const extractedCsvPath = `./temp/${csvFilename}`

    // Read the CSV data
    const data = readFileSync(extractedCsvPath)
    
    // Save the CSV file with the desired filename
    writeFileSync(csvPath, data)
    
    // Compress the CSV as GZ
    const compressedData = gzipSync(data)
    writeFileSync(gzPath, compressedData)

    // Clean up temporary files (keep both csv and csv.gz)
    unlinkSync(zipPath)
    unlinkSync(extractedCsvPath)
  } catch (error) {
    if (error.message.includes('Timeout')) {
      throw new Error('Download timed out after 10 seconds')
    }
    throw error
  }
}

export const dl = async (page, filename, flat = false, maxRetries = 10) => {
  await page
    .locator('#statistics-table-page-table-container')
    .getByLabel('Download')
    .click()

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Download attempt ${attempt} for ${filename}${flat ? ' (flat)' : ''}`)
      await dlInternal(page, filename, flat)
      console.log(`Successfully downloaded ${filename} on attempt ${attempt}`)
      await page.close()
      return
    } catch (error) {
      console.log(`Attempt ${attempt} failed:`, error.message)

      if (attempt < maxRetries) {
        console.log('Waiting 3 seconds before retry...')
        await delay(3000)
        // Try to reset page state
        try {
          await page.reload({ waitUntil: 'networkidle' })
        } catch (e) {
          console.log('Error during page reload:', e.message)
        }
      } else {
        await page.close()
        throw new Error(
          `Failed to download ${filename} after ${maxRetries} attempts: ${error.message}`
        )
      }
    }
  }
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
