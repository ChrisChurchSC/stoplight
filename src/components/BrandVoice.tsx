import { useEffect, useMemo, useState } from 'react'
import { resolveBrandVoice } from '../domain/brand'
import type { VoiceGuide, VoiceTone } from '../domain/clients'
import { useTrafficStore } from '../store/useTrafficStore'
import { ChipInput } from './ChipInput'

/**
 * The brand-voice guide inside a brand folder — the full reference for how the brand
 * sounds. The short `voice` summary at the top is the compact line generation is
 * prompted with and the coherence check measures against; everything below is the
 * detailed guide the team writes to and reviews against (personality, tone dimensions,
 * do/don't, lexicon, mechanics, and sample copy). A sub-brand with no summary of its
 * own inherits its parent's.
 */

const TONE_DIMS: { key: keyof VoiceTone; left: string; right: string }[] = [
  { key: 'funnySerious', left: 'Funny', right: 'Serious' },
  { key: 'casualFormal', left: 'Casual', right: 'Formal' },
  { key: 'irreverentRespectful', left: 'Irreverent', right: 'Respectful' },
  { key: 'enthusiasticMatterOfFact', left: 'Enthusiastic', right: 'Matter-of-fact' },
]

const lines = (s: string): string[] => s.split('\n').map((x) => x.trim()).filter(Boolean)

