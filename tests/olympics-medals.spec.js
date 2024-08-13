import { test } from '@playwright/test'
import { writeFileSync, appendFileSync } from 'fs'

const years = [
  2024, 2020, 2016, 2012, 2008, 2004, 2000, 1996, 1992, 1988, 1984, 1980, 1976,
  1972, 1968, 1964, 1960, 1956, 1952, 1948, 1936, 1932, 1928, 1924, 1920, 1912,
  1908, 1904, 1900, 1896,
]

test('test', async ({ page }) => {
  const outputFile = './temp/olympics-medals.csv'
  writeFileSync(
    outputFile,
    'year,rank,country,medals,population,population_per_medal\n'
  )

  for (const year of years) {
    await page.goto(
      `https://www.medalspercapita.com/#medals-per-capita:${year}`
    )

    let rows = await page.$$eval(
      '#table-div > table > tbody > tr > td:nth-child(1) > table > tbody > tr',
      (rows) => {
        return rows.map((row) =>
          Array.from(row.querySelectorAll('td')).map((cell) =>
            cell.textContent.trim()
          )
        )
      }
    )

    // Convert data to CSV format and append the year to each row
    const csvRows = rows
      .slice(1)
      .map(
        (row) => `${year},${row.map((x) => x.replaceAll(',', '')).join(',')}`
      )
      .join('\n')

    // Append to the CSV file
    appendFileSync(outputFile, `${csvRows}\n`)
  }
})
