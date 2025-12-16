import express from 'express'
import { exec } from 'child_process'
import path from 'path'
import { statSync, existsSync, mkdirSync } from 'fs'
import { createHash } from 'crypto'

const app = express()
const queue: (() => Promise<void>)[] = []
let isProcessing = false
const port = process.env.PORT || 5000

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

// Track running processes to prevent multiple simultaneous runs of the same test
const runningTests = new Map<string, boolean>()

const runTest = (res: any, folder: string, name: string, ending = 'csv', flat = false) => {
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
  if (isFileYoungerThanOneDay(filePath)) {
    console.log('File is younger than one day, sending cached file...')
    return res.sendFile(filePath)
  }

  // Mark test as running
  runningTests.set(testKey, true)
  console.log(`Starting test: ${testKey}`)

  let testFile = path.resolve(__dirname, '../tests/', folder, `${name}.spec.js`)
  let testCmd
  if (existsSync(testFile)) {
    testCmd = `timeout 120 xvfb-run -a npx playwright test ${testFile} --timeout=90000 --workers=1`
  } else {
    testFile = `tests/${folder}.spec.js`
    const flatEnv = flat ? 'FLAT=1 ' : ''
    testCmd = `timeout 120 bash -c '${flatEnv}TEST_ID=${name} xvfb-run -a npx playwright test ${testFile} --timeout=90000 --workers=1'`
  }
  console.log(`Running test: ${testCmd}`)

  const cleanup = () => {
    runningTests.delete(testKey)
    console.log(`Cleaned up test: ${testKey}`)
  }

  const childProcess = exec(
    testCmd,
    {
      timeout: 130000,
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

        if (error.code === 124) {
          // timeout command timeout
          return res.status(500).send(`Test timed out after 120 seconds`)
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
  }, 135000) // 5 seconds after the exec timeout

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
            <h3 class="font-medium text-gray-800 mb-3">General Datasets</h3>
            <ul class="space-y-2">
              <li><a href="/olympics-medals.csv" class="text-blue-600 hover:text-blue-800 underline">Olympics Medals</a></li>
              <li><a href="/olympics-medals-weighted.csv" class="text-blue-600 hover:text-blue-800 underline">Olympics Medals Weighted</a></li>
              <li><a href="/un-world-population.xlsx" class="text-blue-600 hover:text-blue-800 underline">UN World Population</a></li>
              <li><a href="/singstat-ts-M810141.csv" class="text-blue-600 hover:text-blue-800 underline">Singapore TS M810141</a></li>
              <li><a href="/us-general-election-2024-turnout.csv" class="text-blue-600 hover:text-blue-800 underline">US 2024 General Election Turnout</a></li>
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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
