import type { MarketerRole } from './userPrefs'

/**
 * Role presets: bias only, never a lock. Picking a Focus sets where you land and the GTM strategy
 * new quick campaigns lean toward; everything stays reachable. Growth = the full experience, so a
 * mis-pick is never worse than neutral. See the design plan.
 */
export interface RolePreset {
  /** The surface this role opens on when picked. */
  landingPage: 'flows' | 'brand' | 'segments' | 'reports'
  landingLabel: string
  /** A GTM_STRATEGIES key: the motion this role's campaigns lean toward. */
  defaultStrategy: string
  /** Sidebar sections (labels in NAV_SECTIONS) to pre-expand for this role, so the discipline it
   * works in leads. Emphasis only, the user can collapse/expand freely. Growth = the full picture. */
  sections: string[]
}

export const ROLE_PRESETS: Record<MarketerRole, RolePreset> = {
  email: { landingPage: 'flows', landingLabel: 'Campaigns', defaultStrategy: 'lifecycle', sections: ['Go-to-market'] },
  brand: { landingPage: 'brand', landingLabel: 'Brand', defaultStrategy: 'content-seo', sections: ['Foundation'] },
  product: { landingPage: 'segments', landingLabel: 'Audiences', defaultStrategy: 'plg', sections: ['Prospects'] },
  growth: { landingPage: 'reports', landingLabel: 'Insights', defaultStrategy: 'demand-gen', sections: ['Foundation', 'Prospects', 'Go-to-market'] },
}
