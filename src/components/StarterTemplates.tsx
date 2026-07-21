import { useTrafficStore } from '../store/useTrafficStore'
import { STARTER_TEMPLATES } from '../domain/starterTemplates'

/**
 * Quick-start template picker: a beginner picks a goal and we draft a role-appropriate campaign via
 * the proven home-chat build path, or starts from a blank builder. Ordered by the user's Focus so
 * their role's template leads. Opened from the Home "Draft a campaign" action and Campaigns "+ New".
 */
export function StarterTemplates() {
  const open = useTrafficStore((s) => s.starterTemplatesOpen)
  const close = useTrafficStore((s) => s.closeStarterTemplates)
  const openHomeChat = useTrafficStore((s) => s.openHomeChat)
  const openFlow = useTrafficStore((s) => s.openFlow)
  const role = useTrafficStore((s) => s.userPrefs.marketerRole)

  if (!open) return null
  const templates = [...STARTER_TEMPLATES].sort(
    (a, b) => (b.role === role ? 1 : 0) - (a.role === role ? 1 : 0),
  )
  const pick = (seed: string) => {
    close()
    openHomeChat(seed)
  }

  return (
    <>
      <div className="drawer-scrim" onClick={close} />
      <div className="starter" role="dialog" aria-label="Start a campaign">
        <div className="starter-head">
          <div>
            <div className="starter-title">Start a campaign</div>
            <div className="starter-sub">Pick a goal and we draft it for you, or start from scratch.</div>
          </div>
          <button className="btn ghost sm" onClick={close}>
            Close
          </button>
        </div>
        <div className="starter-grid">
          {templates.map((t) => (
            <button
              key={t.key}
              className={`starter-card${t.role === role ? ' suggested' : ''}`}
              onClick={() => pick(t.seed)}
              title={t.sub}
            >
              <span className="starter-card-ic" aria-hidden="true">{t.icon}</span>
              <span className="starter-card-title">
                {t.label}
                {t.role === role && <span className="starter-tag">For you</span>}
              </span>
              <span className="starter-card-sub">{t.sub}</span>
            </button>
          ))}
          <button className="starter-card starter-scratch" onClick={() => { close(); openFlow('') }}>
            <span className="starter-card-ic" aria-hidden="true">✎</span>
            <span className="starter-card-title">Start from scratch</span>
            <span className="starter-card-sub">Open a blank campaign builder and add your own.</span>
          </button>
        </div>
      </div>
    </>
  )
}
