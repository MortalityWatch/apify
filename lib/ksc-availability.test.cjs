const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readAvailability } = require('./ksc-availability.cjs')

test('counts offered seats and standing tickets once and excludes away inventory', () => {
  const data = {
    a: { tid: '1', numbered: 'y', sitze_frei: '3677' },
    b: { tid: '2', numbered: 'n', sitze_frei: '12' },
    c: { tid: '3', numbered: 'n', sitze_frei: '100' },
    d: { tid: '4', numbered: 'y', sitze_frei: '500' },
  }
  const result = readAvailability(data, [
    { id: '', label: 'Choose block' },
    { id: '1', label: 'O1 (3677)' },
    { id: '1', label: 'O1 (3677)' },
    { id: '2', label: 'S2 (12)' },
    { id: '3', label: 'N4 (100)' },
  ])
  assert.equal(result.seated, 3677)
  assert.equal(result.standing, 12)
  assert.equal(result.total, 3689)
  assert.equal(result.blocks.length, 2)
})

test('missing or invalid data stays unknown instead of reporting sold out', () => {
  assert.equal(readAvailability(null, []), null)
  assert.equal(readAvailability({}, [{ id: '1', label: 'S2' }]), null)
  for (const value of [null, '', '-1', '12 tickets']) {
    assert.equal(readAvailability({ a: { tid: '1', numbered: 'n', sitze_frei: value } }, [{ id: '1', label: 'S2' }]), null)
  }
  assert.equal(readAvailability({ a: { tid: '1', numbered: 'n', sitze_frei: '0' } }, [{ id: '1', label: 'S2' }]).total, 0)
})
