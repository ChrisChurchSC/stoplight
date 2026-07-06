/**
 * AEO (answer-engine optimization) opportunities — questions a brand already ranks for
 * in Search Console but doesn't answer in a citable way, each paired with a ready-to-
 * publish answer brief. Seeded from real GSC query data + the brand's positioning; the
 * production version pulls the queries live and drafts the answer from proof points and
 * episode transcripts. Answer engines lift the opening answer sentence, so the brief is
 * written to be extracted verbatim.
 */

export interface AeoOpportunity {
  id: string
  question: string
  cluster: string
  /** Monthly Search Console impressions this question (and its variants) draws. */
  impressions: number
  /** Average rank, and clicks captured (the gap: high impressions, ~0 clicks). */
  position: number
  clicks: number
  /** The 40 to 60 word answer written to be lifted verbatim by an answer engine. */
  answer: string
  /** A supporting proof point / stat, and the asset that backs the answer. */
  proof?: string
  source?: string
}

export const AEO_OPPORTUNITIES: Record<string, AeoOpportunity[]> = {
  'World Within': [
    {
      id: 'htctw',
      question: 'How can I change the world?',
      cluster: 'How to change the world',
      impressions: 560,
      position: 11.9,
      clicks: 0,
      answer:
        'The most durable way to change the world is to change who owns the economy. Back community-owned businesses, move your money to a mutual or community bank, and invest in or give to funds that put ownership in local hands. Small ownership shifts compound into lasting wealth and power for communities.',
      proof: 'World Within funds and films community-owned businesses through its Community Ownership Fund.',
      source: 'How to Change the World (series)',
    },
    {
      id: 'coop-vs-corp',
      question: 'What is the difference between a cooperative and a corporation?',
      cluster: 'Comparisons',
      impressions: 180,
      position: 8.0,
      clicks: 0,
      answer:
        'A corporation is owned by outside shareholders and run to maximize their returns. A cooperative is owned and democratically controlled by the people who use it or work in it, one member one vote, with profits shared among members instead of investors. A corporation concentrates wealth upward; a cooperative keeps it circulating locally.',
      proof: 'Members of a cooperative each get one vote, regardless of how much they invested.',
      source: 'Old Salt (a ranching cooperative)',
    },
    {
      id: 'what-is-coop',
      question: 'What is a cooperative business?',
      cluster: 'Cooperatives 101',
      impressions: 150,
      position: 12.0,
      clicks: 0,
      answer:
        'A cooperative is a business owned and democratically controlled by the people who use its services or work there, not outside shareholders. Members share the profits and each gets an equal vote. Common types are worker, consumer (like food co-ops), and producer cooperatives. The model keeps ownership, profit, and decisions with the community.',
      proof: 'Also answers the query "which type of business is owned and operated by the people who use its services or work there?" (110 impressions).',
      source: 'How to Change the World (series)',
    },
    {
      id: 'wimbledon',
      question: 'What happened to AFC Wimbledon?',
      cluster: 'Portfolio stories',
      impressions: 56,
      position: 9.0,
      clicks: 0,
      answer:
        'When Wimbledon FC was moved to Milton Keynes in 2002, fans founded AFC Wimbledon as a supporter-owned club, governed by its fans through the Dons Trust. It climbed from the ninth tier back into the Football League, one of the clearest proofs that community ownership works in sport.',
      proof: 'AFC Wimbledon is owned by its supporters, not an outside investor.',
      source: 'the AFC Wimbledon episode',
    },
    {
      id: 'food-coop',
      question: 'What is a food cooperative?',
      cluster: 'Cooperatives 101',
      impressions: 43,
      position: 20.0,
      clicks: 0,
      answer:
        'A food cooperative is a grocery store owned by its shoppers and workers rather than outside investors. Members buy a small equity share, get a vote in how it is run, and share in any surplus. Food co-ops tend to source locally and sustainably, keeping grocery dollars in the community.',
      source: 'How to Change the World (series)',
    },
    {
      id: 'mutual-bank',
      question: 'What is a mutual bank?',
      cluster: 'Cooperatives 101',
      impressions: 30,
      position: 10.7,
      clicks: 0,
      answer:
        'A mutual bank is owned by its depositors rather than outside shareholders. With no investors demanding ever-higher returns, mutual and community banks can reinvest more locally and share value with members. Moving your money to one is a simple way to fund community wealth instead of extractive finance.',
      source: 'How To Find A Better Bank (episode)',
    },
    {
      id: 'impact-vs-esg',
      question: 'What is the difference between impact investing and ESG?',
      cluster: 'Comparisons',
      impressions: 16,
      position: 13.1,
      clicks: 0,
      answer:
        'ESG screens investments to avoid harm and manage risk across environmental, social, and governance factors. Impact investing goes further: it deploys capital to create a measurable positive outcome, like funding a community-owned business, alongside a return. ESG is a filter on what you avoid; impact investing is an intention about what you build.',
      source: 'How to Change the World (series)',
    },
  ],
}

export function aeoOpportunities(brand: string): AeoOpportunity[] {
  return (AEO_OPPORTUNITIES[brand] ?? []).slice().sort((a, b) => b.impressions - a.impressions)
}

/** The FAQ / Q&A JSON-LD an answer engine reads, generated from the brief. */
export function aeoSchema(o: AeoOpportunity): string {
  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'QAPage',
      mainEntity: {
        '@type': 'Question',
        name: o.question,
        acceptedAnswer: { '@type': 'Answer', text: o.answer },
      },
    },
    null,
    2,
  )
}
