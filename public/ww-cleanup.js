// Trim this origin's localStorage down to only the World Within client, then
// reload. Loaded via `import('/ww-cleanup.js')` from the DevTools console so
// there is no copy-paste (and no smart-quote) to mangle. Mirrors how the app
// groups rows by client, so everything attributed to the other clients (and the
// Unassigned catch-all) is removed. Your full backup stays in public/ww-state.json.
(() => {
  const KEEP = 'World Within'
  const get = (k) => {
    try {
      return JSON.parse(localStorage.getItem(k) || 'null')
    } catch {
      return null
    }
  }
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v))

  const campaigns = get('stoplight.campaigns.v1') || []
  // Resolve each campaign to its client (runtime campaigns + the hardcoded samples).
  const cc = {
    'Spring Launch 2026': 'Acme Co',
    'Q2 Demand Gen': 'Acme Co',
    'Webinar: Scaling Ops': 'Globex',
  }
  for (const c of campaigns) cc[c.name] = c.client
  const keptCamps = new Set(campaigns.filter((c) => c.client === KEEP).map((c) => c.name))

  set('stoplight.clients.v1', [KEEP])
  set('stoplight.campaigns.v1', campaigns.filter((c) => c.client === KEEP))

  for (const k of [
    'stoplight.clientProfiles.v1',
    'stoplight.clientAudiences.v1',
    'stoplight.brandGuides.v1',
    'stoplight.driveLinks.v1',
  ]) {
    const rec = get(k)
    if (rec && typeof rec === 'object') set(k, rec[KEEP] !== undefined ? { [KEEP]: rec[KEEP] } : {})
  }

  const rtbs = get('stoplight.campaignRtbs.v1') || {}
  set('stoplight.campaignRtbs.v1', Object.fromEntries(Object.entries(rtbs).filter(([c]) => keptCamps.has(c))))

  const sheet = get('stoplight.sheet.v1')
  if (sheet && Array.isArray(sheet.rows)) {
    const rowClient = (r) => cc[(r.campaign || '').trim()] || 'Unassigned'
    set('stoplight.sheet.v1', { ...sheet, rows: sheet.rows.filter((r) => rowClient(r) === KEEP) })
  }

  const counts = {
    clients: (get('stoplight.clients.v1') || []).length,
    campaigns: (get('stoplight.campaigns.v1') || []).length,
    rows: (get('stoplight.sheet.v1') || { rows: [] }).rows.length,
  }
  console.log('[ww-cleanup] kept only', KEEP, counts, '— reloading')
  location.reload()
})()
