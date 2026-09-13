import { test } from '@playwright/test'
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'fs'

const TEST_ID = process.env.TEST_ID || 'games'
const OUT_DIR = './temp/ksc'
const START_URL = process.env.KSC_START_URL || 'https://tickets.ksc.de/shop/5'
const QUEUE_TIMEOUT_MS = Number(process.env.KSC_QUEUE_TIMEOUT_MS || 20 * 60 * 1000)

const OFFICIAL_CAPACITY = {
  total: 33180,
  guestTotal: 3500,
  homeNeutral: 29680,
}

test.setTimeout(Number(process.env.KSC_TEST_TIMEOUT_MS || 19 * 60 * 1000))

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const slug = (value) =>
  String(value || 'match')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'match'

const classifyFill = (fill) => {
  const value = String(fill || '').toLowerCase()
  if (value.includes('taken-seat')) return 'sold'
  if (value === 'rgb(0, 75, 147)' || value === '#004b93') return 'resale'
  if (
    value === 'rgb(0, 92, 169)' ||
    value === 'rgb(0, 123, 169)' ||
    value === 'rgb(0, 123, 196)' ||
    value === 'rgb(0, 159, 227)' ||
    value === 'rgb(122, 180, 229)' ||
    value === '#005ca9' ||
    value === '#007bc4' ||
    value === '#009fe3' ||
    value.includes('highlighted-additional-seat')
  ) return 'available'
  if (value === 'rgb(238, 116, 9)' || value === '#ee7409') return 'sightRestricted'
  return 'other'
}

const writeJson = (name, payload) => {
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(`${OUT_DIR}/${name}.json`, JSON.stringify(payload, null, 2))
}

async function waitOutQueue(page) {
  const started = Date.now()
  while (page.url().includes('waitingroom.ticketing.cloud.sap')) {
    if (Date.now() - started > QUEUE_TIMEOUT_MS) {
      throw new Error(`Still in SAP waiting room after ${QUEUE_TIMEOUT_MS}ms`)
    }
    const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')
    const place = text.match(/PLATZ:\s*(\d+)/i)?.[1]
    console.log(place ? `Waiting room position ${place}` : 'Waiting room active')
    await delay(15000)
  }
}

async function dismissCookies(page) {
  for (const name of [/Nur notwendige Cookies/i, /Auswahl speichern/i, /Cookies zulassen/i]) {
    await page.getByRole('button', { name }).first().click({ timeout: 2500 }).catch(() => {})
  }
}

async function loginIfNeeded(page) {
  const email = process.env.KSC_EMAIL
  const password = process.env.KSC_PASSWORD
  if (!email || !password) return false

  let body = await page.locator('body').innerText().catch(() => '')
  if (/EINGELOGGT ALS/i.test(body)) return true

  await page.getByText(/Login\s+KSC-ID/i).first().click({ timeout: 6000 }).catch(() => {})
  await page.getByRole('link', { name: /Zum Log-In|Registrieren|Log-In/i }).first().click({ timeout: 8000 }).catch(() => {})
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await waitOutQueue(page)

  const passwordField = page.locator('input[type="password"]').first()
  if (!(await passwordField.isVisible({ timeout: 10000 }).catch(() => false))) return false

  await page
    .locator('input[type="email"], input[name*="user" i], input[id*="user" i], input[name*="email" i], input[id*="email" i], input[name="username"]')
    .first()
    .fill(email)
  await passwordField.fill(password)
  await page.locator('input[type="submit"], button').first().click({ timeout: 10000 }).catch(async () => {
    await passwordField.press('Enter')
  })
  await page.waitForLoadState('networkidle').catch(() => {})
  await waitOutQueue(page)
  return true
}

async function openShop(page) {
  await page.goto(START_URL, { waitUntil: 'domcontentloaded' })
  await waitOutQueue(page)
  await dismissCookies(page)
  await loginIfNeeded(page)
  await page.goto(START_URL, { waitUntil: 'domcontentloaded' })
  await waitOutQueue(page)
  await dismissCookies(page)
}

async function openHeim(page) {
  await page.getByText(/^HEIM$/i).first().click({ timeout: 10000, force: true }).catch(async () => {
    await page.mouse.click(300, 310)
  })
  await page.waitForLoadState('networkidle').catch(() => {})
  await delay(1500)
  await waitOutQueue(page)
}

