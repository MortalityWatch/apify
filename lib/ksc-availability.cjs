// Only count blocks offered by the shop, not every area in blockinfo.
function readAvailability(blockinfo, options) {
  if (!blockinfo || !options.length) return null
  const byId = new Map(Object.values(blockinfo).filter(Boolean).map(block => [String(block.tid), block]))
  const blocks = []
  const seen = new Set()
  for (const option of options) {
    if (!option.id || seen.has(option.id)) continue
    seen.add(option.id)
    const label = option.label.replace(/\s*\(\d+\)\s*$/, '').trim()
    // Away inventory is estimated separately by the dashboard.
    if (/\b(?:N4|NO|GAST)\b/i.test(label)) continue
    const block = byId.get(option.id)
    if (!block || !['y', 'n'].includes(block.numbered)) return null
    if (!/^\d+$/.test(String(block.sitze_frei))) return null
    const available = Number(block.sitze_frei)
    if (!Number.isSafeInteger(available)) return null
    const configuredTotal = /^\d+$/.test(String(block.sitze_gesamt)) && Number.isSafeInteger(Number(block.sitze_gesamt))
      ? Number(block.sitze_gesamt) : null
    blocks.push({
      id: option.id, label, standing: block.numbered === 'n', available,
      polygonId: block.polygon_ols || null,
      // Ticketing configuration, NOT necessarily physical/sellable capacity.
      configuredTotal,
    })
  }
  if (!blocks.length) return null
  const seated = blocks.filter(block => !block.standing).reduce((sum, block) => sum + block.available, 0)
  const standing = blocks.filter(block => block.standing).reduce((sum, block) => sum + block.available, 0)
  return { seated, standing, total: seated + standing, blocks }
}

function reconcileSections(availability, captured) {
  if (!availability) return null
  const byId = new Map()
  for (const block of captured) {
    if (!block.sectionId) continue
    const entries = byId.get(block.sectionId) || []
    entries.push(block)
    byId.set(block.sectionId, entries)
  }
  const sections = availability.blocks.map(shop => {
    const scans = byId.get(shop.id) || []
    const scan = scans.length === 1 ? scans[0] : null
    const open = scan ? scan.availableSeats + scan.resaleSeats + scan.sightRestrictedSeats : null
    const classified = scan ? scan.soldSeats + open + scan.otherSeats : null
    return {
      sectionId: shop.id, label: shop.label, standing: shop.standing,
      status: scans.length > 1 ? 'duplicate-scan' : scan ? 'compared' : 'not-captured',
      shopAvailable: shop.available,
      shopConfiguredTotal: shop.configuredTotal,
      shopObservedAt: availability.fetchedAt || null,
      scanObservedAt: scan?.capturedAt || null,
      scanTotal: scan?.totalSeats ?? null,
      scanAvailable: open,
      scanOther: scan?.otherSeats ?? null,
      // Positive means the shop reported more available tickets than the scan.
      availabilityDelta: scan ? shop.available - open : null,
      configuredTotalDelta: scan && !shop.standing && shop.configuredTotal !== null
        ? shop.configuredTotal - scan.totalSeats : null,
      classificationDelta: scan ? scan.totalSeats - classified : null,
    }
  })
  const knownIds = new Set(availability.blocks.map(block => block.id))
  const compared = sections.filter(section => section.status === 'compared')
  const unmatchedScans = captured.filter(block => !knownIds.has(block.sectionId))
    .map(block => ({ name: block.name, label: block.label, sectionId: block.sectionId || null }))
  const shopComparedAvailable = compared.reduce((sum, section) => sum + section.shopAvailable, 0)
  const scanComparedAvailable = compared.reduce((sum, section) => sum + section.scanAvailable, 0)
  const notComparedShopAvailable = sections.filter(section => section.status !== 'compared')
    .reduce((sum, section) => sum + section.shopAvailable, 0)
  return {
    note: 'Same scrape, different observation times. Unavailable does not distinguish sold from withheld. Standing configured totals are not physical capacities.',
    sections, unmatchedScans,
    totals: {
      shopAvailable: availability.total,
      shopComparedAvailable, scanComparedAvailable,
      availabilityDelta: shopComparedAvailable - scanComparedAvailable,
      notComparedShopAvailable,
      shopBreakdownDelta: availability.total - shopComparedAvailable - notComparedShopAvailable,
      comparedSections: compared.length,
      notCapturedSections: sections.filter(section => section.status === 'not-captured').length,
      duplicateSections: sections.filter(section => section.status === 'duplicate-scan').length,
    },
  }
}

module.exports = { readAvailability, reconcileSections }
