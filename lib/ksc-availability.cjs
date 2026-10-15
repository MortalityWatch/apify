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
    if (/\b(?:N4|NO)\b/i.test(label)) continue
    const block = byId.get(option.id)
    if (!block || !['y', 'n'].includes(block.numbered)) return null
    if (!/^\d+$/.test(String(block.sitze_frei))) return null
    const available = Number(block.sitze_frei)
    if (!Number.isSafeInteger(available)) return null
    blocks.push({ id: option.id, label, standing: block.numbered === 'n', available })
  }
  if (!blocks.length) return null
  const seated = blocks.filter(block => !block.standing).reduce((sum, block) => sum + block.available, 0)
  const standing = blocks.filter(block => block.standing).reduce((sum, block) => sum + block.available, 0)
  return { seated, standing, total: seated + standing, blocks }
}

module.exports = { readAvailability }
