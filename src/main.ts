import express from 'express'
import { exec } from 'child_process'
import path from 'path'
import { statSync, existsSync, readdirSync, mkdirSync } from 'fs'
import { createHash } from 'crypto'
import { BrowserServer, chromium } from 'playwright'

const app = express()
let browser: BrowserServer
const queue: (() => Promise<void>)[] = []
let isProcessing = false
const port = 5000
let wsEndpoint: string

const isFileYoungerThanOneDay = (filePath: string): boolean => {
  if (!existsSync(filePath)) {
    return false
  }
  const stats = statSync(filePath)
  const now = new Date().getTime()
  const modifiedTime = new Date(stats.mtime).getTime()
  const oneDayInMs = 24 * 60 * 60 * 1000
  return now - modifiedTime < oneDayInMs
}

const runTest = (res: any, folder: string, name: string, ending = 'csv') => {
  const filePath = path.resolve(
    __dirname,
    '../temp/',
    folder,
    `${name}.${ending}`
  )
  console.log(filePath)
  if (isFileYoungerThanOneDay(filePath)) {
    console.log('File is younger than one day, sending cached file...')
    return res.sendFile(filePath)
  }

  let testFile = path.resolve(__dirname, '../tests/', folder, `${name}.spec.js`)
  let testCmd
  if (existsSync(testFile)) {
    testCmd = `npx playwright test ${testFile}`
  } else {
    testFile = `tests/${folder}.spec.js`
    testCmd = `TEST_ID=${name} npx playwright test ${testFile}`
  }
  console.log(`running test: ${testCmd}`)
  exec(testCmd, (error, _stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`)
      return res.status(500).send('Error running test')
    }
    if (stderr) {
      console.error(`Stderr: ${stderr}`)
      return res.status(500).send('Error running test')
    }
    console.log('Test completed. Sending file...')
    res.sendFile(filePath, () => console.log('Done sending file.'))
  })
}

const generateCustomRoutes = () => {
  const testFiles = readdirSync(
    path.resolve(__dirname, '../tests/destatis-genesis')
  )
  const routes: string[] = []
  const folder = 'destatis-genesis'
  testFiles.forEach((file) => {
    if (file.endsWith('.spec.js')) {
      const name = file.replace('.spec.js', '')
      const route = `/${folder}/${name}.csv`
      app.get(route, (_req, res) => runTest(res, folder, name))
      routes.push(route)
    }
  })

  return routes
}

const routes = generateCustomRoutes()

// Wildcard route
app.get(/\/destatis-genesis\/.*\.csv$/, (req, res) => {
  try {
    const tableId = req.path.match(/destatis-genesis\/(.*)\.csv$/)
    const id = tableId!![0].split('/')[1].replace('.csv', '')
    runTest(res, 'destatis-genesis', id)
  } catch (e) {
    console.log(e)
    res.send(500)
  }
})

app.get('/olympics-medals.csv', (req, res) => {
  try {
    runTest(res, '', 'olympics-medals')
  } catch (e) {
    console.log(e)
    res.send(500)
  }
})

app.get('/olympics-medals-weighted.csv', (req, res) => {
  try {
    runTest(res, '', 'olympics-medals-weighted')
  } catch (e) {
    console.log(e)
    res.send(500)
  }
})

app.get('/un-world-population.xlsx', (req, res) => {
  try {
    runTest(res, '', 'un-world-population', 'xlsx')
  } catch (e) {
    console.log(e)
    res.send(500)
  }
})

app.get('/singstat-ts-M810141.csv', (req, res) => {
  try {
    runTest(res, '', 'singstat-ts-M810141')
  } catch (e) {
    console.log(e)
    res.send(500)
  }
})

app.get('/screengrab', async (req, res) => {
  console.log(new Date())
  req.setTimeout(10000)

  const { url } = req.query
  if (!url) return res.sendStatus(400)

  const hash = createHash('sha256')
    .update(JSON.stringify(req.query))
    .digest('hex')
  const filePath = path.resolve(__dirname, `../temp/screengrab/${hash}.png`)
  const dirPath = path.resolve(__dirname, '../temp/screengrab')

  if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true })

  if (isFileYoungerThanOneDay(filePath)) {
    console.log('Sending cached file...')
    return res.sendFile(filePath)
  }

  const runTest = () =>
    new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Playwright test timed out.')),
        10000
      )

      const testCmd = `QUERY="${encodeURI(
        JSON.stringify(req.query)
      )}" FILE="${hash}.png" npx playwright test ${path.resolve(
        __dirname,
        '../tests/screengrab.spec.js'
      )}`
      console.log(`Running test: ${testCmd}`)

      exec(testCmd, (error, _stdout, stderr) => {
        clearTimeout(timeout)
        if (error || stderr) return reject(error || new Error(stderr))
        res.sendFile(filePath, (err) => (err ? reject(err) : resolve()))
      })
    })

  queue.push(() => runTest().catch((err) => console.error('Task failed:', err)))
  if (!isProcessing) processQueue()
})

const processQueue = () => {
  if (queue.length === 0) {
    isProcessing = false
    return
  }

  isProcessing = true
  const task = queue.shift()
  if (task) {
    task().finally(() => {
      processQueue()
    })
  }
}

app.get('/', (_req, res) => {
  const links = routes
    .map((route) => `<li><a href="${route}">${route}</a></li>`)
    .join('')
  res.send(`
    <html>
<head>
  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
</head>
<body>
    <h1>Apify</h1>
    <h2> Abstraction layer to retrieve browser only accesible data via api.</h2>
    <h3>DESTATIS GENESIS</h3>
    <h4>All tables may work with the universal adapter:</h4>
    <label for="genesis_id">Table-ID:</label>
    <input id="genesis_id" value="12612-0003" />
    <a id="download_link" href="#">Download CSV</a>
    <h4>Custom Destatis GENESIS:</h4>
    <ul>${links}</ul>
    <h3>OTHERS</h3>
    <ul>
      <li><a href="/olympics-medals.csv">Olympics Medals</a></li>
      <li><a href="/olympics-medals-weighted.csv">Olympics Medals Weighted</a></li>
      <li><a href="/un-world-population.xlsx">UN World Population</a></li>
      <li><a href="/singstat-ts-M810141.csv">Singapore TS M810141</a></li>
    </ul>
    <script>
        $(document).ready(function () {
            function updateLink() {
                var tableId = $('#genesis_id').val();
                $('#download_link').attr('href', "/destatis-genesis/" + tableId + ".csv");
            }

            updateLink();

            $('#genesis_id').on('input', updateLink);
        });
    </script>
</body>

</html>
`)
})

const launchBrowser = async () => {
  browser = await chromium.launchServer({ headless: true })
  wsEndpoint = browser.wsEndpoint()
  console.log('Browser launched on WebSocket endpoint:', wsEndpoint)
}

app.get('/ws-endpoint', (req, res) => {
  if (wsEndpoint) {
    res.json({ wsEndpoint })
  } else {
    res.status(500).json({ error: 'Browser not launched' })
  }
})

app.post('/restart-browser', async (req, res) => {
  if (browser) {
    await browser.close()
  }
  await launchBrowser()
  res.json({ success: true, wsEndpoint })
})

process.on('SIGINT', async () => {
  if (browser) {
    await browser.close()
  }
  process.exit()
})

app.listen(port, async () => {
  await launchBrowser()
  console.log(`Server running at http://localhost:${port}`)
})
