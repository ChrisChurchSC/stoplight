import type { Icp } from '../icp/types'
import type { Attribution, AttioAdapter, AttioContact, AttioDeal } from './types'

// Seed contacts (leads) tied to the sample campaign's assets — first-touch source.
const CONTACTS: AttioContact[] = [
  { email: 'dana@northwind.io', name: 'Dana Reyes', company: 'Northwind', sourceAsset: 'acme-case-study.pdf', sourceCampaign: 'Q2 Demand Gen' },
  { email: 'sam@globex.com', name: 'Sam Ito', company: 'Globex', sourceAsset: 'acme-case-study.pdf', sourceCampaign: 'Q2 Demand Gen' },
  { email: 'priya@initech.com', name: 'Priya Shah', company: 'Initech', sourceAsset: 'spring-launch-lp', sourceCampaign: 'Spring Launch 2026' },
  { email: 'marco@umbrella.co', name: 'Marco Diaz', company: 'Umbrella', sourceAsset: 'spring-launch-lp', sourceCampaign: 'Spring Launch 2026' },
  { email: 'lee@hooli.com', name: 'Lee Park', company: 'Hooli', sourceAsset: 'webinar-invite.md', sourceCampaign: 'Webinar: Scaling Ops' },
  { email: 'ana@piedpiper.com', name: 'Ana Costa', company: 'Pied Piper', sourceAsset: 'spring-launch-lp', sourceCampaign: 'Spring Launch 2026' },
]

const DEALS: AttioDeal[] = [
  { id: 'd1', contactEmail: 'dana@northwind.io', amount: 48000, stage: 'closed-won', sourceAsset: 'acme-case-study.pdf', sourceCampaign: 'Q2 Demand Gen' },
  { id: 'd2', contactEmail: 'priya@initech.com', amount: 72000, stage: 'closed-won', sourceAsset: 'spring-launch-lp', sourceCampaign: 'Spring Launch 2026' },
  { id: 'd3', contactEmail: 'ana@piedpiper.com', amount: 36000, stage: 'closed-won', sourceAsset: 'spring-launch-lp', sourceCampaign: 'Spring Launch 2026' },
  { id: 'd4', contactEmail: 'sam@globex.com', amount: 24000, stage: 'open', sourceAsset: 'acme-case-study.pdf', sourceCampaign: 'Q2 Demand Gen' },
  { id: 'd5', contactEmail: 'lee@hooli.com', amount: 18000, stage: 'closed-lost', sourceAsset: 'webinar-invite.md', sourceCampaign: 'Webinar: Scaling Ops' },
]

export class MockAttioAdapter implements AttioAdapter {
  private contacts = [...CONTACTS]
  private deals = [...DEALS]

  async pushContact(contact: AttioContact): Promise<void> {
    // Dedup on email (reconciled with the upstream enrichment sync by the same key).
    const existing = this.contacts.find((c) => c.email === contact.email)
    if (existing) Object.assign(existing, contact)
    else this.contacts.push(contact)
  }

  listContacts(): AttioContact[] {
    return this.contacts
  }

  listDeals(): AttioDeal[] {
    return this.deals
  }

  attributionForAsset(assetName: string): Attribution {
    const leads = this.contacts.filter((c) => c.sourceAsset === assetName).length
    const dealsForAsset = this.deals.filter((d) => d.sourceAsset === assetName)
    return {
      leads,
      openDeals: dealsForAsset.filter((d) => d.stage === 'open').length,
      wonRevenue: dealsForAsset
        .filter((d) => d.stage === 'closed-won')
        .reduce((a, d) => a + d.amount, 0),
    }
  }

  totalWonRevenue(): number {
    return this.deals
      .filter((d) => d.stage === 'closed-won')
      .reduce((a, d) => a + d.amount, 0)
  }

  /**
   * Refine the ICP from actual closed-won customers — the compounding loop:
   * who actually closed sharpens who the next round of content targets.
   */
  closedWonIcp(): Icp {
    const won = this.deals.filter((d) => d.stage === 'closed-won')
    const revenue = won.reduce((a, d) => a + d.amount, 0)
    return {
      name: 'Mid-market Ops leaders (closed-won)',
      segment: 'Validated — Series B+',
      summary: `Grounded in ${won.length} closed-won deals worth $${revenue.toLocaleString()}. Closers skew larger mid-market (500–2,000 employees) and converted off proof-led assets (case study, landing page) — they buy on time-to-value and evidence, not hype.`,
      firmographics: [
        { label: 'Industry', value: 'B2B SaaS' },
        { label: 'Company size', value: '500–2,000 employees' },
        { label: 'Region', value: 'North America' },
        { label: 'Buyer', value: 'VP / Director of Operations' },
        { label: 'Signal', value: 'Engaged a proof asset (case study / LP)' },
      ],
      pains: ['manual workflows', 'slow tools', 'busywork', 'time-to-value', 'proof', 'speed', 'faster'],
    }
  }
}

export const mockAttio = new MockAttioAdapter()
