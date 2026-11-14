import { useEffect, useRef, useState, type FormEvent } from 'react'

type Status = 'Ready' | 'Vulnerable' | 'Error'
type ScanResult = {
  domain: string
  status: Status
  score: number
  tls_version: string
  negotiated_group: string | null
  supported_groups: string[]
  details: string
  timestamp: string
}
type View = 'home' | 'analysis' | 'batch'

const API = import.meta.env.VITE_API_URL ?? '/api'
const EXAMPLES = ['www.cloudflare.com', 'www.example.org', 'github.com']
const PHRASES = ['Is your website quantum-ready?', 'Will your data stay private tomorrow?', 'Find out in seconds.']
// The API streams no progress, so these are shown greyed out rather than faked.
const STEPS = ['Resolving address', 'Checking for private or local IPs', 'Connecting to port 443', 'Negotiating TLS key exchange']
const MAX_BATCH = 10
const NA = 'Not provided by the API'

// Same rule as backend/service/scanner.py verify_ssrf.
const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

const clean = (v: string) => v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '')
const parseList = (text: string) => [...new Set(text.split(/[\n,\s]+/).map(clean).filter(Boolean))]
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function advice(r: ScanResult) {
  if (r.status === 'Ready')
    return {
      headline: 'Protected. Traffic to this site uses hybrid post-quantum key exchange.',
      meaning: 'Even if someone records this traffic today, a future quantum computer cannot recover the session keys.',
      next: 'Nothing to do. Re-scan after you change hosting, CDN or server software.',
    }
  if (r.status === 'Vulnerable' && r.tls_version === 'TLSv1.2')
    return {
      headline: 'Older TLS version. Not quantum-ready.',
      meaning: 'TLS 1.2 cannot use hybrid post-quantum key exchange. Recorded traffic could be decrypted in the future.',
      next: 'Ask your provider to enable TLS 1.3. That is the first step toward post-quantum protection.',
    }
  if (r.status === 'Vulnerable')
    return {
      headline: 'Modern encryption, but not yet quantum-ready.',
      meaning: 'The connection is secure today. Recorded traffic could be decrypted in the future once quantum computers mature.',
      next: 'Ask your hosting or CDN provider whether they support X25519MLKEM768, or upgrade to OpenSSL 3.5+ if you run your own server.',
    }
  return {
    headline: 'We could not scan this site.',
    meaning: 'The scan did not complete. The technical message above says why.',
    next: 'Check the address and that the site loads in a browser, then scan again.',
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init)
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return res.json()
}

function Badge({ status, small }: { status: Status; small?: boolean }) {
  return <span className={`badge ${status}${small ? ' small' : ''}`}>{!small && <i />}{status}</span>
}

function FadeHeadline() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % PHRASES.length), 3200)
    return () => clearInterval(t)
  }, [])
  return (
    <span className="fade">
      {PHRASES.map((p, k) => (
        <span key={k} aria-hidden={k !== i} className={k === i ? 'on' : ''}>{p}</span>
      ))}
    </span>
  )
}

