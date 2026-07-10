import { useEffect, useMemo, useState } from 'react'
import { useTrafficStore } from '../store/useTrafficStore'
import { ONBOARDING_STEPS, type OnboardingStepId } from '../domain/onboarding'
import { resolveBrandScope } from '../domain/brand'
import { CONTENT_LIBRARY_CAMPAIGN } from '../domain/importAssets'
import { UNASSIGNED } from '../domain/clients'

/**
 * "Getting started" — a floating, self-checking onboarding checklist that walks a new user
 * through the core loop: set up a brand, define the records campaigns pull from, build a flow,
 * write + review the copy. Steps auto-complete from real workspace state (a brand with a voice,
 * segments/proof defined, a campaign built with copy) and can also be checked off by hand.
 * Collapses to a compact pill; dismisses when you're done. Persisted via the store.
 *
 * Hidden on the Flows canvas, which has its own inline assistant, so it never covers the brief.
 */

// Ask the dev server once per page load whether a Claude/OpenRouter key is configured, so the
// "Connect Claude" step auto-completes when it actually is. Module-level so page switches (which
// remount the widget) don't refetch.
let aiStatusChecked = false

function StepIcon({ id }: { id: OnboardingStepId }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (id) {
    case 'brand':
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      )
    case 'segments':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <path d="M16 5.5a3 3 0 0 1 0 5" />
          <path d="M18.5 20a6 6 0 0 0-3.2-5.3" />
        </svg>
      )
    case 'proof':
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z" />
          <path d="m9 11.5 2 2 4-4" />
        </svg>
      )
    case 'flow':
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="2" />
          <circle cx="19" cy="6" r="2" />
          <circle cx="19" cy="18" r="2" />
          <path d="M7 12h3l7-5.5M10 12l7 5.5" />
        </svg>
      )
    case 'connect':
      return (
        <svg {...common}>
          <path d="M9 15l6-6" />
          <path d="M11 6.5l1-1a3.5 3.5 0 0 1 5 5l-1 1" />
          <path d="M13 17.5l-1 1a3.5 3.5 0 0 1-5-5l1-1" />
        </svg>
      )
    case 'review':
      return (
        <svg {...common}>
          <rect x="3" y="4.5" width="18" height="16.5" rx="2" />
          <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
        </svg>
      )
  }
}

