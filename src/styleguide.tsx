import { useEffect, useMemo, useState, type ReactNode } from 'react'
import css from './styles.css?raw'
import { GlassButton, GlassGroup, Group, Page, QuoteText, Row, Segmented, Sheet } from './components'
import { Icon, iconNames } from './icons'
import { haptic } from './motion'
import { bandFor, bezierPoints, cheapToAnimate, houseEasing, readStyles, SCALE, type StyleFacts } from './styleRules'

/**
 * The house style, shown with the app's own parts: its tokens, components, glyphs and motion.
 * Everything here is imported or read from styles.css as it is now, so the page can't drift
 * from the app; where the stylesheet drifts from the rules in CLAUDE.md, it says so at the bottom.
 */

/** Short samples written for this page, so nothing here is quoted from a book. */
const SAMPLE_EN = 'A page worth keeping, copied out by hand and found again years later.'
const SAMPLE_GU = 'સારું વાક્ય મનમાં રહી જાય છે, અને પાનું ફરી ખોલવાનું મન થાય છે.'

/** The three golds and where each belongs (CLAUDE.md, "Two golds"). */
const GOLDS = [
  { name: '--gold', value: 'var(--gold)', use: 'On light pages: quote marks, accents' },
  { name: 'Luminous', value: 'rgb(240, 200, 105)', use: 'On dark: capture, scanning' },
  { name: 'Ceremony', value: 'rgb(232, 194, 122)', use: 'Filing a quote into the sea' },
]
const DARK = '#070706' // the capture screen