async function readGames(page) {
  const parsed = await page.evaluate(() => {
    const body = document.body.innerText.replace(/\s+/g, ' ')
    const monthNumbers = {
      JAN: '01',
      FEB: '02',
      MAR: '03',
      APR: '04',
      MAI: '05',
      MAY: '05',
      JUN: '06',
      JUL: '07',
      AUG: '08',
      SEP: '09',
      OKT: '10',
      OCT: '10',
      NOV: '11',
      DEZ: '12',
      DEC: '12',
    }
    const games = []
    const re = /(\d{1,2})\s+([A-ZÄÖÜ]{3})\.\s+KARLSRUHER SC\s+(.+?)\s+([A-Z][a-z]{1,2}\.)\s+(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})\s+BBBank Wildpark,\s+Karlsruhe\s+TICKETS/g
    let match
    while ((match = re.exec(body))) {
      const opponent = match[3].trim()
      games.push({
        opponent,
        title: `Karlsruher SC - ${opponent}`,
        date: `${match[7]}-${match[6]}-${match[5]}`,
        time: match[8],
        weekday: match[4],
        venue: 'BBBank Wildpark, Karlsruhe',
        visibleDateLabel: `${match[1]} ${match[2]}.`,
        month: monthNumbers[match[2]] || match[2],
      })
    }
    return games
  })

  const ticketButtons = await page.evaluate(() =>
    [...document.querySelectorAll('a')]
      .map((el) => {
        const rect = el.getBoundingClientRect()
        return {
          text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' '),
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
        }
      })
      .filter((button) => button.text === 'TICKETS' && button.width > 150 && button.y > 250)
      .sort((a, b) => (a.y - b.y) || (a.x - b.x))
  )

  return parsed.map((game, index) => ({
    ...game,
    id: `${game.date}-${slug(game.opponent)}`,
    index,
    ticketButton: ticketButtons[index] || null,
  }))
}

async function openGame(page, games, id) {
  const game = games.find((entry) => entry.id === id || slug(entry.opponent) === id || String(entry.index) === id)
  if (!game) throw new Error(`Could not find KSC game "${id}". Available ids: ${games.map((entry) => entry.id).join(', ')}`)
  if (!game.ticketButton) throw new Error(`No ticket button found for ${game.id}`)

  await page.mouse.click(game.ticketButton.x, game.ticketButton.y)
  await page.waitForLoadState('networkidle').catch(() => {})
  await delay(2500)
  await waitOutQueue(page)

  const body = await page.locator('body').innerText().catch(() => '')
  if (!body.toLowerCase().includes(game.opponent.toLowerCase())) {
    throw new Error(`Wrong match page. Expected ${game.opponent}; page starts: ${body.slice(0, 200).replace(/\s+/g, ' ')}`)
  }
  return game
}

