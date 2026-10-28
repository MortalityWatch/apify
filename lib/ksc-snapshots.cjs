const { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } = require('node:fs')
const { join } = require('node:path')
const { isDeepStrictEqual } = require('node:util')

function assessSnapshot(payload) {
  const issues = []
  const availability = payload.availability
  const reconciliation = payload.reconciliation
  if (!availability || !reconciliation) {
    return { salesEstimateReliable: false, issues: ['missing-overview-or-reconciliation'] }
  }
  const sections = reconciliation.sections
  if (!Number.isSafeInteger(availability.total) || availability.total < 0) issues.push('invalid-overview-total')
  if ((payload.blocks || []).reduce((sum, block) => sum + block.resaleSeats, 0) !== payload.summary.resaleSeats) issues.push('resale-summary-mismatch')
  if (availability.blocks.reduce((sum, block) => sum + block.available, 0) !== availability.total) issues.push('overview-total-mismatch')
  // Classification can balance even for a truncated map. Numbered sections must
  // also match their configured seat count; standing configuration is not capacity.
  if (sections.some(section => section.status === 'compared' && (section.scanTotal <= 0 || (!section.standing && section.configuredTotalDelta !== null && section.configuredTotalDelta !== 0)))) issues.push('incomplete-seat-map')
  if (sections.some(section => section.status === 'duplicate-scan')) issues.push('duplicate-section-scan')
  if (sections.some(section => section.status !== 'compared' && section.shopAvailable > 0)) issues.push('available-section-not-scanned')
  if (sections.some(section => section.status === 'compared' && (section.scanOther > 0 || section.classificationDelta !== 0))) issues.push('unclassified-seats')
  if (reconciliation.unmatchedScans.length) issues.push('unmatched-section-scan')
  if (!Number.isSafeInteger(payload.summary.resaleSeats) || payload.summary.resaleSeats < 0 || payload.summary.resaleSeats > availability.total) issues.push('invalid-resale-total')
  return { salesEstimateReliable: issues.length === 0, issues }
}

function compareSnapshots(previous, current) {
  if (!previous?.availability || !current.availability) return null
  // Shop IDs are session-encoded; stadium polygon IDs identify the same physical section.
  const identity = block => block.polygonId ? `polygon:${block.polygonId}` : `id:${block.id}`
  const before = new Map(previous.availability.blocks.map(block => [identity(block), block]))
  const after = new Map(current.availability.blocks.map(block => [identity(block), block]))
  const scanMap = payload => new Map((payload.blocks || []).filter(block => block.sectionId).map(block => [block.sectionId, block]))
  // These maps deliberately stay local to each snapshot: old.id and next.id
  // already belong to their respective sessions, after polygon matching above.
  const oldScans = scanMap(previous)
  const newScans = scanMap(current)
  const sections = []
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const old = before.get(id)
    const next = after.get(id)
    const oldScan = old && oldScans.get(old.id)
    const newScan = next && newScans.get(next.id)
    const resaleDelta = oldScan && newScan ? newScan.resaleSeats - oldScan.resaleSeats : null
    const availableDelta = old && next ? next.available - old.available : null
    if (!old || !next || availableDelta !== 0 || (resaleDelta !== null && resaleDelta !== 0)) {
      sections.push({
        sectionId: next?.id ?? old.id, previousSectionId: old?.id ?? null,
        polygonId: next?.polygonId ?? old?.polygonId ?? null, label: next?.label ?? old?.label ?? id,
        status: !old ? 'added' : !next ? 'removed' : 'compared',
        availableBefore: old?.available ?? null, availableAfter: next?.available ?? null,
        availableDelta, resaleDelta,
      })
    }
  }
  const reliable = assessSnapshot(previous).salesEstimateReliable && assessSnapshot(current).salesEstimateReliable
  const availableDelta = current.availability.total - previous.availability.total
  const resaleDelta = current.summary.resaleSeats - previous.summary.resaleSeats
  return {
    version: 2,
    previousFetchedAt: previous.fetchedAt,
    availableDelta, resaleDelta,
    estimatedHomeSoldDelta: reliable ? -availableDelta + resaleDelta : null,
    note: 'Inventory changes do not identify purchases, cancellations or released holds. Null resale deltas mean missing comparable scans.',
    sections,
  }
}

// Preserve every complete JSON snapshot before replacing the public latest file.
function writeKscSnapshot(directory, id, payload) {
  if (!/^[a-zA-Z0-9._-]+$/.test(id) || id.includes('..')) throw new Error('Invalid snapshot ID')
  const currentFile = join(directory, `${id}.json`)
  let previous = null
  if (existsSync(currentFile)) previous = JSON.parse(readFileSync(currentFile, 'utf8'))
  const archiveDir = join(directory, 'history', id)
  // Propagate filesystem errors: publishing latest without its archive would lose evidence.
  mkdirSync(archiveDir, { recursive: true })
  const archive = snapshot => {
    if (!Number.isFinite(Date.parse(snapshot.fetchedAt))) throw new Error('Invalid snapshot timestamp')
    // Preserve millisecond precision. Identical retries are idempotent; conflicting
    // data at the same timestamp must fail rather than silently discard a reading.
    const filename = new Date(snapshot.fetchedAt).toISOString().replace(/:/g, '-') + '.json'
    try { writeFileSync(join(archiveDir, filename), JSON.stringify(snapshot, null, 2), { flag: 'wx' }) }
    catch (error) {
      if (error.code !== 'EEXIST') throw error
      const existing = JSON.parse(readFileSync(join(archiveDir, filename), 'utf8'))
      const raw = ({ dataQuality, changes, ...fields }) => fields
      if (!isDeepStrictEqual(raw(existing), raw(snapshot))) throw new Error(`Conflicting KSC snapshot at ${snapshot.fetchedAt}`)
    }
  }
  if (previous) archive(previous)
  const result = { ...payload, dataQuality: assessSnapshot(payload), changes: compareSnapshots(previous, payload) }
  archive(result)
  const temporary = `${currentFile}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(result, null, 2))
  renameSync(temporary, currentFile)
  return result
}

module.exports = { assessSnapshot, compareSnapshots, writeKscSnapshot }