export default function App() {
  const [view, setView] = useState<View>('home')
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanDomain, setScanDomain] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [history, setHistory] = useState<ScanResult[]>([])
  const [copied, setCopied] = useState(false)
  const [batchText, setBatchText] = useState('')
  const [batchResults, setBatchResults] = useState<ScanResult[]>([])
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchError, setBatchError] = useState('')
  const seq = useRef(0) // drops responses from superseded scans

  const remember = (rs: ScanResult[]) =>
    setHistory((h) => [...rs, ...h.filter((x) => !rs.some((r) => r.domain === x.domain))].slice(0, 8))

  async function scan(raw: string) {
    const d = clean(raw)
    if (!d) return setInputError('Enter a website address.')
    if (!DOMAIN_RE.test(d)) return setInputError('That does not look like a public domain. Try something like www.example.org.')
    const id = ++seq.current
    setView('analysis')
    setInput(d)
    setInputError('')
    setScanning(true)
    setScanDomain(d)
    setResult(null)
    setCopied(false)
    try {
      const r = await api<ScanResult>(`/scan?domain=${encodeURIComponent(d)}`)
      if (id !== seq.current) return
      setResult(r)
      remember([r])
    } catch (err) {
      if (id === seq.current) setInputError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      if (id === seq.current) setScanning(false)
    }
  }

  async function runBatch() {
    const list = parseList(batchText)
    if (!list.length || list.length > MAX_BATCH) return
    setBatchRunning(true)
    setBatchError('')
    setBatchResults([])
    try {
      const { results } = await api<{ results: ScanResult[] }>('/scan/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: list }),
      })
      setBatchResults(results)
      remember(results)
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBatchRunning(false)
    }
  }

  function open(r: ScanResult) {
    seq.current++
    setView('analysis')
    setScanning(false)
    setResult(r)
    setInput(r.domain)
    setInputError('')
    setCopied(false)
  }

  function goHome() {
    seq.current++
    setScanning(false)
    setView('home')
    setInputError('')
  }

  function copy(r: ScanResult) {
    const text = `${r.domain}: ${r.status} (${r.score}/100) · ${r.tls_version} · ${r.negotiated_group ?? 'no group'}\n${r.details}`
    navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {})
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void scan(input)
  }

  const batchList = parseList(batchText)
  const batchOver = batchList.length > MAX_BATCH
  const batchOff = batchRunning || !batchList.length || batchOver

  const searchForm = (compact: boolean) => (
    <form onSubmit={onSubmit} className={`search ${compact ? 'compact' : ''} ${inputError ? 'bad' : ''}`}>
      <span className="scheme">https://</span>
      <input
        value={input}
        onChange={(e) => { setInput(e.target.value); setInputError('') }}
        placeholder={compact ? undefined : 'www.yourorganization.org'}
        aria-label="Website address"
        spellCheck={false}
        autoComplete="off"
        autoFocus={!compact}
      />
      {compact ? (
        <button type="submit" className="pill primary" disabled={scanning}>{scanning ? 'Scanning…' : 'Scan'}</button>
      ) : (
        <button type="submit" className="go" aria-label="Scan">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
    </form>
  )

  const errorLine = <p className="field-error" role="alert" hidden={!inputError}>{inputError}</p>

  return (
    <>
      <div className="bg" aria-hidden="true">
        <div className="grid" />
        <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
        <div className="fadeout" />
      </div>

      <div className="shell">
        <header>
          <button className="brand" onClick={goHome}>QR</button>
          <nav>
            <button className={view !== 'batch' ? 'on' : ''} onClick={goHome}>Single site</button>
            <button className={view === 'batch' ? 'on' : ''} onClick={() => setView('batch')}>Batch</button>
          </nav>
        </header>

        {view === 'home' && (
          <main className="home rise">
            <h1><FadeHeadline /></h1>
            {searchForm(false)}
            {errorLine}
            <div className="chips">
              {EXAMPLES.map((ex) => <button key={ex} className="chip mono" onClick={() => void scan(ex)}>{ex}</button>)}
              <button className="chip strong" onClick={() => setView('batch')}>Scan up to {MAX_BATCH} sites →</button>
            </div>
            {history.length > 0 && <History history={history} onOpen={open} />}
          </main>
        )}

        {view === 'analysis' && (
          <main className="analysis rise">
            <div className="col">
              {searchForm(true)}
              {errorLine}

              {scanning && (
                <section className="card" aria-live="polite">
                  <div className="stack">
                    <span className="eyebrow accent">Analyzing</span>
                    <span className="big">{scanDomain}</span>
                  </div>
                  <ol className="steps na" title={NA}>
                    {STEPS.map((s) => <li key={s}><i />{s}</li>)}
                  </ol>
                  <p className="note">Step-by-step progress is not reported by the API, so it is greyed out.</p>
                </section>
              )}

              {!scanning && result && <ResultCard r={result} copied={copied} onCopy={() => copy(result)} onRescan={() => void scan(result.domain)} onNew={goHome} />}
            </div>

            <aside>
              <History history={history} onOpen={open} />
              <Why />
              <div className="mock na" title={NA}>
                <span className="mono tag">MOCK_MODE</span>
                <span>Whether results are live or demo is not reported by the API</span>
              </div>
            </aside>
          </main>
        )}

        {view === 'batch' && (
          <main className="batch rise">
            <div className="intro">
              <h1 className="h2">Scan several sites</h1>
              <p>One address per line, up to {MAX_BATCH}. Check your main site, donation page and member portal together.</p>
            </div>
            <div className="batch-box">
              <textarea
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
                rows={6}
                spellCheck={false}
                aria-label="Website addresses"
                placeholder={'www.example.org\ndonate.example.org\nportal.example.org'}
              />
              <div className="batch-foot">
                <span className={batchOver ? 'over' : ''}>
                  {batchOver ? `${batchList.length} / ${MAX_BATCH} - remove ${batchList.length - MAX_BATCH}` : `${batchList.length} / ${MAX_BATCH} domains`}
                </span>
                <button className="pill primary" disabled={batchOff} onClick={() => void runBatch()}>{batchRunning ? 'Scanning…' : 'Scan all'}</button>
              </div>
            </div>
            {batchError && <p className="field-error" role="alert">{batchError}</p>}
            {batchResults.length > 0 && <BatchTable rows={batchResults} onOpen={open} />}
          </main>
        )}
      </div>
    </>
  )
}

function ResultCard({ r, copied, onCopy, onRescan, onNew }: { r: ScanResult; copied: boolean; onCopy: () => void; onRescan: () => void; onNew: () => void }) {
  const a = advice(r)
  const failed = r.status === 'Error'
  return (
    <article className="card result rise" aria-live="polite">
      <div className="pad">
        <div className="head">
          <div className="stack">
            <span className="big">{r.domain}</span>
            <span className="sub">Scanned {time(r.timestamp)}</span>
          </div>
          <Badge status={r.status} />
        </div>

        <div className="scorerow">
          <div className={`score ${failed ? 'na' : ''}`} title={failed ? NA : undefined}>
            <b>{failed ? 'n/a' : r.score}</b><span>/100</span>
          </div>
          <p className="headline">{a.headline}</p>
        </div>
        <div className={`bar ${failed ? 'na' : ''}`}><div style={{ width: failed ? 0 : `${r.score}%` }} /></div>

        <dl>
          <Fact label="TLS version" value={failed ? null : r.tls_version} />
          <Fact label="Negotiated group" value={r.negotiated_group} />
          <div className="wide">
            <dt>Supported groups</dt>
            <dd className="groups">
              {r.supported_groups.length
                ? r.supported_groups.map((g) => <span key={g} className={`group ${g.includes('MLKEM') ? 'pq' : ''}`}>{g}</span>)
                : <span className="mono na" title={NA}>n/a</span>}
            </dd>
          </div>
        </dl>

        {r.details && <p className="details mono">{r.details}</p>}
      </div>

      <div className="two">
        <div><span className="eyebrow">What this means</span><p>{a.meaning}</p></div>
        <div><span className="eyebrow">Next step</span><p>{a.next}</p></div>
      </div>

      <div className="actions">
        <button className="pill primary" onClick={onRescan}>Scan again</button>
        <button className="pill outline" onClick={onCopy}>{copied ? 'Copied' : 'Copy summary'}</button>
        <button className="pill ghost" onClick={onNew}>New site</button>
      </div>
    </article>
  )
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={`mono ${value ? '' : 'na'}`} title={value ? undefined : NA}>{value ?? 'n/a'}</dd>
    </div>
  )
}