async function getMainPlanCandidates(page) {
  await page.locator('svg').first().waitFor({ timeout: 30000 })
  return page.evaluate(() => {
    const blockLabel = /^(?:O[1-5]|N[1-4]|S[1-5]|W[1-4]|NO|SO|NW|SW|Rollstuhlfahrer)$/i
    const seen = new Set()
    return [...document.querySelectorAll('svg tspan')]
      .map((el) => {
        const rect = el.getBoundingClientRect()
        return {
          id: el.id || '',
          label: String(el.textContent || '').trim(),
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
        }
      })
      .filter((block) => block.width >= 8 && block.height >= 8 && block.y > 450 && blockLabel.test(block.label))
      .sort((a, b) => (a.y - b.y) || (a.x - b.x))
      .filter((block) => {
        const key = `${Math.round(block.x / 3)}:${Math.round(block.y / 3)}:${block.label}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  })
}

async function clickBlock(page, block) {
  await page.keyboard.press('Escape').catch(() => {})
  await page.evaluate(() => document.querySelectorAll('.popover.show, .popover, [role="tooltip"]').forEach((el) => el.remove())).catch(() => {})
  if (block.id) {
    await page.locator(`[id="${block.id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`).click({ timeout: 10000, force: true })
  } else {
    await page.mouse.click(block.x, block.y)
  }
}

async function returnToMainPlan(page) {
  await page.locator('button.back-to-stadium').click({ timeout: 10000 })
  await page.locator('svg').first().waitFor({ timeout: 30000 })
  await delay(400)
}

async function extractSeatSummary(page) {
  const raw = await page.evaluate(() => {
    const tabpanel = [...document.querySelectorAll('[role="tabpanel"]')]
      .find((el) => /Stadionplan/i.test(el.getAttribute('aria-label') || el.textContent || '')) || document
    const byFill = {}
    for (const circle of [...tabpanel.querySelectorAll('circle')]) {
      const fill = window.getComputedStyle(circle).fill || circle.getAttribute('fill') || 'unknown'
      byFill[fill] = (byFill[fill] || 0) + 1
    }
    return byFill
  })

  const summary = {
    totalSeats: 0,
    soldSeats: 0,
    availableSeats: 0,
    resaleSeats: 0,
    sightRestrictedSeats: 0,
    otherSeats: 0,
    byFill: raw,
  }
  for (const [fill, count] of Object.entries(raw)) {
    summary.totalSeats += count
    const status = classifyFill(fill)
    if (status === 'sold') summary.soldSeats += count
    else if (status === 'available') summary.availableSeats += count
    else if (status === 'resale') summary.resaleSeats += count
    else if (status === 'sightRestricted') summary.sightRestrictedSeats += count
    else summary.otherSeats += count
  }
  return summary
}

async function captureBlock(page, block, index) {
  await clickBlock(page, block)
  await page.getByRole('button', { name: 'Plätze wählen' }).click({ timeout: 10000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await delay(800)
  const seatSummary = await extractSeatSummary(page)
  await returnToMainPlan(page)
  return {
    ...block,
    name: `${String(index + 1).padStart(3, '0')}-${slug(block.label)}`,
    seatSummary,
  }
}

const sumBlocks = (blocks, key) => blocks.reduce((sum, block) => sum + (block.seatSummary[key] || 0), 0)

test('ksc', async ({ page }) => {
  await openShop(page)
  await openHeim(page)
  const games = await readGames(page)

  if (TEST_ID === 'games') {
    const publicBaseUrl = process.env.KSC_PUBLIC_BASE_URL || ''
    writeJson('games', {
      fetchedAt: new Date().toISOString(),
      source: page.url(),
      games: games.map(({ ticketButton, ...game }) => ({
        ...game,
        url: publicBaseUrl ? `${publicBaseUrl}/ksc/${game.id}.json` : `/ksc/${game.id}.json`,
      })),
    })
    return
  }

  const game = await openGame(page, games, TEST_ID)
  const candidates = await getMainPlanCandidates(page)
  const blocks = []
  const skippedBlocks = []

  for (const [index, block] of candidates.entries()) {
    console.log(`(${index + 1}/${candidates.length}) Capturing ${block.label}`)
    try {
      blocks.push(await captureBlock(page, block, index))
    } catch (error) {
      skippedBlocks.push({ label: block.label, reason: error.message })
      await page.keyboard.press('Escape').catch(() => {})
      if (await page.locator('button.back-to-stadium').count()) await returnToMainPlan(page).catch(() => {})
    }
  }

  const summary = {
    capturedBlocks: blocks.length,
    totalSeats: sumBlocks(blocks, 'totalSeats'),
    soldSeats: sumBlocks(blocks, 'soldSeats'),
    availableSeats: sumBlocks(blocks, 'availableSeats'),
    resaleSeats: sumBlocks(blocks, 'resaleSeats'),
    sightRestrictedSeats: sumBlocks(blocks, 'sightRestrictedSeats'),
    otherSeats: sumBlocks(blocks, 'otherSeats'),
  }
  summary.openNormalResale = summary.availableSeats + summary.resaleSeats
  summary.openIncludingSightRestricted = summary.openNormalResale + summary.sightRestrictedSeats
  summary.impliedHomeNeutralGoneReserved = OFFICIAL_CAPACITY.homeNeutral - summary.openNormalResale
  summary.impliedHomeNeutralGoneReservedIncludingSightRestricted = OFFICIAL_CAPACITY.homeNeutral - summary.openIncludingSightRestricted
  summary.homeNeutralRemainingPct = summary.openNormalResale / OFFICIAL_CAPACITY.homeNeutral
  summary.homeNeutralRemainingIncludingSightRestrictedPct = summary.openIncludingSightRestricted / OFFICIAL_CAPACITY.homeNeutral

  writeJson(TEST_ID, {
    fetchedAt: new Date().toISOString(),
    source: page.url(),
    game: {
      id: game.id,
      title: game.title,
      opponent: game.opponent,
      date: game.date,
      time: game.time,
      venue: game.venue,
    },
    capacity: OFFICIAL_CAPACITY,
    summary,
    skippedBlocks,
    blocks: blocks.map((block) => ({
      label: block.label,
      name: block.name,
      totalSeats: block.seatSummary.totalSeats,
      soldSeats: block.seatSummary.soldSeats,
      availableSeats: block.seatSummary.availableSeats,
      resaleSeats: block.seatSummary.resaleSeats,
      sightRestrictedSeats: block.seatSummary.sightRestrictedSeats,
      otherSeats: block.seatSummary.otherSeats,
    })),
  })
})
