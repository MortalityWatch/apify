const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readAvailability, reconcileSections } = require('./ksc-availability.cjs')

test('counts offered seats and standing tickets once and excludes away inventory', () => {
  const data = {
    a: { tid: '1', numbered: 'y', sitze_frei: '3677' },
    b: { tid: '2', numbered: 'n', sitze_frei: '12' },
    c: { tid: '3', numbered: 'n', sitze_frei: '100' },
    d: { tid: '4', numbered: 'y', sitze_frei: '500' },
    e: { tid: '5', numbered: 'y', sitze_frei: '12' },
  }
  const result = readAvailability(data, [
    { id: '', label: 'Choose block' },
    { id: '1', label: 'O1 (3677)' },
    { id: '1', label: 'O1 (3677)' },
    { id: '2', label: 'S2 (12)' },
    { id: '3', label: 'N4 (100)' },
    { id: '5', label: 'Rollstuhlfahrer Gast (12)' },
  ])
  assert.equal(result.seated, 3677)
  assert.equal(result.standing, 12)
  assert.equal(result.total, 3689)
  assert.equal(result.blocks.length, 2)
})

test('compares by section ID, includes resale and restricted view once, and accounts for uncaptured standing', () => {
  const availability = {
    total: 20, fetchedAt: 'overview-time', blocks: [
      { id: 'a', label: 'SO Oberrang', available: 8, configuredTotal: 100, standing: false },
      { id: 'b', label: 'SO Oberrang', available: 5, configuredTotal: 200, standing: false },
      { id: 'c', label: 'S2', available: 7, configuredTotal: 5000, standing: true },
    ],
  }
  const scan = (id, total, sold, available, resale, restricted, other) => ({
    sectionId: id, totalSeats: total, soldSeats: sold, availableSeats: available,
    resaleSeats: resale, sightRestrictedSeats: restricted, otherSeats: other, capturedAt: 'scan-time',
  })
  const result = reconcileSections(availability, [
    scan('b', 200, 193, 3, 1, 1, 2),
    scan('a', 100, 93, 3, 2, 1, 1),
  ])
  assert.equal(result.sections[0].availabilityDelta, 2)
  assert.equal(result.sections[1].availabilityDelta, 0)
  assert.equal(result.sections[0].classificationDelta, 0)
  assert.equal(result.sections[0].configuredTotalDelta, 0)
  assert.equal(result.sections[0].scanObservedAt, 'scan-time')
  assert.equal(result.sections[2].status, 'not-captured')
  assert.equal(result.sections[2].configuredTotalDelta, null)
  assert.equal(result.totals.scanComparedAvailable, 11)
  assert.equal(result.totals.notComparedShopAvailable, 7)
  assert.equal(result.totals.shopBreakdownDelta, 0)
})

test('reports duplicate and unmatched scans instead of silently merging or treating them as zero', () => {
  const snapshot = { total: 5, blocks: [{ id: 'a', label: 'O1', available: 5, configuredTotal: 100, standing: false }] }
  const result = reconcileSections(snapshot, [{ sectionId: 'a' }, { sectionId: 'a' }, { sectionId: 'unknown' }])
  assert.equal(result.sections[0].status, 'duplicate-scan')
  assert.equal(result.sections[0].availabilityDelta, null)
  assert.equal(result.totals.duplicateSections, 1)
  assert.equal(result.totals.shopBreakdownDelta, 0)
  assert.equal(result.unmatchedScans.length, 1)
  assert.equal(reconcileSections(null, []), null)
})

test('missing or invalid data stays unknown instead of reporting sold out', () => {
  assert.equal(readAvailability(null, []), null)
  assert.equal(readAvailability({}, [{ id: '1', label: 'S2' }]), null)
  for (const value of [null, '', '-1', '12 tickets']) {
    assert.equal(readAvailability({ a: { tid: '1', numbered: 'n', sitze_frei: value } }, [{ id: '1', label: 'S2' }]), null)
  }
  assert.equal(readAvailability({ a: { tid: '1', numbered: 'n', sitze_frei: '0' } }, [{ id: '1', label: 'S2' }]).total, 0)
})