const isColor = (v: string) => /^(#|rgba?\()/.test(v)

export function StyleGuide() {
  const facts = useMemo(() => readStyles(css), [])
  const [calm, setCalm] = useState<'full' | 'reduced'>('full')

  return (
    <Page title="Style guide" back="#/settings">
      <div className={`style-guide ${calm === 'reduced' ? 'calm' : ''}`}>
        <p className="footnote">
          The app's own parts, as they are in the code today. Read from <code>styles.css</code> live, so the numbers here are the real ones.
        </p>
        <Segmented
          value={calm}
          onChange={setCalm}
          options={[
            { value: 'full', label: 'Full motion' },
            { value: 'reduced', label: 'Reduce Motion' },
          ]}
        />
        <p className="footnote">Reduce Motion here applies to this page's demos, the way the system setting applies to the whole app.</p>

        <Colors facts={facts} />
        <Type facts={facts} />
        <Icons />
        <Controls />
        <Motion facts={facts} />
        <Drift facts={facts} />
      </div>
    </Page>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sg-section">
      <h2 className="label">{title}</h2>
      {children}
    </section>
  )
}

/* ───────────── Color ───────────── */

function Colors({ facts }: { facts: StyleFacts }) {
  const swatches = facts.tokens.filter((t) => isColor(t.value))
  return (
    <Section title="Color">
      <div className="sg-swatches">
        {swatches.map((t) => (
          <div key={t.name} className="sg-swatch">
            <span className="sg-chip" style={{ background: `var(${t.name})` }} />
            <span className="sg-name">{t.name}</span>
            <span className="meta-mono">{t.value}</span>
          </div>
        ))}
      </div>

      <h3 className="sg-sub">The golds, on white and on the dark capture screen</h3>
      <div className="sg-golds">
        {[{ bg: 'var(--bg)', dark: false }, { bg: DARK, dark: true }].map(({ bg, dark }) => (
          <div key={bg} className={`sg-panel ${dark ? 'dark' : ''}`} style={{ background: bg }}>
            {GOLDS.map((g) => (
              <div key={g.name} className="sg-gold">
                <span className="sg-gold-mark" style={{ color: g.value }}>
                  “
                </span>
                <span>
                  <span className="sg-name">{g.name}</span>
                  <span className="sg-use">{g.use}</span>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="footnote">Deep gold goes muddy on dark and bright gold vanishes on white, so each background has its own.</p>
    </Section>
  )
}

/* ───────────── Type ───────────── */

function Type({ facts }: { facts: StyleFacts }) {
  return (
    <Section title="Type">
      <div className="sg-families">
        <div>
          <span className="sg-name">--sans · quotes and interface</span>
          <p style={{ font: '400 19px/1.35 var(--sans)', margin: '4px 0 0' }}>{SAMPLE_EN}</p>
        </div>
        <div>
          <span className="sg-name">--serif · book titles</span>
          <p style={{ font: '500 21px/1.3 var(--serif)', margin: '4px 0 0' }}>The Long Way Home</p>
        </div>
        <div>
          <span className="sg-name">--mono · labels</span>
          <span className="label" style={{ margin: '6px 0 0' }}>
            March <span className="label-count">12</span>
          </span>
        </div>
      </div>

      <h3 className="sg-sub">Quotes in both scripts</h3>
      <div className="sg-quotes">
        <QuoteText text={SAMPLE_EN} />
        <QuoteText text={SAMPLE_GU} />
        <QuoteText text={SAMPLE_GU} latin />
      </div>
      <p className="footnote">Gujarati gets more line height and no letter-spacing (the .gu class), and can be shown in Latin letters by the BAPS scheme.</p>

      <h3 className="sg-sub">Every font size in the stylesheet</h3>
      <div className="sg-sizes">
        {facts.sizes.map((s) => (
          <div key={s.px} className="sg-size" title={s.where.join('\n')}>
            <span style={{ fontSize: s.px, lineHeight: 1.1 }}>Aa ગુ</span>
            <span className="meta-mono">
              {s.px}px · {s.where.length} {s.where.length === 1 ? 'place' : 'places'}
            </span>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ───────────── Icons ───────────── */

function Icons() {
  const [run, setRun] = useState(0)
  return (
    <Section title={`Icons · ${iconNames.length}`}>
      <div className="sg-icons" key={run}>
        {iconNames.map((name) => (
          <div key={name} className="sg-icon">
            <Icon name={name} size={28} animate={run > 0} />
            <span className="meta-mono">{name}</span>
          </div>
        ))}
      </div>
      <button type="button" className="text-button" onClick={() => setRun((r) => r + 1)}>
        Replay: dots gather from the center
      </button>
      <p className="footnote">Each icon is a text grid in icons.tsx, where # is a dot. A new icon is a new glyph, never an SVG file.</p>
    </Section>
  )
}

/* ───────────── Controls and surfaces ───────────── */

function Controls() {
  const [seg, setSeg] = useState<'a' | 'b' | 'c'>('a')
  const [sheet, setSheet] = useState(false)
  return (
    <Section title="Controls and surfaces">
      <h3 className="sg-sub">Glass, for controls only</h3>
      <div className="sg-row">
        <GlassButton icon="back" ariaLabel="Back" />
        <GlassButton label="Edit" />
        <GlassButton label="Done" prominent />
        <GlassButton label="Delete" destructive />
        <GlassButton label="Off" disabled />
        <GlassGroup>
          <GlassButton icon="share" ariaLabel="Share" />
          <GlassButton icon="search" ariaLabel="Search" />
        </GlassGroup>
      </div>

      <h3 className="sg-sub">Buttons</h3>
      <div className="sg-stack">
        <button type="button" className="ink-button">
          Ink button
        </button>
        <button type="button" className="ink-button" disabled>
          Ink button, disabled
        </button>
        <div className="sg-row">
          <span className="pill">Pill</span>
          <span className="chip">Chip</span>
          <button type="button" className="text-button">
            Text button
          </button>
          <button type="button" className="text-button destructive">
            Destructive
          </button>
        </div>
      </div>
      <div className="sg-panel dark sg-stack" style={{ background: DARK }}>
        <button type="button" className="light-button">
          Light button, on dark
        </button>
        <button type="button" className="dark-button">
          Dark button, on dark
        </button>
      </div>

      <h3 className="sg-sub">Segmented control</h3>
      <Segmented
        value={seg}
        onChange={setSeg}
        options={[
          { value: 'a', label: 'Timeline' },
          { value: 'b', label: 'By book' },
          { value: 'c', label: 'Tags' },
        ]}
      />

      <h3 className="sg-sub">Grouped rows</h3>
      <Group header="Group header" footer="A footer explains what the rows above do, in a sentence.">
        <Row icon="book" label="Row with a value" value="Value" />
        <Row label="Tappable row" chevron onClick={() => {}} />
        <Row tint label="Tinted action" onClick={() => {}} />
        <Row destructive label="Destructive action" onClick={() => {}} />
        <Row label="Empty value" placeholder="Not set" />
      </Group>

      <h3 className="sg-sub">Sheet</h3>
      <button type="button" className="ink-button" onClick={() => setSheet(true)}>
        Open a sheet
      </button>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Sheet" trailing={<GlassButton label="Done" prominent onClick={() => setSheet(false)} />}>
        <p className="footnote">Drag the top down to dismiss, or tap Done. Content sits on the sheet, never on glass.</p>
      </Sheet>
    </Section>
  )
}

/* ───────────── Motion ───────────── */

function Motion({ facts }: { facts: StyleFacts }) {
  const spring = facts.tokens.find((t) => t.name === '--spring')?.value ?? ''
  const pts = bezierPoints(spring)
  const [run, setRun] = useState(0)
  const timed = facts.durations.filter((d) => !d.loop)
  const longest = Math.max(1, ...timed.map((d) => d.seconds))

  return (
    <Section title="Motion">
      <h3 className="sg-sub">One easing: --spring</h3>
      {pts && <Curve pts={pts} />}
      <p className="meta-mono">{spring}</p>
      <p className="footnote">Fast out, long settle. Movement uses it; plain ease is allowed for fades. Only transform and opacity are animated.</p>

      <h3 className="sg-sub">The duration scale</h3>
      <div className="sg-scale">
        {SCALE.map((b) => (
          <div key={b.name} className="sg-band">
            <span>{b.name}</span>
            <span className="meta-mono">{b.from === b.to ? `${b.from}s` : `${b.from}–${b.to}s`}</span>
          </div>
        ))}
      </div>

      <h3 className="sg-sub">Every duration in the stylesheet</h3>
      <div className="sg-bars">
        {timed.map((d) => (
          <div key={d.seconds} className={`sg-bar ${bandFor(d.seconds) ? '' : 'off'}`} title={d.where.join('\n')}>
            <span className="sg-bar-fill" style={{ width: `${(d.seconds / longest) * 100}%` }} />
            <span className="meta-mono">
              {d.seconds}s · {bandFor(d.seconds)?.name ?? 'off the scale'} · {d.where.length}×
            </span>
          </div>
        ))}
      </div>

      <h3 className="sg-sub">Live</h3>
      <div className="sg-demos" key={run}>
        <div className="sg-demo">
          <span className="sg-name">Entrance (reveal)</span>
          <RevealDemo />

        </div>
        <div className="sg-demo">
          <span className="sg-name">Word by word</span>
          <QuoteText text={SAMPLE_EN} reveal />
        </div>
        <div className="sg-demo">
          <span className="sg-name">Rise in</span>
          <div className="rise-in sg-card">Rises after a short pause</div>
        </div>
        <div className="sg-demo">
          <span className="sg-name">Icon assembles</span>
          <div className="sg-row">
            {(['camera', 'check', 'book'] as const).filter((n) => iconNames.includes(n)).map((n) => (
              <Icon key={n} name={n} size={34} animate />
            ))}
          </div>
        </div>
      </div>
      <button type="button" className="ink-button" onClick={() => setRun((r) => r + 1)}>
        Replay
      </button>

      <div className="sg-demo">
        <span className="sg-name">Press feedback</span>
        <p className="footnote">Press and hold any button above: it scales to 0.97 on the spring.</p>
      </div>
      <div className="sg-demo">
        <span className="sg-name">Haptics, at snapping and completion only</span>
        <div className="sg-row">
          {(['tick', 'tap', 'success'] as const).map((k) => (
            <button key={k} type="button" className="chip" onClick={() => haptic(k)}>
              {k}
            </button>
          ))}
        </div>
        <p className="footnote">Felt only on phones that support it.</p>
      </div>
      <div className="sg-demo">
        <span className="sg-name">The big scenes live in their own places</span>
        <Group>
          <Row label="The sea, in the lab" chevron href="#/lab" />
          <Row label="The ocean dive" chevron href="#/ocean" />
          <Row label="Scanning gold and the highlighter: capture a page" />
          <Row label="Recordings of each" value="docs/animations" />
        </Group>
      </div>
    </Section>
  )
}

/** The list-card entrance: it has to start hidden and be let in a frame later, or there's nothing to see. */
function RevealDemo() {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 60)
    return () => clearTimeout(t)
  }, [])
  return <div className={`reveal sg-card ${shown ? 'in' : ''}`}>A card slides up into place</div>
}

/** The easing drawn on a unit square: time across, progress up. */
function Curve({ pts: [x1, y1, x2, y2] }: { pts: [number, number, number, number] }) {
  const S = 100
  const p = (x: number, y: number) => `${x * S} ${S - y * S}`
  return (
    <svg className="sg-curve" viewBox={`-6 -6 ${S + 12} ${S + 12}`} role="img" aria-label="The spring easing curve">
      <rect x={0} y={0} width={S} height={S} fill="none" stroke="var(--line)" />
      <line x1={0} y1={S} x2={x1 * S} y2={S - y1 * S} stroke="var(--tertiary)" strokeWidth={0.6} />
      <line x1={S} y1={0} x2={x2 * S} y2={S - y2 * S} stroke="var(--tertiary)" strokeWidth={0.6} />
      <path d={`M ${p(0, 0)} C ${p(x1, y1)}, ${p(x2, y2)}, ${p(1, 1)}`} fill="none" stroke="var(--gold)" strokeWidth={2.2} strokeLinecap="round" />
    </svg>
  )
}

/* ───────────── Drift ───────────── */

interface Finding {
  what: string
  where: string[]
  fix: string
}

/** Where styles.css departs from the rules in CLAUDE.md. Recomputed from the stylesheet, so fixing one makes it go away. */
export function driftIn(facts: StyleFacts): Finding[] {
  const tokenValues = new Set(facts.tokens.map((t) => t.value.toLowerCase().replace(/\s+/g, '').replace(/,/g, ', ')))
  const out: Finding[] = []
  for (const d of facts.durations)
    if (!d.loop && !bandFor(d.seconds)) out.push({ what: `Duration ${d.seconds}s is off the scale`, where: d.where, fix: 'Use the nearest step of the scale, or add a step on purpose' })
  for (const e of facts.easings)
    if (!houseEasing(e.value)) out.push({ what: `Second easing: ${e.value}`, where: e.where, fix: 'Use var(--spring) for movement, ease for fades' })
  for (const a of facts.animated)
    if (!cheapToAnimate(a.property)) out.push({ what: `Animates ${a.property}`, where: a.where, fix: 'Animate transform or opacity instead' })
  const loose = facts.colors.filter((c) => !tokenValues.has(c.value))
  if (loose.length)
    out.push({
      what: `${loose.length} colours written by hand, not from a token`,
      where: loose.slice(0, 12).map((c) => `${c.value} ×${c.uses}`),
      fix: 'Most are intended tints on dark screens; promote any repeated one to a token',
    })
  return out
}

function Drift({ facts }: { facts: StyleFacts }) {
  const found = driftIn(facts)
  return (
    <Section title={`Drift · ${found.length}`}>
      <p className="footnote">
        Where styles.css departs from the design rules, checked live. It reads the stylesheet only: styles set inside components (canvas scenes, inline styles) are not covered.
      </p>
      {found.length === 0 ? (
        <p className="footnote">Nothing. The stylesheet keeps every rule.</p>
      ) : (
        <ul className="sg-drift">
          {found.map((f, i) => (
            <li key={i}>
              <strong>{f.what}</strong>
              <span className="meta-mono">{f.where.slice(0, 6).join(' · ')}{f.where.length > 6 ? ` · +${f.where.length - 6}` : ''}</span>
              <span className="sg-use">{f.fix}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