const CLUSTERS: Status[] = ['Ready', 'Vulnerable', 'Error']
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

// One dot per scanned site, grouped by status. Dots sit on a sunflower spiral so a cluster fills evenly.
function History({ history, onOpen }: { history: ScanResult[]; onOpen: (r: ScanResult) => void }) {
  const [hover, setHover] = useState<ScanResult | null>(null)
  const groups = CLUSTERS.map((status) => ({ status, items: history.filter((h) => h.status === status) }))
    .filter((g) => g.status !== 'Error' || g.items.length)
  return (
    <section className="card aside-card soft recent">
      <span className="eyebrow">Recent scans · this session</span>
      <div className="clusters">
        {groups.map(({ status, items }) => (
          <figure key={status} className="cluster">
            <svg viewBox="-90 -90 180 180" role="group" aria-label={`${status}: ${items.length} sites`}>
              <circle className={`halo ${status}`} r="84" />
              {items.map((h, i) => {
                const rad = 26 * Math.sqrt(i), a = i * GOLDEN
                return (
                  <circle
                    key={h.domain}
                    className={`dot ${status}`}
                    cx={rad * Math.cos(a)}
                    cy={rad * Math.sin(a)}
                    r="9"
                    tabIndex={0}
                    role="button"
                    aria-label={`${h.domain}, ${h.status}, ${h.score} out of 100`}
                    onClick={() => onOpen(h)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(h))}
                    onMouseEnter={() => setHover(h)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(h)}
                    onBlur={() => setHover(null)}
                  />
                )
              })}
            </svg>
            <figcaption><b>{status}</b> <span>{items.length}</span></figcaption>
          </figure>
        ))}
      </div>
      <p className="hint mono">{hover ? `${hover.domain} · ${hover.score}/100` : 'Select a dot to reopen its result'}</p>
    </section>
  )
}

