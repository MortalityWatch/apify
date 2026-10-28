const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, readdirSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { reconcileSections } = require('./ksc-availability.cjs')
const { assessSnapshot, compareSnapshots, writeKscSnapshot } = require('./ksc-snapshots.cjs')

function snapshot(fetchedAt, available, resale, captured = true) {
  const availability = { total: available, blocks: [{ id: 'a', label: 'N1', available, standing: false, configuredTotal: 1000 }] }
  const blocks = captured ? [{ sectionId: 'a', label: 'N1', totalSeats: 1000, soldSeats: 1000 - available, availableSeats: available - resale, resaleSeats: resale, sightRestrictedSeats: 0, otherSeats: 0 }] : []
  return { fetchedAt, availability, blocks, summary: { resaleSeats: resale }, reconciliation: reconcileSections(availability, blocks) }
}

test('reports net inventory changes without inventing a cancellation cause', () => {
  const previous = snapshot('2026-10-27T12:00:00Z', 100, 10)
  const current = snapshot('2026-10-28T02:00:00Z', 197, 59)
  const changes = compareSnapshots(previous, current)
  assert.equal(changes.availableDelta, 97)
  assert.equal(changes.resaleDelta, 49)
  assert.equal(changes.estimatedHomeSoldDelta, -48)
  assert.deepEqual(changes.sections.map(s => [s.label, s.availableDelta, s.resaleDelta]), [['N1', 97, 49]])
})

test('uncaptured available seats, duplicate scans and unknown classifications cannot produce reliable estimates', () => {
  const incomplete = snapshot('2026-10-28T02:00:00Z', 50, 0, false)
  assert.equal(assessSnapshot(incomplete).salesEstimateReliable, false)
  assert.equal(compareSnapshots(snapshot('2026-10-27T12:00:00Z', 40, 0), incomplete).estimatedHomeSoldDelta, null)
  assert.equal(assessSnapshot(snapshot('2026-10-28T02:00:00Z', 0, 0, false)).salesEstimateReliable, true)
  const empty = snapshot('2026-10-28T02:00:00Z', 50, 0)
  empty.reconciliation.sections[0].scanTotal = 0
  empty.reconciliation.sections[0].configuredTotalDelta = 1000
  assert.ok(assessSnapshot(empty).issues.includes('incomplete-seat-map'))
  const unknown = snapshot('2026-10-28T02:00:00Z', 50, 5)
  unknown.reconciliation.sections[0].scanOther = 1
  assert.ok(assessSnapshot(unknown).issues.includes('unclassified-seats'))
  unknown.reconciliation.sections[0].status = 'duplicate-scan'
  assert.ok(assessSnapshot(unknown).issues.includes('duplicate-section-scan'))
})

test('archives the existing snapshot, retains each new reading and atomically updates latest', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ksc-snapshots-'))
  try {
    const before = snapshot('2026-10-27T12:00:00Z', 100, 10)
    const after = snapshot('2026-10-28T02:00:00Z', 197, 59)
    writeKscSnapshot(directory, 'match', before)
    writeKscSnapshot(directory, 'match', after)
    const files = readdirSync(join(directory, 'history', 'match'))
    assert.equal(files.length, 2)
    const latest = JSON.parse(readFileSync(join(directory, 'match.json'), 'utf8'))
    assert.equal(latest.changes.estimatedHomeSoldDelta, -48)
    assert.equal(latest.dataQuality.salesEstimateReliable, true)
    assert.equal(JSON.parse(readFileSync(join(directory, 'history', 'match', files[0]), 'utf8')).fetchedAt, before.fetchedAt)
    assert.throws(() => writeKscSnapshot(directory, '../unsafe', after))
  } finally { rmSync(directory, { recursive: true, force: true }) }
})


test('compares the same stadium section when session-encoded shop IDs rotate', () => {
  const previous = snapshot('2026-10-27T12:00:00Z', 100, 10)
  const current = snapshot('2026-10-28T02:00:00Z', 197, 59)
  previous.availability.blocks[0].polygonId = 'gsectorn1'
  current.availability.blocks[0].polygonId = 'gsectorn1'
  current.availability.blocks[0].id = 'new-session-id'
  current.blocks[0].sectionId = 'new-session-id'
  const changes = compareSnapshots(previous, current)
  assert.equal(changes.sections.length, 1)
  assert.equal(changes.sections[0].status, 'compared')
  assert.equal(changes.sections[0].polygonId, 'gsectorn1')
  assert.equal(changes.sections[0].availableDelta, 97)
  assert.equal(changes.sections[0].resaleDelta, 49)
  assert.equal(changes.estimatedHomeSoldDelta, -48)
})