export function BrandVoice({ brand }: { brand: string }) {
  const clientProfiles = useTrafficStore((s) => s.clientProfiles)
  const brandMeta = useTrafficStore((s) => s.brandMeta)
  const setClientProfile = useTrafficStore((s) => s.setClientProfile)

  const [summary, setSummary] = useState('')
  const [guide, setGuide] = useState<VoiceGuide>({})
  const [dirty, setDirty] = useState(false)

  // Seed from the stored profile when the brand changes (not on every write, so an
  // in-progress edit isn't clobbered).
  useEffect(() => {
    const p = clientProfiles[brand]
    setSummary((p?.voice as string | undefined) ?? '')
    setGuide((p?.voiceGuide as VoiceGuide | undefined) ?? {})
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand])

  // With no summary of its own, the brand inherits up the tree — surface that so an
  // empty field reads as "inheriting", not "unset".
  const own = ((clientProfiles[brand]?.voice as string | undefined) ?? '').trim()
  const inherited = own ? undefined : resolveBrandVoice(brand, (b) => clientProfiles[b]?.voice, brandMeta)

  const setG = <K extends keyof VoiceGuide>(key: K, value: VoiceGuide[K]) => {
    setGuide((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }
  const setTone = (key: keyof VoiceTone, value: number) =>
    setG('tone', { ...(guide.tone ?? {}), [key]: value })

  const save = () => {
    // Trim/compact the guide so empty fields don't persist as noise.
    const clean: VoiceGuide = {
      traits: guide.traits?.length ? guide.traits : undefined,
      tone: guide.tone && Object.keys(guide.tone).length ? guide.tone : undefined,
      dos: guide.dos?.length ? guide.dos : undefined,
      donts: guide.donts?.length ? guide.donts : undefined,
      preferredWords: guide.preferredWords?.length ? guide.preferredWords : undefined,
      avoidWords: guide.avoidWords?.length ? guide.avoidWords : undefined,
      mechanics: guide.mechanics?.trim() || undefined,
      readingLevel: guide.readingLevel?.trim() || undefined,
      tagline: guide.tagline?.trim() || undefined,
      examples: guide.examples?.length ? guide.examples : undefined,
    }
    setClientProfile(brand, { voice: summary.trim(), voiceGuide: clean })
    setDirty(false)
  }

  const toneVal = (key: keyof VoiceTone) => guide.tone?.[key] ?? 50

  // Text areas edit list fields as one-item-per-line; keep the raw text local so a
  // trailing newline mid-edit doesn't vanish.
  const listText = useMemo(
    () => ({
      dos: (guide.dos ?? []).join('\n'),
      donts: (guide.donts ?? []).join('\n'),
      examples: (guide.examples ?? []).join('\n'),
    }),
    [guide.dos, guide.donts, guide.examples],
  )

  return (
    <div className="brand-info brand-voice">
      <p className="brand-voice-intro">
        How {brand} sounds. The <strong>summary</strong> is the line every canvas is generated in and the one the
        coherence check measures copy against; the guide below is the full reference the team writes to.
      </p>

      {/* Summary — the consumed line. */}
      <section className="voice-section">
        <div className="voice-section-head">
          <h2 className="voice-section-title">Voice summary</h2>
          <span className="voice-section-tag">used by generation</span>
        </div>
        <textarea
          className="library-input voice-summary"
          rows={4}
          placeholder={inherited ? `Inheriting: ${inherited}` : 'e.g. Plain, technical, no hype. Lead with proof, skip the jargon.'}
          value={summary}
          onChange={(e) => {
            setSummary(e.target.value)
            setDirty(true)
          }}
        />
        {inherited && !own && (
          <p className="brand-voice-inherit">
            No summary set for {brand} — inheriting from its parent. Type here to give {brand} its own.
          </p>
        )}
      </section>

      {/* Personality. */}
      <section className="voice-section">
        <div className="voice-section-head">
          <h2 className="voice-section-title">Personality</h2>
          <span className="voice-section-sub">Adjectives that describe the brand's character.</span>
        </div>
        <ChipInput
          values={guide.traits ?? []}
          onChange={(v) => setG('traits', v)}
          placeholder="Add a trait and press Enter (e.g. warm, candid, wry)"
        />
      </section>

      {/* Tone dimensions. */}
      <section className="voice-section">
        <div className="voice-section-head">
          <h2 className="voice-section-title">Tone dimensions</h2>
          <span className="voice-section-sub">Where the brand sits between each pair. 50 is neutral.</span>
        </div>
        <div className="voice-tone">
          {TONE_DIMS.map((d) => (
            <div className="voice-tone-row" key={d.key}>
              <span className="voice-tone-end left">{d.left}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={toneVal(d.key)}
                onChange={(e) => setTone(d.key, Number(e.target.value))}
                className="voice-tone-slider"
                aria-label={`${d.left} to ${d.right}`}
              />
              <span className="voice-tone-end right">{d.right}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Do / Don't. */}
      <section className="voice-section">
        <div className="voice-section-head">
          <h2 className="voice-section-title">Do &amp; don&apos;t</h2>
          <span className="voice-section-sub">One rule per line.</span>
        </div>
        <div className="voice-grid">
          <label className="library-field">
            <span className="library-field-label">✓ Do</span>
            <textarea
              className="library-input"
              rows={5}
              placeholder={'Lead with the outcome\nUse specific numbers\nWrite like you talk'}
              value={listText.dos}
              onChange={(e) => setG('dos', lines(e.target.value))}
            />
          </label>
          <label className="library-field">
            <span className="library-field-label">✕ Don&apos;t</span>
            <textarea
              className="library-input"
              rows={5}
              placeholder={"Don't hype or exaggerate\nAvoid buzzwords\nNo walls of text"}
              value={listText.donts}
              onChange={(e) => setG('donts', lines(e.target.value))}
            />
          </label>
        </div>
      </section>

      {/* Lexicon. */}
      <section className="voice-section">
        <div className="voice-section-head">
          <h2 className="voice-section-title">Lexicon</h2>
          <span className="voice-section-sub">Words we reach for, and words we never use.</span>
        </div>
        <div className="voice-grid">
          <div className="library-field">
            <span className="library-field-label">Words we use</span>
            <ChipInput
              values={guide.preferredWords ?? []}
              onChange={(v) => setG('preferredWords', v)}
              placeholder="Add a word and press Enter"
            />
          </div>
          <div className="library-field">
            <span className="library-field-label">Words to avoid</span>
            <ChipInput
              values={guide.avoidWords ?? []}
              onChange={(v) => setG('avoidWords', v)}
              placeholder="Add a word and press Enter"
            />
          </div>
        </div>
      </section>

      {/* Mechanics + reading level + tagline. */}
      <section className="voice-section">
        <div className="voice-section-head">
          <h2 className="voice-section-title">Grammar &amp; mechanics</h2>
          <span className="voice-section-sub">Capitalization, punctuation, emoji, contractions, sentence length.</span>
        </div>
        <textarea
          className="library-input"
          rows={3}
          placeholder="e.g. Sentence case for headlines. Oxford comma. Contractions are fine. Emoji sparingly, never in headlines."
          value={guide.mechanics ?? ''}
          onChange={(e) => setG('mechanics', e.target.value)}
        />
        <div className="voice-grid voice-grid-tight">
          <label className="library-field">
            <span className="library-field-label">Reading level</span>
            <input
              className="library-input"
              placeholder="e.g. 8th grade · short sentences"
              value={guide.readingLevel ?? ''}
              onChange={(e) => setG('readingLevel', e.target.value)}
            />
          </label>
          <label className="library-field">
            <span className="library-field-label">Tagline / signature line</span>
            <input
              className="library-input"
              placeholder="The one line that sounds like no one else"
              value={guide.tagline ?? ''}
              onChange={(e) => setG('tagline', e.target.value)}
            />
          </label>
        </div>
      </section>

      {/* Sample copy. */}
      <section className="voice-section">
        <div className="voice-section-head">
          <h2 className="voice-section-title">Sample copy</h2>
          <span className="voice-section-sub">Lines that sound unmistakably on-brand. One per line.</span>
        </div>
        <textarea
          className="library-input"
          rows={5}
          placeholder={'“You did the work. We just kept score.”\n“No fluff. Just the number that matters.”'}
          value={listText.examples}
          onChange={(e) => setG('examples', lines(e.target.value))}
        />
      </section>

      <div className="voice-savebar">
        <button className="btn primary sm" onClick={save} disabled={!dirty}>
          {dirty ? '✓ Save voice guide' : 'Saved'}
        </button>
        {dirty && <span className="voice-savebar-hint">Unsaved changes</span>}
      </div>
    </div>
  )
}