function Why() {
  return (
    <section className="card aside-card soft why">
      <span className="eyebrow">Why this matters</span>
      <p>Encrypted traffic can be recorded today and decrypted later, once quantum computers are strong enough. Hybrid key exchange (X25519 + ML-KEM) keeps that traffic safe even if the classical part is broken.</p>
      <div className="cols">
        <div><b>We check</b><span>Key exchange on port 443<br />TLS version</span></div>
        <div><b>We don’t check</b><span>Certificates, signatures, other ports, internal services</span></div>
      </div>
      <p className="foot">“Vulnerable” does not mean your site can be broken today. It means recorded traffic could be exposed in the future.</p>
    </section>
  )
}

function BatchTable({ rows, onOpen }: { rows: ScanResult[]; onOpen: (r: ScanResult) => void }) {
  const counts = (['Ready', 'Vulnerable', 'Error'] as const).map((s) => ({ s, n: rows.filter((r) => r.status === s).length }))
  return (
    <section className="card table rise">
      <div className="summary">
        {counts.map(({ s, n }) => <div key={s}><span className="num">{n}</span><Badge status={s} small /></div>)}
      </div>
      <div className="scroll">
        <div className="tbl">
          <div className="tr th"><span>Domain</span><span>Status</span><span>Score</span><span>TLS</span><span>Group</span></div>
          {rows.map((r) => (
            <button key={r.domain} className="tr" onClick={() => onOpen(r)}>
              <span className="dom">{r.domain}</span>
              <span><Badge status={r.status} small /></span>
              <span className={`mono ${r.status === 'Error' ? 'na' : ''}`}>{r.status === 'Error' ? 'n/a' : r.score}</span>
              <span className={`mono muted ${r.status === 'Error' ? 'na' : ''}`}>{r.status === 'Error' ? 'n/a' : r.tls_version}</span>
              <span className={`mono muted ellipsis ${r.negotiated_group ? '' : 'na'}`}>{r.negotiated_group ?? 'n/a'}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="foot-note">Select a row for the full analysis.</p>
    </section>
  )
}
