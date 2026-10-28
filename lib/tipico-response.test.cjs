const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parseTipicoResponse } = require('./tipico-response.cjs')

test('accepts the feed and an empty fixture list during a break', () => {
  for (const events of [{ match: { eventName: 'Home - Away' } }, {}]) {
    const data = { SELECTION: { events } }
    assert.deepEqual(parseTipicoResponse(200, 'application/json; charset=utf-8', JSON.stringify(data)), data)
  }
})

test('identifies the production country block despite HTTP 200', () => {
  assert.throws(() => parseTipicoResponse(200, 'text/html', '<!DOCTYPE html><title>Tipico No Service</title>'), /country.*TIPICO_PROXY_SERVER/)
})

test('rejects HTTP errors, HTML, malformed JSON and unexpected JSON before replacing the cache', () => {
  assert.throws(() => parseTipicoResponse(503, 'application/json', '{}'), /HTTP 503/)
  assert.throws(() => parseTipicoResponse(200, 'text/html', '<html>maintenance</html>'), /instead of JSON/)
  assert.throws(() => parseTipicoResponse(200, 'application/json', 'broken'), SyntaxError)
  for (const body of ['{}', '{"SELECTION":{"events":[]}}', '{"SELECTION":{"events":null}}']) {
    assert.throws(() => parseTipicoResponse(200, 'application/json', body), /SELECTION.events/)
  }
})