export function GettingStarted() {
  const page = useTrafficStore((s) => s.page)
  const onboarding = useTrafficStore((s) => s.onboarding)
  const setCollapsed = useTrafficStore((s) => s.setOnboardingCollapsed)
  const dismiss = useTrafficStore((s) => s.dismissOnboarding)
  const reset = useTrafficStore((s) => s.resetOnboarding)
  const toggleStep = useTrafficStore((s) => s.toggleOnboardingStep)
  const markDone = useTrafficStore((s) => s.markOnboardingDone)
  const setPage = useTrafficStore((s) => s.setPage)
  const openFlow = useTrafficStore((s) => s.openFlow)

  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const clientAudiences = useTrafficStore((s) => s.clientAudiences)
  const brandSystems = useTrafficStore((s) => s.brandSystems)
  const brandMeta = useTrafficStore((s) => s.brandMeta)
  const campaignList = useTrafficStore((s) => s.campaignList)
  const [menuOpen, setMenuOpen] = useState(false)

  // Auto-complete "Connect Claude" when the server actually has a model key configured.
  useEffect(() => {
    if (aiStatusChecked) return
    aiStatusChecked = true
    fetch('/api/ai-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.connected) markDone('connect') })
      .catch(() => { aiStatusChecked = false })
  }, [markDone])

  // The workspace's primary brand: the client with the most real (non-archived, non-library)
  // campaigns, falling back to the first brand that has a profile. Detection is scoped to it.
  const brand = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of campaignList) {
      if (c.archivedAt || c.name === CONTENT_LIBRARY_CAMPAIGN) continue
      if (!c.client || c.client === UNASSIGNED) continue
      counts.set(c.client, (counts.get(c.client) ?? 0) + 1)
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    return top ?? Object.keys(clientProfiles)[0] ?? ''
  }, [campaignList, clientProfiles])

  const { brandCampaigns, auto } = useMemo(() => {
    const profile = brand ? clientProfiles[brand] : undefined
    const scope = brand ? resolveBrandScope(brand, brandSystems, brandMeta).library : null
    const segCount = (scope?.audiences.length ?? 0) || (clientAudiences[brand]?.length ?? 0)
    const proofCount = scope?.rtbs.length ?? 0
    const camps = campaignList.filter((c) => !c.archivedAt && c.client === brand && c.name !== CONTENT_LIBRARY_CAMPAIGN)
    const hasBrand = !!(profile?.voice?.trim() || profile?.oneLiner?.trim() || (profile?.voiceGuide?.traits?.length ?? 0) > 0)
    const map: Record<OnboardingStepId, boolean> = {
      brand: hasBrand,
      segments: segCount > 0,
      proof: proofCount > 0,
      flow: camps.length > 0,
      // Connect / review can't be read from client state (the Claude key lives server-side),
      // so they complete as teaching actions: checked off by hand, or when the calendar opens.
      connect: false,
      review: false,
    }
    return { brandCampaigns: camps, auto: map }
  }, [brand, clientProfiles, brandSystems, brandMeta, clientAudiences, campaignList])

  const isDone = (id: OnboardingStepId) => auto[id] || onboarding.done.includes(id)
  const steps = ONBOARDING_STEPS.map((s) => ({ ...s, done: isDone(s.id) }))
  const doneCount = steps.filter((s) => s.done).length
  const total = steps.length
  const allDone = doneCount === total
  const currentId = steps.find((s) => !s.done)?.id ?? null
  const latestCampaign = brandCampaigns[0]?.name ?? ''

  const go = (id: OnboardingStepId) => {
    switch (id) {
      case 'brand': setPage('account'); break
      case 'segments': setPage('segments'); break
      case 'proof': setPage('proofpoints'); break
      case 'flow': openFlow(''); break
      case 'connect': setPage('connectors'); break
      case 'review': openFlow(latestCampaign || ''); break
    }
  }

  if (onboarding.dismissed) return null
  // The flow canvas has its own inline assistant — don't stack a second guide over the brief.
  if (page === 'flows') return null

  if (onboarding.collapsed) {
    return (
      <button className="gs-pill" onClick={() => setCollapsed(false)} title="Open Getting started">
        <span className="gs-pill-label">Getting started</span>
        <span className="gs-pill-count">{doneCount}/{total}</span>
        <span className="gs-pill-bar" aria-hidden="true">
          <span className="gs-pill-bar-fill" style={{ width: `${(doneCount / total) * 100}%` }} />
        </span>
      </button>
    )
  }

  const encouragement = allDone ? "You're all set!" : doneCount === 0 ? "Let's get you set up." : doneCount < total / 2 ? 'Nice start.' : 'Looking good!'

  return (
    <section className="gs-card" role="group" aria-label="Getting started checklist">
      <header className="gs-head">
        <span className="gs-title">Getting started</span>
        <div className="gs-head-actions">
          <div className="gs-menu-wrap">
            <button className="gs-icon-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="More" title="More">⋯</button>
            {menuOpen && (
              <>
                <div className="gs-menu-scrim" onClick={() => setMenuOpen(false)} />
                <div className="gs-menu">
                  <button className="gs-menu-item" onClick={() => { reset(); setMenuOpen(false) }}>Reset progress</button>
                  <button className="gs-menu-item" onClick={() => { dismiss(); setMenuOpen(false) }}>Dismiss checklist</button>
                </div>
              </>
            )}
          </div>
          <button className="gs-icon-btn" onClick={() => setCollapsed(true)} aria-label="Collapse" title="Collapse">↙</button>
        </div>
      </header>
      <div className="gs-sub">
        <span className="gs-sub-count">{doneCount}/{total} steps completed</span>
        <span className="gs-sub-sep" aria-hidden="true">·</span>
        <span className="gs-sub-note">{encouragement}</span>
      </div>
      <div className="gs-bar" aria-hidden="true">
        {steps.map((s) => (
          <span key={s.id} className={`gs-bar-seg${s.done ? ' on' : ''}`} />
        ))}
      </div>
      <div className="gs-steps">
        {steps.map((s) => {
          const current = s.id === currentId
          return (
            <div key={s.id} className={`gs-step${s.done ? ' done' : ''}${current ? ' current' : ''}`}>
              <span className="gs-step-ic" aria-hidden="true"><StepIcon id={s.id} /></span>
              <button className="gs-step-main" onClick={() => go(s.id)}>
                <span className="gs-step-title">{s.title}</span>
                {current && <span className="gs-step-hint">{s.hint}</span>}
              </button>
              <button
                className={`gs-check${s.done ? ' on' : ''}`}
                onClick={() => toggleStep(s.id)}
                aria-label={s.done ? 'Mark not done' : 'Mark done'}
                title={s.done ? 'Mark not done' : 'Mark done'}
              >
                {s.done ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12.5 4.5 4.5L19 6.5" />
                  </svg>
                ) : null}
              </button>
            </div>
          )
        })}
      </div>
      {allDone && (
        <button className="gs-done-btn" onClick={dismiss}>Dismiss checklist</button>
      )}
    </section>
  )
}
