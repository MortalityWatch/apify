function parseTipicoResponse(status, contentType, body) {
  if (status < 200 || status >= 300) {
    throw new Error(`Tipico returned HTTP ${status}`)
  }
  if (/Tipico No Service|country where gambling is restricted/.test(body)) {
    throw new Error('Tipico blocked the scraper country. Configure TIPICO_PROXY_SERVER with an allowed egress location.')
  }
  if (!/\bapplication\/json\b/i.test(contentType || '')) {
    throw new Error(`Tipico returned ${contentType || 'an unknown content type'} instead of JSON`)
  }
  const data = JSON.parse(body)
  const events = data?.SELECTION?.events
  if (!events || typeof events !== 'object' || Array.isArray(events)) {
    throw new Error('Tipico response is missing SELECTION.events')
  }
  return data
}

module.exports = { parseTipicoResponse }
