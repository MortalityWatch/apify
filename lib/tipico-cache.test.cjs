// Run after `npx tsc`. Exercise the HTTP routes with an isolated cache and scraper.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { setTimeout: delay } = require('node:timers/promises')

test('Tipico refreshes, reports failures, and never serves expired cache during concurrent requests', async t => {
  const root = fs.mkdtempSync(path.join(__dirname, '../tipico-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'dist'))
  fs.copyFileSync(path.join(__dirname, '../dist/main.js'), path.join(root, 'dist/main.js'))
  fs.mkdirSync(path.join(root, 'temp/ksc'), { recursive: true })
  fs.writeFileSync(path.join(root, 'temp/ksc/games.json'), '{"games":[]}')
  const cache = path.join(root, 'temp/tipico-football/bl2.json')
  fs.mkdirSync(path.dirname(cache), { recursive: true })
  const oldFeed = { SELECTION: { events: { old: {} } } }
  const newFeed = { SELECTION: { events: { current: {} } } }
  const mode = path.join(root, 'mode')
  const started = path.join(root, 'started')
  fs.writeFileSync(mode, 'fail')
  const fakeScraper = path.join(root, 'fake-scraper.cjs')
  fs.writeFileSync(fakeScraper, `
    const fs = require('node:fs');
    (async () => {
      fs.writeFileSync(${JSON.stringify(started)}, 'started');
      while (fs.readFileSync(${JSON.stringify(mode)}, 'utf8') === 'wait') {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      if (fs.readFileSync(${JSON.stringify(mode)}, 'utf8') === 'fail') process.exit(1);
      fs.writeFileSync(${JSON.stringify(cache)}, ${JSON.stringify(JSON.stringify(newFeed))});
    })().catch(() => process.exit(1));
  `)
  fs.mkdirSync(path.join(root, 'bin'))
  const quote = s => "'" + s.replaceAll("'", "'\\''") + "'"
  fs.writeFileSync(path.join(root, 'bin/xvfb-run'), `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fakeScraper)}\n`, { mode: 0o755 })
  const socket = net.createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  const server = spawn(process.execPath, [path.join(root, 'dist/main.js')], {
    cwd: root,
    env: { ...process.env, PORT: String(port), PATH: `${root}/bin:${process.env.PATH}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(async () => {
    server.kill('SIGTERM')
    await once(server, 'exit')
  })
  let logs = ''
  server.stdout.on('data', b => { logs += b })
  server.stderr.on('data', b => { logs += b })
  const url = `http://127.0.0.1:${port}/tipico-football/bl2.json`
  const waitFor = async predicate => {
    for (let i = 0; i < 200; i++) {
      if (predicate()) return
      await delay(20)
    }
    assert.fail(`Timed out waiting for server: ${logs}`)
  }
  await waitFor(() => logs.includes('Server running'))
  const ageCache = hours => {
    fs.writeFileSync(cache, JSON.stringify(oldFeed))
    const when = new Date(Date.now() - hours * 3600_000)
    fs.utimesSync(cache, when, when)
  }

  ageCache(0)
  let res = await fetch(url)
  assert.equal(res.headers.get('x-cache'), 'HIT')
  assert.deepEqual(await res.json(), oldFeed)
  assert.equal(fs.existsSync(started), false)

  fs.writeFileSync(mode, 'success')
  res = await fetch(`${url}?force=1`)
  assert.equal(res.headers.get('x-refresh'), 'SUCCESS')
  assert.deepEqual(await res.json(), newFeed)
  res = await fetch(url.replace('tipico-football', 'tipico-bundesliga'))
  assert.equal(res.headers.get('x-cache'), 'HIT')
  assert.deepEqual(await res.json(), newFeed)

  fs.writeFileSync(mode, 'fail')
  ageCache(2)
  res = await fetch(url)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('x-cache'), 'STALE')
  assert.equal(res.headers.get('x-refresh'), 'FAILED')
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.ok(Number(res.headers.get('x-cache-age')) >= 7200)
  assert.deepEqual(await res.json(), oldFeed)

  ageCache(48)
  res = await fetch(url)
  assert.equal(res.status, 500)
  assert.equal(res.headers.get('x-refresh'), 'FAILED')
  await res.text()

  fs.rmSync(started)
  fs.writeFileSync(mode, 'wait')
  const pending = fetch(url)
  await waitFor(() => fs.existsSync(started))
  res = await fetch(url)
  assert.equal(res.status, 429)
  await res.text()
  fs.writeFileSync(mode, 'success')
  res = await pending
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), newFeed)

  res = await fetch(url.replace('bl2.json', 'unknown.json'))
  assert.equal(res.status, 404)
  await res.text()
})
