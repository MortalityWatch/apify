import { test, chromium } from '@playwright/test'

const query = JSON.parse(decodeURI(process.env.QUERY))
const url = query.url
const file = './temp/screengrab/' + process.env.FILE
const selector = query.selector
const width = query.width ? parseInt(query.width) : 720
const height = query.height ? parseInt(query.height) : 480

let page
let browserContext
test.use({
  timeout: 10000,
  deviceScaleFactor: 2,
  viewport: { width, height },
})

const connectToBrowser = async () => {
  try {
    const response = await fetch('http://localhost:5000/ws-endpoint')
    const { wsEndpoint } = await response.json()
    const browser = await chromium.connect(wsEndpoint)
    browserContext = await browser.newContext()
    page = await browserContext.newPage()
  } catch (e) {
    console.log(e)
    await fetch('http://localhost:5000/restart-browser')
  }
}

test.beforeAll(async () => await connectToBrowser())

test('test', async () => {
  await page.goto(url)
  const options = { path: file }

  if (selector) {
    console.log(selector)
    const element = await page.waitForSelector(selector, {
      state: 'visible',
      timeout: 10000,
    })
    if (!element) {
      console.log('Element not found:', selector)
    } else {
      await element.screenshot(options)
    }
  } else {
    await page.screenshot(options)
  }
})
