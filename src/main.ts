import express from 'express'
import 'dotenv/config'
import { exec } from 'child_process'
import path from 'path'
import { statSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { createHash } from 'crypto'
import { inspect } from 'util'

const app = express()
const queue: (() => Promise<void>)[] = []
let isProcessing = false
const port = Number(process.env.PORT || 5000)

const isFileYoungerThan = (filePath: string, days: number): boolean => {
  if (!existsSync(filePath)) {
    return false
  }
  const stats = statSync(filePath)
  const now = new Date().getTime()
  const modifiedTime = new Date(stats.mtime).getTime()
  const maxAgeMs = days * 24 * 60 * 60 * 1000
  return now - modifiedTime < maxAgeMs
}

const isFileYoungerThanOneDay = (filePath: string): boolean => {
  return isFileYoungerThan(filePath, 1)
}

const isFileYoungerThan30Days = (filePath: string): boolean => {
  return isFileYoungerThan(filePath, 30)
}

// Track running processes to prevent multiple simultaneous runs of the same test
const runningTests = new Map<string, boolean>()

const buildTestCommand = (
  folder: string,
  name: string,
  flat: boolean,
  playwrightTimeoutMs: number
) => {
  let testFile = path.resolve(__dirname, '../tests/', folder, `${name}.spec.js`)
  if (existsSync(testFile)) {
    return `xvfb-run -a npx playwright test ${testFile} --timeout=${playwrightTimeoutMs} --workers=1`
  }

  testFile = `tests/${folder}.spec.js`
  const flatEnv = flat ? 'FLAT=1 ' : ''
  const envPrefix = `${flatEnv}TEST_ID=${JSON.stringify(name)}`
  return `bash -c ${JSON.stringify(`${envPrefix} xvfb-run -a npx playwright test ${testFile} --timeout=${playwrightTimeoutMs} --workers=1`)}`
}

const runTest = (
  res: any,
  folder: string,
  name: string,
  ending = 'csv',
  flat = false,
  options: {
    force?: boolean
    cacheDays?: number
    staleDays?: number
    commandTimeoutMs?: number
    playwrightTimeoutMs?: number
  } = {}
) => {
  const cacheKey = flat ? `${name}-flat` : name
  const filePath = path.resolve(
    __dirname,
    '../temp/',
    folder,
    `${cacheKey}.${ending}`
  )

  const testKey = `${folder}/${cacheKey}`

  // Prevent multiple simultaneous runs of the same test
  if (runningTests.get(testKey)) {
    console.log(
      `Test ${testKey} is already running, returning cached file if available...`
    )
    if (existsSync(filePath)) {
      return res.sendFile(filePath)
    } else {
      return res.status(429).send('Test is already running, please wait...')
    }
  }

  // Ensure temp directory exists
  const tempDir = path.dirname(filePath)
  if (!existsSync(tempDir)) {
    console.log(`Creating temp directory: ${tempDir}`)
    mkdirSync(tempDir, { recursive: true })
  }

  console.log(`File path: ${filePath}`)
  const cacheDays = options.cacheDays ?? 1
  const staleDays = options.staleDays ?? 30
  if (!options.force && isFileYoungerThan(filePath, cacheDays)) {
    console.log('File is younger than one day, sending cached file...')
    return res.sendFile(filePath)
  }

  // Mark test as running
  runningTests.set(testKey, true)
  console.log(`Starting test: ${testKey}`)

  const commandTimeoutMs = options.commandTimeoutMs ?? 120000
  const playwrightTimeoutMs = options.playwrightTimeoutMs ?? 90000
  const testCmd = buildTestCommand(folder, name, flat, playwrightTimeoutMs)
  console.log(`Running test: ${testCmd}`)

  const cleanup = () => {
    runningTests.delete(testKey)
    console.log(`Cleaned up test: ${testKey}`)
  }

  const childProcess = exec(
    testCmd,
    {
      timeout: commandTimeoutMs + 5000,
      killSignal: 'SIGKILL',
    },
    (error, stdout, stderr) => {
      cleanup()

      console.log(`Test ${testKey} completed`)
      if (stdout) console.log(`Stdout: ${stdout}`)
      if (stderr) console.log(`Stderr: ${stderr}`)

      if (error) {
        console.error(`Execution error for ${testKey}: ${error.message}`)
        console.error(`Error code: ${error.code}, Signal: ${error.signal}`)

        // Try to serve stale cache (up to 30 days old) on failure
        if (isFileYoungerThan(filePath, staleDays)) {
          console.log(`Serving stale cache for ${testKey} due to scrape failure`)
          return res.sendFile(filePath, (err: any) => {
            if (err) {
              console.error('Error sending stale cache:', err)
            } else {
              console.log('Served stale cache successfully.')
            }
          })
        }

        if (error.code === 124) {
          // timeout command timeout
          return res.status(500).send(`Test timed out`)
        }
        if (error.killed || error.signal === 'SIGKILL') {
          return res
            .status(500)
            .send(`Test was killed due to timeout or system constraint`)
        }
        return res.status(500).send(`Test execution failed: ${error.message}`)
      }

      // Check if the expected file was created
      if (!existsSync(filePath)) {
        console.error(`Expected output file not found: ${filePath}`)
        return res
          .status(500)
          .send(`Test completed but output file not generated`)
      }

      console.log(`Test ${testKey} completed successfully. Sending file...`)
      res.sendFile(filePath, (err: any) => {
        if (err) {
          console.error('Error sending file:', err)
        } else {
          console.log('Done sending file.')
        }
      })
    }
  )

  // Ensure cleanup happens even if the callback isn't called
  const forceCleanupTimer = setTimeout(() => {
    if (childProcess && !childProcess.killed) {
      console.log(`Force killing hanging test process for ${testKey}`)
      childProcess.kill('SIGKILL')
    }
    cleanup()
  }, commandTimeoutMs + 10000) // 5 seconds after the exec timeout

  childProcess.on('exit', () => {
    clearTimeout(forceCleanupTimer)
  })

  childProcess.on('error', (err) => {
    console.error(`Child process error for ${testKey}:`, err)
    cleanup()
    clearTimeout(forceCleanupTimer)
  })
}

// Wildcard route for CSV files
app.get(/\/destatis-genesis\/.*\.csv$/, (req, res) => {
  try {
    const tableId = req.path.match(/destatis-genesis\/(.*)\.csv$/)
    const id = tableId!![0].split('/')[1].replace('.csv', '')
    const flat = req.query.flat === '1'
    runTest(res, 'destatis-genesis', id, 'csv', flat)
  } catch (e) {
    console.log(e)
    res.send(500)
  }
})

// Wildcard route for CSV.GZ files
app.get(/\/destatis-genesis\/.*\.csv\.gz$/, (req, res) => {
  try {
    const tableId = req.path.match(/destatis-genesis\/(.*)\.csv\.gz$/)
    const id = tableId!![0].split('/')[1].replace('.csv.gz', '')
    const flat = req.query.flat === '1'
    runTest(res, 'destatis-genesis', id, 'csv.gz', flat)
  } catch (e) {
    console.log(e)
    res.send(500)
  }
})

// Wildcard route
app.get(/\/cdc-wonder\/.*\.txt$/, (req, res) => {
  try {
    const tableId = req.path.match(/cdc-wonder\/(.*)\.txt$/)
    const id = tableId!![0].split('/')[1].replace('.txt', '')
    runTest(res, 'cdc-wonder', id, 'txt')
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

app.get('/mortality-org-stmf.csv', (req, res) => {
  try {
    runTest(res, '', 'mortality-org-stmf')
  } catch (e) {
    console.log(e)
    res.send(500)
  }
})

app.get(/\/cia-world-factbook\/.*\.csv$/, (req, res) => {
  try {
    const tableId = req.path.match(/cia-world-factbook\/(.*)\.csv$/)
    const id = tableId!![0].split('/')[1].replace('.csv', '')
    console.log(id)
    runTest(res, 'cia-world-factbook', id)
  } catch (e) {
    console.log(e)
    res.send(500)
  }
})

app.get('/us-general-election-2024-turnout.csv', (req, res) => {
  try {
    runTest(res, '', 'us-general-election-2024-turnout')
  } catch (e) {
    console.log(e)
    res.send(500)
  }
})

const runTipicoFootballTest = (req: any, res: any) => {
  try {
    const tableId = req.path.match(/tipico-(?:bundesliga|football)\/(.*)\.json$/)
    const id = tableId!![0].split('/')[1].replace('.json', '')
    runTest(res, 'tipico-football', id, 'json')
  } catch (e) {
    console.log(e)
    res.send(500)
  }
}

app.get(/\/tipico-bundesliga\/.*\.json$/, runTipicoFootballTest)

app.get(/\/tipico-football\/.*\.json$/, runTipicoFootballTest)

const runKscTest = (res: any, id: string, force = false) => {
  runTest(res, 'ksc', id, 'json', false, {
    force,
    cacheDays: 0.5, // 12 hours for both games and match details
    staleDays: 7,
    commandTimeoutMs: id === 'games' ? 4 * 60 * 1000 : 20 * 60 * 1000,
    playwrightTimeoutMs: id === 'games' ? 3 * 60 * 1000 : 19 * 60 * 1000,
  })
}

const startKscRefresh = (id: string) => {
  const testKey = `ksc/${id}`
  if (runningTests.get(testKey)) return false

  const filePath = path.resolve(__dirname, '../temp/ksc', `${id}.json`)
  const tempDir = path.dirname(filePath)
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })

  const commandTimeoutMs = id === 'games' ? 4 * 60 * 1000 : 20 * 60 * 1000
  const playwrightTimeoutMs = id === 'games' ? 3 * 60 * 1000 : 19 * 60 * 1000
  const testCmd = buildTestCommand('ksc', id, false, playwrightTimeoutMs)

  runningTests.set(testKey, true)
  console.log(`Starting background refresh: ${testKey}`)
  console.log(`Running test: ${testCmd}`)

  exec(
    testCmd,
    {
      timeout: commandTimeoutMs + 5000,
      killSignal: 'SIGKILL',
    },
    (error, stdout, stderr) => {
      runningTests.delete(testKey)
      console.log(`Background refresh ${testKey} completed`)
      if (stdout) console.log(`Stdout: ${stdout}`)
      if (stderr) console.log(`Stderr: ${stderr}`)
      if (error) console.error(`Background refresh failed for ${testKey}: ${error.message}`)
      else if (!existsSync(filePath)) console.error(`Background refresh did not create ${filePath}`)
    }
  )

  return true
}

const sendKscMatch = (res: any, id: string, force = false) => {
  const filePath = path.resolve(__dirname, '../temp/ksc', `${id}.json`)
  const testKey = `ksc/${id}`
  const hasCache = existsSync(filePath)
  const isFresh = isFileYoungerThan(filePath, 0.5) // 12 hours
  const shouldRefresh = force || !isFresh

  if (hasCache) {
    if (shouldRefresh) startKscRefresh(id)
    res.set('X-Cache', isFresh ? 'HIT' : 'STALE')
    res.set('X-Refresh', shouldRefresh ? 'BACKGROUND' : 'NONE')
    return res.sendFile(filePath)
  }

  const started = startKscRefresh(id)
  return res.status(202).json({
    status: runningTests.get(testKey) ? 'refreshing' : 'queued',
    started,
    id,
    message: 'KSC scrape started. Retry this URL in a few minutes.',
  })
}

app.get('/ksc/games.json', (req, res) => {
  try {
    process.env.KSC_PUBLIC_BASE_URL = `${req.protocol}://${req.get('host')}`
    runKscTest(res, 'games', req.query.force === '1')
  } catch (e) {
    console.log(e)
    res.send(500)
  }
})

const KSC_DAILY_REFRESH_MS = 24 * 60 * 60 * 1000

const waitForKscBackgroundRefresh = (id: string, timeoutMs = 30 * 60 * 1000) =>
  new Promise<boolean>((resolve) => {
    const startedAt = Date.now()
    const poll = setInterval(() => {
      if (!runningTests.get(`ksc/${id}`)) {
        clearInterval(poll)
        resolve(true)
      } else if (Date.now() - startedAt > timeoutMs) {
        clearInterval(poll)
        resolve(false)
      }
    }, 15000)
  })

const refreshKscDataset = async () => {
  console.log('[ksc] Daily refresh started')
  try {
    startKscRefresh('games')
    if (!(await waitForKscBackgroundRefresh('games'))) {
      console.error('[ksc] Daily refresh: timed out waiting for games list')
      return
    }

    const gamesPath = path.resolve(__dirname, '../temp/ksc/games.json')
    if (!existsSync(gamesPath)) {
      console.error('[ksc] Daily refresh: games.json missing after refresh')
      return
    }

    const games: { id: string }[] = JSON.parse(readFileSync(gamesPath, 'utf8')).games || []
    for (const game of games) {
      startKscRefresh(String(game.id))
      const ok = await waitForKscBackgroundRefresh(String(game.id))
      console.log(`[ksc] Daily refresh: ${game.id} ${ok ? 'done' : 'timed out'}`)
    }
    console.log('[ksc] Daily refresh finished')
  } catch (error) {
    console.error('[ksc] Daily refresh failed:', error)
  }
}

const scheduleKscDailyRefresh = () => {
  const gamesPath = path.resolve(__dirname, '../temp/ksc/games.json')
  // Stale data: refresh shortly after boot. Fresh data: wait a day.
  const bootDelayMs = isFileYoungerThan(gamesPath, 1) ? KSC_DAILY_REFRESH_MS : 10 * 1000
  setTimeout(() => {
    void refreshKscDataset()
    setInterval(() => {
      void refreshKscDataset()
    }, KSC_DAILY_REFRESH_MS)
  }, bootDelayMs)
  console.log(`[ksc] Daily refresh scheduled (first run in ${Math.round(bootDelayMs / 1000)}s)`)
}

app.get(/\/ksc\/[^/]+\.json$/, (req, res) => {
  try {
    const match = req.path.match(/\/ksc\/([^/]+)\.json$/)
    let id = decodeURIComponent(match!![1]).replace(/[^a-zA-Z0-9._-]/g, '-')
    if (/^026-\d{2}-\d{2}-/.test(id)) id = `2${id}`
    sendKscMatch(res, id, req.query.force === '1')
  } catch (e) {
    console.log(inspect(e))
    res.send(500)
  }
})

app.get('/screengrab', (req, res) => {
  console.log(new Date())
  req.setTimeout(30000)

  const { url } = req.query
  if (!url) {
    res.sendStatus(400)
    return
  }

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
        30000
      )

      const testCmd = `QUERY="${encodeURI(
        JSON.stringify(req.query)
      )}" FILE="${hash}.png" xvfb-run npx playwright test ${path.resolve(
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
  res.send(`
    <html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Apify - Data API</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
  <script defer src="https://ua.e7ad.cc/script.js" data-website-id="f6393a00-e38f-4be0-add6-afea88b85a3e"></script>
</head>
<body class="bg-gray-50 min-h-screen">
  <div class="container mx-auto px-4 py-8 max-w-4xl">
    <div class="bg-white rounded-lg shadow-lg p-8">
      <h1 class="text-4xl font-bold text-gray-800 mb-4">Apify</h1>
      <p class="text-lg text-gray-600 mb-8">Abstraction layer to retrieve browser-only accessible data via API</p>
      
      <!-- DESTATIS GENESIS Section -->
      <div class="mb-12">
        <h2 class="text-2xl font-semibold text-gray-800 mb-4">DESTATIS GENESIS</h2>
        <p class="text-gray-600 mb-4">All tables may work with the universal adapter:</p>
        
        <div class="bg-gray-50 p-6 rounded-lg">
          <div class="mb-4">
            <label for="genesis_id" class="block text-sm font-medium text-gray-700 mb-2">Table-ID:</label>
            <input id="genesis_id" value="12612-0003" 
                   class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          
          <div class="flex gap-3">
            <button id="download_link_csv" 
                    class="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition duration-200 shadow-sm">
              Download CSV
            </button>
            <button id="download_link_gz" 
                    class="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition duration-200 shadow-sm">
              Download CSV.GZ
            </button>
          </div>
        </div>
      </div>

      <!-- CIA World Factbook Section -->
      <div class="mb-12">
        <h2 class="text-2xl font-semibold text-gray-800 mb-4">CIA World Factbook</h2>
        <p class="text-gray-600 mb-4">All tables may work with the universal adapter:</p>
        
        <div class="bg-gray-50 p-6 rounded-lg">
          <div class="mb-4">
            <label for="cia_id" class="block text-sm font-medium text-gray-700 mb-2">Table-Name:</label>
            <input id="cia_id" value="alcohol-consumption-per-capita" 
                   class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          
          <div class="flex gap-3">
            <button id="download_link_cia" 
                    class="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition duration-200 shadow-sm">
              Download CSV
            </button>
          </div>
        </div>
      </div>

      <!-- Others Section -->
      <div class="mb-8">
        <h2 class="text-2xl font-semibold text-gray-800 mb-4">Other Datasets</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-gray-50 p-4 rounded-lg">
            <h3 class="font-medium text-gray-800 mb-3">KSC Tickets</h3>
            <ul class="space-y-2">
              <li><a href="/ksc/games.json" class="text-blue-600 hover:text-blue-800 underline">Current Home Games</a></li>
              <li><code class="text-sm text-gray-700">/ksc/&lt;game-id&gt;.json</code></li>
            </ul>
          </div>

          <div class="bg-gray-50 p-4 rounded-lg">
            <h3 class="font-medium text-gray-800 mb-3">General Datasets</h3>
            <ul class="space-y-2">
              <li><a href="/olympics-medals.csv" class="text-blue-600 hover:text-blue-800 underline">Olympics Medals</a></li>
              <li><a href="/olympics-medals-weighted.csv" class="text-blue-600 hover:text-blue-800 underline">Olympics Medals Weighted</a></li>
              <li><a href="/un-world-population.xlsx" class="text-blue-600 hover:text-blue-800 underline">UN World Population</a></li>
              <li><a href="/singstat-ts-M810141.csv" class="text-blue-600 hover:text-blue-800 underline">Singapore TS M810141</a></li>
              <li><a href="/us-general-election-2024-turnout.csv" class="text-blue-600 hover:text-blue-800 underline">US 2024 General Election Turnout</a></li>
              <li><a href="/mortality-org-stmf.csv" class="text-blue-600 hover:text-blue-800 underline">Mortality.org STMF</a></li>
              <li><a href="/tipico-football/bl1.json" class="text-blue-600 hover:text-blue-800 underline">Tipico Bundesliga</a></li>
              <li><a href="/tipico-football/bl2.json" class="text-blue-600 hover:text-blue-800 underline">Tipico 2. Bundesliga</a></li>
              <li><a href="/tipico-football/bl3.json" class="text-blue-600 hover:text-blue-800 underline">Tipico 3. Liga</a></li>
              <li><a href="/tipico-football/dfb-pokal.json" class="text-blue-600 hover:text-blue-800 underline">Tipico DFB-Pokal</a></li>
            </ul>
          </div>
          
          <div class="bg-gray-50 p-4 rounded-lg">
            <h3 class="font-medium text-gray-800 mb-3">CDC Wonder Datasets</h3>
            <ul class="space-y-2">
              <li><a href="/cdc-wonder/month-5y.txt" class="text-blue-600 hover:text-blue-800 underline">All-Cause Month/5y</a></li>
              <li><a href="/cdc-wonder/provisional-month-5y.txt" class="text-blue-600 hover:text-blue-800 underline">All-Cause Provisional Month/5y</a></li>
              <li><a href="/cdc-wonder/month-5y-mcd-neoplasm.txt" class="text-blue-600 hover:text-blue-800 underline">MCD ICD10 Month/5y/neoplasm</a></li>
              <li><a href="/cdc-wonder/provisional-month-5y-mcd-neoplasm.txt" class="text-blue-600 hover:text-blue-800 underline">MCD ICD10 Provisional Month/5y/neoplasm</a></li>
              <li><a href="/cdc-wonder/month-5y-ucd-neoplasm.txt" class="text-blue-600 hover:text-blue-800 underline">UCD ICD10 Month/5y/neoplasm</a></li>
              <li><a href="/cdc-wonder/provisional-month-5y-ucd-neoplasm.txt" class="text-blue-600 hover:text-blue-800 underline">UCD ICD10 Provisional Month/5y/neoplasm</a></li>
              <li><a href="/cdc-wonder/year-icd_chapter.txt" class="text-blue-600 hover:text-blue-800 underline">UCD ICD10-Chapter Year</a></li>
              <li><a href="/cdc-wonder/provisional-year-icd_chapter.txt" class="text-blue-600 hover:text-blue-800 underline">UCD ICD10-Chapter Provisional Year</a></li>
              <li><a href="/cdc-wonder/vaers-deaths-month.txt" class="text-blue-600 hover:text-blue-800 underline">VAERS Monthly Deaths</a></li>
              <li><a href="/cdc-wonder/vaers-measles-deaths-year.txt" class="text-blue-600 hover:text-blue-800 underline">VAERS Measles Deaths Year</a></li>
              <li><a href="/cdc-wonder/year-ucd-measles.txt" class="text-blue-600 hover:text-blue-800 underline">UCD Measles (B05) Year</a></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    $(document).ready(function () {
        function updateLinks() {
            var tableId = $('#genesis_id').val();
            $('#download_link_csv').click(function() {
                window.location.href = "/destatis-genesis/" + tableId + ".csv";
            });
            $('#download_link_gz').click(function() {
                window.location.href = "/destatis-genesis/" + tableId + ".csv.gz";
            });
        }

        updateLinks();
        $('#genesis_id').on('input', updateLinks);

        function updateLinkCia() {
            var tableId = $('#cia_id').val();
            $('#download_link_cia').click(function() {
                window.location.href = "/cia-world-factbook/" + tableId + ".csv";
            });
        }

        updateLinkCia();
        $('#cia_id').on('input', updateLinkCia);
    });
  </script>
</body>
</html>
`)
})

const startServer = (serverPort: number) => {
  const server = app.listen(serverPort, () => {
    console.log(`Server running at http://localhost:${serverPort}`)
  })

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE' && !process.env.PORT && serverPort !== 5050) {
      console.log(`Port ${serverPort} is in use, trying http://localhost:5050`)
      startServer(5050)
      return
    }

    throw error
  })
}

scheduleKscDailyRefresh()

startServer(port)
