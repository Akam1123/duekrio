import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Copy,
  FileSpreadsheet,
  FileUp,
  Filter,
  HelpCircle,
  Inbox,
  LockKeyhole,
  Mail,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react'
import {
  deriveInvoice,
  exportInvoicesCsv,
  exportLedgerJson,
  importLedgerJson,
  parseInvoiceCsv,
  prioritizeInvoices,
} from './lib/ledger'
import type { Invoice, InvoiceAnnotation } from './lib/types'

type View = 'home' | 'app'
type QueueFilter = 'all' | 'overdue' | 'action' | 'promise' | 'review' | 'paid'
type Toast = { text: string; kind?: 'good' | 'warn' }
type ImportReview = { missingKeys: string[]; paidSeenKeys: string[] }
const emptyReview = (): ImportReview => ({ missingKeys: [], paidSeenKeys: [] })

const STORAGE_KEY = 'promiseledger.workspace.v1'
const sampleCsvUrl = (window as Window & { __PROMISELEDGER_SAMPLE_CSV_URL__?: string }).__PROMISELEDGER_SAMPLE_CSV_URL__
  ?? `${import.meta.env.BASE_URL}sample-ar-aging.csv`
const today = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const dollars = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const dateLabel = (date?: string) => {
  if (!date) return '—'
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed)
}

const blockerLabels: Record<InvoiceAnnotation['blocker'], string> = {
  none: 'No blocker logged',
  awaiting_approval: 'Awaiting approval',
  missing_documentation: 'Missing document',
  dispute: 'Invoice dispute',
  cash_flow: 'Cash flow delay',
  unreachable: 'No response',
  other: 'Other blocker',
}

const statusLabels: Record<InvoiceAnnotation['status'], string> = {
  open: 'Open',
  in_progress: 'Working',
  resolved: 'Blocker cleared',
  paid: 'Paid',
}

const offsetDate = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const demoCsv = () => `Customer,Invoice Number,Invoice Date,Due Date,Amount,Email
Northstar Studio,INV-1042,${offsetDate(-49)},${offsetDate(-19)},4800,ap@northstar.example
Fieldstone Partners,INV-1068,${offsetDate(-41)},${offsetDate(-11)},7200,finance@fieldstone.example
Harbor Works,INV-1071,${offsetDate(-37)},${offsetDate(-7)},2350,accounts@harbor.example
Summit Creative,INV-1084,${offsetDate(-31)},${offsetDate(-1)},6450,ap@summit.example
Lumen Labs,INV-1089,${offsetDate(-22)},${offsetDate(8)},3900,billing@lumen.example`

function makeDemo(): Invoice[] {
  const parsed = parseInvoiceCsv(demoCsv())
  const annotations: Partial<InvoiceAnnotation>[] = [
    { status: 'in_progress', blocker: 'missing_documentation', owner: 'You', nextAction: 'Request the signed PO', nextActionDate: offsetDate(-2), notes: 'Customer needs to match this to their purchase order.' },
    { status: 'in_progress', blocker: 'dispute', owner: 'You', nextAction: 'Confirm the approved scope with project lead', nextActionDate: offsetDate(1), notes: 'Client queried the final milestone.' },
    { status: 'open', blocker: 'awaiting_approval', nextAction: 'Find the AP approver', nextActionDate: offsetDate(2) },
    { status: 'in_progress', blocker: 'cash_flow', owner: 'You', promiseDate: offsetDate(5), nextAction: 'Confirm payment timing', nextActionDate: offsetDate(3) },
    { status: 'open', blocker: 'none' },
  ]
  return parsed.invoices.map((invoice, index) => ({
    ...invoice,
    annotation: { ...invoice.annotation, ...annotations[index] },
  }))
}

function saveDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function emailDraft(invoice: Invoice) {
  const { customer, invoiceNumber, amount, annotation } = invoice
  const opening = `Hello,\n\nI'm following up on invoice ${invoiceNumber} for ${dollars(amount)}${invoice.dueDate ? `, due ${dateLabel(invoice.dueDate)}` : ''}.`
  const middle: Record<InvoiceAnnotation['blocker'], string> = {
    none: 'Could you let me know its payment status and whether you need anything from us to process it?',
    awaiting_approval: 'Could you confirm who is handling approval and whether there is anything we can provide to help move it forward?',
    missing_documentation: 'It looks like a document or reference may be needed before payment can move forward. Could you tell me exactly what is missing?',
    dispute: 'I understand there may be a question about this invoice. Could you share the specific item or amount in question so we can resolve it together?',
    cash_flow: annotation.promiseDate
      ? `Thank you for the payment update. We have noted ${dateLabel(annotation.promiseDate)} as the expected payment date. Could you confirm if that timing still holds?`
      : 'Could you share a realistic payment date so we can plan accordingly?',
    unreachable: 'I want to make sure this invoice reached the right person. Could you confirm who on your team handles payment questions?',
    other: 'Could you let me know what is holding up payment and the best next step?',
  }
  return {
    subject: `${invoiceNumber} — payment status`,
    body: `${opening}\n\n${middle[annotation.status === 'resolved' ? 'none' : annotation.blocker]}\n\nThank you,\n[Your name]`,
    recipient: invoice.email || '',
    customer,
  }
}

function useDialogFocus<T extends HTMLElement>(onEscape: () => void) {
  const panelRef = useRef<T>(null)
  const escapeRef = useRef(onEscape)
  escapeRef.current = onEscape
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') || [])
      .filter(element => element.getClientRects().length > 0)
    const first = focusable()[0]
    first?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); escapeRef.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      const start = items[0]
      const end = items[items.length - 1]
      if (!start || !end) return
      if (event.shiftKey && document.activeElement === start) { event.preventDefault(); end.focus() }
      else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); start.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus() }
  }, [])
  return panelRef
}

function useRoute(): [View, (view: View) => void] {
  const route = (): View => window.location.hash === '#/app' ? 'app' : 'home'
  const [view, setView] = useState<View>(route)
  useEffect(() => {
    const onHash = () => setView(route())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const navigate = (next: View) => {
    window.location.hash = next === 'app' ? '/app' : '/'
    setView(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return [view, navigate]
}

function Brand({ onClick }: { onClick: () => void }) {
  return <button className="brand" onClick={onClick} aria-label="PromiseLedger home">
    <span className="brand-mark"><span /></span>
    <span>promise<span className="brand-soft">ledger</span></span>
  </button>
}

function Landing({ openApp }: { openApp: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return <div className="site-shell">
    <header className="site-nav wrap">
      <Brand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
      <nav className={menuOpen ? 'site-links open' : 'site-links'} aria-label="Main navigation">
        <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
        <a href="#who-it-is-for" onClick={() => setMenuOpen(false)}>Who it is for</a>
        <a href="https://github.com/Akam1123/promiseledger" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={14} /></a>
        <button className="nav-cta" onClick={openApp}>Open workspace <ArrowRight size={16} /></button>
      </nav>
      <button className="mobile-menu" aria-label="Toggle menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
    </header>

    <main>
      <section className="hero wrap">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> A clearer way to work your receivables</div>
          <h1>Every unpaid invoice has a reason. <em>Give it a next move.</em></h1>
          <p className="hero-intro">An aging report tells you what is overdue. PromiseLedger helps your team track <strong>why</strong>, <strong>who owns it</strong>, and <strong>what happens next</strong>—without replacing your accounting software.</p>
          <div className="hero-actions">
            <button className="button button-primary button-large" onClick={openApp}>Open free workspace <ArrowRight size={19} /></button>
            <a className="text-link" href="#how-it-works">See how it works <ArrowDownToLine size={17} /></a>
          </div>
          <div className="hero-trust"><ShieldCheck size={17} /><span>No account · No bank connection · Data stays in this browser</span></div>
        </div>
        <div className="hero-visual" aria-label="Illustration of the PromiseLedger action board">
          <div className="visual-glow" />
          <div className="mock-window">
            <div className="mock-top"><span className="mock-icon">p</span><span>Action queue</span><span className="mock-pill">Illustrative data</span></div>
            <div className="mock-metrics"><div><small>Open balance</small><strong>$24,700</strong></div><div><small>Needs a next move</small><strong>03 <span>invoices</span></strong></div></div>
            <div className="mock-row"><div className="mock-avatar coral">N</div><div className="mock-name"><strong>Northstar Studio</strong><small>INV-1042 · 19 days overdue</small></div><span className="mock-tag red">Missing PO</span><strong>$4,800</strong></div>
            <div className="mock-row"><div className="mock-avatar sage">F</div><div className="mock-name"><strong>Fieldstone Partners</strong><small>INV-1068 · 11 days overdue</small></div><span className="mock-tag amber">Dispute</span><strong>$7,200</strong></div>
            <div className="mock-row"><div className="mock-avatar blue">H</div><div className="mock-name"><strong>Harbor Works</strong><small>INV-1071 · 7 days overdue</small></div><span className="mock-tag blue">Approval</span><strong>$2,350</strong></div>
            <div className="mock-next"><span><span className="mock-next-dot" /> NEXT ACTION</span><strong>Request the signed PO from Northstar Studio</strong><small>Owner: You · Due today</small></div>
          </div>
          <div className="floating-note"><span className="floating-icon"><Check size={17} /></span><div><strong>One clear owner</strong><small>for every open issue</small></div></div>
        </div>
      </section>

      <section className="proof-strip">
        <div className="wrap proof-inner"><span className="proof-label">Built around the work after the reminder</span><span><CircleAlert size={18} /> Missing PO</span><span><HelpCircle size={18} /> Disputed amount</span><span><Clock3 size={18} /> Payment promise</span><span><Mail size={18} /> No response</span></div>
      </section>

      <section id="how-it-works" className="section wrap">
        <div className="section-heading"><div><span className="kicker">THE WORKFLOW</span><h2>From overdue list to resolution plan.</h2></div><p>Keep invoicing in the system you already use. Bring the open items here for a focused weekly review.</p></div>
        <div className="steps-grid">
          <article className="step-card"><span className="step-no">01</span><div className="step-icon mint"><FileSpreadsheet size={25} /></div><h3>Import your aging CSV</h3><p>Start with a simple export or add an invoice by hand. A repeat import updates balances while keeping your notes and decisions.</p></article>
          <article className="step-card"><span className="step-no">02</span><div className="step-icon peach"><Filter size={25} /></div><h3>Name the blocker</h3><p>Record the reason payment is stuck, the person responsible, the next action, and any payment commitment.</p></article>
          <article className="step-card"><span className="step-no">03</span><div className="step-icon lilac"><TrendingUp size={25} /></div><h3>Run the weekly queue</h3><p>See overdue actions and missed promises first. Draft a personal follow-up, then export your work for the team.</p></article>
        </div>
      </section>

      <section id="who-it-is-for" className="fit-section">
        <div className="wrap fit-grid"><div><span className="kicker">A SMALL, USEFUL FIRST STEP</span><h2>For teams too busy to babysit an aging report.</h2><p>Made for small B2B service firms that send invoices from QuickBooks, Xero, or another ledger and need a clearer human follow-up process.</p><div className="fit-list"><span><CheckCircle2 size={19} /> Agencies and consultancies</span><span><CheckCircle2 size={19} /> Field service and project firms</span><span><CheckCircle2 size={19} /> Owner-led finance teams</span></div></div><div className="fit-card"><span className="fit-card-top"><LockKeyhole size={20} /> EARLY ACCESS WORKSPACE</span><h3>Free to use while we learn.</h3><p>This first release runs in your browser. It does not send emails, connect to a ledger, process payments, or offer multi-user sync.</p><button className="button button-primary" onClick={openApp}>Try the workspace <ArrowRight size={18} /></button><small>Keep a JSON backup before clearing browser data.</small></div></div>
      </section>
    </main>

    <footer className="site-footer wrap"><Brand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} /><span>Make the next move clear.</span><a href="https://github.com/Akam1123/promiseledger" target="_blank" rel="noreferrer">Source & feedback <ArrowUpRight size={14} /></a></footer>
  </div>
}

function loadSaved(): { invoices: Invoice[]; demo: boolean; review: ImportReview; warning?: string; corruptRaw?: string } {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { invoices: [], demo: false, review: emptyReview() }
    const parsed = JSON.parse(raw) as { invoices?: unknown; demo?: unknown; review?: Partial<ImportReview> }
    const invoices = importLedgerJson(JSON.stringify({ format: 'promiseledger', version: 1, invoices: parsed.invoices }))
    const review = parsed.review && Array.isArray(parsed.review.missingKeys) && Array.isArray(parsed.review.paidSeenKeys)
      ? { missingKeys: parsed.review.missingKeys.filter((key): key is string => typeof key === 'string'), paidSeenKeys: parsed.review.paidSeenKeys.filter((key): key is string => typeof key === 'string') }
      : emptyReview()
    return { invoices, demo: parsed.demo === true, review }
  } catch {
    return { invoices: [], demo: false, review: emptyReview(), warning: 'Saved browser data could not be loaded. Download the raw copy before importing new data or restore a JSON backup.', corruptRaw: raw || undefined }
  }
}

function App() {
  const [view, navigate] = useRoute()
  const [saved] = useState(loadSaved)
  const [invoices, setInvoices] = useState<Invoice[]>(saved.invoices)
  const [demo, setDemo] = useState(saved.demo)
  const [importReview, setImportReview] = useState<ImportReview>(saved.review)
  const [loadBlocked, setLoadBlocked] = useState(Boolean(saved.warning))
  const [storageWarning, setStorageWarning] = useState(saved.warning || '')
  const [toast, setToast] = useState<Toast | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<QueueFilter>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const csvInput = useRef<HTMLInputElement>(null)
  const restoreInput = useRef<HTMLInputElement>(null)
  const asOf = today()

  useEffect(() => {
    if (loadBlocked) return
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ invoices, demo, review: importReview })) }
    catch { setStorageWarning('Browser storage is unavailable or full. Export a JSON backup before leaving this page.') }
  }, [invoices, demo, importReview, loadBlocked])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 5500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const active = useMemo(() => invoices.filter(item => item.annotation.status !== 'paid'), [invoices])
  const derived = useMemo(() => prioritizeInvoices(invoices, asOf), [invoices, asOf])
  const missingReviewKeys = importReview.missingKeys.filter(key => invoices.some(item => item.key === key && item.annotation.status !== 'paid'))
  const paidSeenReviewKeys = importReview.paidSeenKeys.filter(key => invoices.some(item => item.key === key && item.annotation.status === 'paid'))
  const reviewKeys = new Set([...missingReviewKeys, ...paidSeenReviewKeys])
  const reviewMessage = [
    missingReviewKeys.length ? `${missingReviewKeys.length} prior open ${missingReviewKeys.length === 1 ? 'invoice was' : 'invoices were'} absent from the latest CSV.` : '',
    paidSeenReviewKeys.length ? `${paidSeenReviewKeys.length} locally paid ${paidSeenReviewKeys.length === 1 ? 'invoice still appears' : 'invoices still appear'} in it.` : '',
  ].filter(Boolean).join(' ')
  const rows = useMemo(() => derived.filter(item => {
    const invoice = item
    const query = search.toLowerCase().trim()
    if (query && !`${invoice.customer} ${invoice.invoiceNumber} ${blockerLabels[invoice.annotation.blocker]}`.toLowerCase().includes(query)) return false
    if (filter === 'paid') return invoice.annotation.status === 'paid'
    if (filter === 'review') return reviewKeys.has(invoice.key)
    if (invoice.annotation.status === 'paid') return false
    if (filter === 'overdue') return item.isOverdue
    if (filter === 'action') return Boolean(invoice.annotation.nextActionDate && invoice.annotation.nextActionDate <= asOf) || item.isPromiseBroken
    if (filter === 'promise') return Boolean(invoice.annotation.promiseDate)
    return true
  }), [derived, search, filter, asOf, reviewKeys])
  const selected = invoices.find(item => item.key === selectedKey) || null
  const openBalance = active.reduce((sum, item) => sum + item.amount, 0)
  const overdueBalance = active.filter(item => deriveInvoice(item, asOf).isOverdue).reduce((sum, item) => sum + item.amount, 0)
  const actionCount = active.filter(item => (item.annotation.nextActionDate && item.annotation.nextActionDate <= asOf) || deriveInvoice(item, asOf).isPromiseBroken).length
  const brokenPromises = active.filter(item => deriveInvoice(item, asOf).isPromiseBroken).length
  const promisedThisWeek = active.filter(item => {
    const promise = item.annotation.promiseDate
    if (!promise) return false
    const diff = (new Date(`${promise}T12:00:00`).getTime() - new Date(`${asOf}T12:00:00`).getTime()) / 86400000
    return diff >= 0 && diff <= 7
  }).reduce((sum, item) => sum + item.amount, 0)

  async function importCsv(file?: File) {
    if (!file) return
    try {
      const text = await file.text()
      const current = demo ? [] : invoices
      const result = parseInvoiceCsv(text, current)
      if (result.added + result.updated === 0) {
        setToast({ text: result.issues[0]?.message || 'No invoices imported. Check the CSV headers and rows.', kind: 'warn' })
        return
      }
      const snapshot = parseInvoiceCsv(text)
      const present = new Set(snapshot.invoices.map(item => item.key))
      const review: ImportReview = {
        missingKeys: current.filter(item => item.annotation.status !== 'paid' && !present.has(item.key)).map(item => item.key),
        paidSeenKeys: current.filter(item => item.annotation.status === 'paid' && present.has(item.key)).map(item => item.key),
      }
      setInvoices(result.invoices)
      setDemo(false)
      setImportReview(review)
      setLoadBlocked(false)
      setStorageWarning('')
      const reviewCount = review.missingKeys.length + review.paidSeenKeys.length
      setToast({ text: `Imported ${result.added} new and updated ${result.updated} invoices.${result.skipped ? ` ${result.skipped} rows skipped.` : ''}${reviewCount ? ` ${reviewCount} need reconciliation.` : ''}`, kind: result.skipped || reviewCount ? 'warn' : 'good' })
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : 'Unable to read that CSV file.', kind: 'warn' })
    } finally {
      if (csvInput.current) csvInput.current.value = ''
    }
  }

  async function restoreBackup(file?: File) {
    if (!file) return
    try {
      const restored = importLedgerJson(await file.text())
      if (invoices.length && !demo && !window.confirm(`Replace your current ${invoices.length} invoices with ${restored.length} from this backup? Export your current backup first if you may need it.`)) return
      setInvoices(restored)
      setDemo(false)
      setImportReview(emptyReview())
      setLoadBlocked(false)
      setStorageWarning('')
      setToast({ text: `Restored ${restored.length} invoices from backup.`, kind: 'good' })
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : 'That backup could not be read.', kind: 'warn' })
    } finally {
      if (restoreInput.current) restoreInput.current.value = ''
    }
  }

  function addInvoice(details: { customer: string; invoiceNumber: string; amount: string; dueDate: string; issueDate: string; email: string }) {
    const csv = 'Customer,Invoice Number,Invoice Date,Due Date,Amount,Email\n' +
      [details.customer, details.invoiceNumber, details.issueDate, details.dueDate, details.amount, details.email].map(csvCell).join(',')
    const result = parseInvoiceCsv(csv, demo ? [] : invoices)
    if (result.added + result.updated === 0) {
      setToast({ text: result.issues[0]?.message || 'Please check the invoice details.', kind: 'warn' })
      return false
    }
    setInvoices(result.invoices)
    setDemo(false)
    setLoadBlocked(false)
    setStorageWarning('')
    setToast({ text: result.added ? 'Invoice added.' : 'Existing invoice updated.', kind: 'good' })
    return true
  }

  function updateInvoice(updated: Invoice) {
    setInvoices(current => current.map(item => item.key === updated.key ? updated : item))
    setToast({ text: 'Invoice updated.', kind: 'good' })
  }

  function deleteInvoice(invoice: Invoice) {
    if (!window.confirm(`Delete ${invoice.invoiceNumber} for ${invoice.customer} from this browser? This cannot be undone unless you have a backup.`)) return false
    setInvoices(current => current.filter(item => item.key !== invoice.key))
    setImportReview(current => ({
      missingKeys: current.missingKeys.filter(key => key !== invoice.key),
      paidSeenKeys: current.paidSeenKeys.filter(key => key !== invoice.key),
    }))
    setSelectedKey(null)
    setToast({ text: 'Invoice deleted from this browser.', kind: 'good' })
    return true
  }

  const downloadBackup = () => saveDownload(exportLedgerJson(invoices), `promiseledger-backup-${asOf}.json`, 'application/json')
  const downloadCsv = () => saveDownload(exportInvoicesCsv(invoices), `promiseledger-invoices-${asOf}.csv`, 'text/csv;charset=utf-8')

  if (view === 'home') return <Landing openApp={() => navigate('app')} />

  return <div className="app-shell">
    <header className="app-header">
      <div className="app-header-inner wrap">
        <Brand onClick={() => navigate('home')} />
        <span className="header-divider" />
        <span className="workspace-label">Workspace <span className="workspace-dot" /> <b>Local</b></span>
        <div className="app-header-actions">
          <button className="header-link" onClick={() => setShowGuide(true)}><HelpCircle size={17} /> Help</button>
          <button className="header-link" onClick={downloadBackup} disabled={!invoices.length}><ArrowDownToLine size={17} /> Backup</button>
          <button className="button button-primary button-small" onClick={() => csvInput.current?.click()}><FileUp size={17} /> Import CSV</button>
          <button className="mobile-menu app-menu-toggle" aria-label="More actions" aria-expanded={showMobileMenu} onClick={() => setShowMobileMenu(!showMobileMenu)}><MoreHorizontal size={23} /></button>
        </div>
      </div>
      {showMobileMenu && <div className="app-mobile-actions"><button onClick={() => { setShowGuide(true); setShowMobileMenu(false) }}>Help</button><button onClick={() => { downloadBackup(); setShowMobileMenu(false) }}>Backup JSON</button><button onClick={() => { csvInput.current?.click(); setShowMobileMenu(false) }}>Import CSV</button></div>}
    </header>
    <main className="app-main wrap">
      <input ref={csvInput} type="file" accept=".csv,text/csv" className="sr-only" onChange={event => void importCsv(event.target.files?.[0])} aria-label="Import invoice CSV" />
      <input ref={restoreInput} type="file" accept=".json,application/json" className="sr-only" onChange={event => void restoreBackup(event.target.files?.[0])} aria-label="Restore JSON backup" />
      <div className="app-title-row">
        <div><span className="kicker">YOUR RECEIVABLES, WITH A PLAN</span><h1>Action board<span className="title-period">.</span></h1><p>Know what is stuck, who is moving it, and when to follow up.</p></div>
        <div className="title-actions"><button className="button button-secondary" onClick={() => setShowAdd(true)}><Plus size={17} /> Add invoice</button><button className="button button-quiet" onClick={downloadCsv} disabled={!invoices.length}><ArrowDownToLine size={17} /> Export CSV</button></div>
      </div>

      {storageWarning && <div className="notice warning"><CircleAlert size={19} /><span>{storageWarning}</span>{saved.corruptRaw && <button onClick={() => saveDownload(saved.corruptRaw!, `promiseledger-raw-data-${asOf}.json`, 'application/json')}>Download raw copy <ArrowDownToLine size={15} /></button>}</div>}
      {demo && <div className="notice demo"><Sparkles size={18} /><span>You are viewing sample invoices. Import your own CSV to replace this demo.</span><button onClick={() => csvInput.current?.click()}>Import yours <ArrowRight size={15} /></button></div>}
      {reviewKeys.size > 0 && <div className="notice warning review-notice"><CircleAlert size={19} /><span>{reviewMessage} Confirm status in your ledger.</span><button onClick={() => setFilter('review')}>Review {reviewKeys.size} <ArrowRight size={15} /></button><button onClick={() => { setImportReview(emptyReview()); if (filter === 'review') setFilter('all') }}>Mark reviewed</button></div>}

      {!invoices.length ? <div className="empty-workspace">
        <div className="empty-art"><FileSpreadsheet size={34} /><span className="empty-spark s1" /><span className="empty-spark s2" /></div>
        <span className="kicker">START WITH AN AGING REPORT</span>
        <h2>Your next move starts here.</h2>
        <p>Import a CSV with customer, invoice number, due date and amount. Or use sample invoices to see how the board works.</p>
        <div className="empty-actions"><button className="button button-primary" onClick={() => csvInput.current?.click()}><FileUp size={18} /> Import CSV</button><button className="button button-secondary" onClick={() => { setInvoices(makeDemo()); setDemo(true); setImportReview(emptyReview()); setLoadBlocked(false); setStorageWarning('') }}>Explore sample data</button></div>
        <div className="empty-foot"><a href={sampleCsvUrl} download="sample-ar-aging.csv">Download sample CSV <ArrowDownToLine size={15} /></a><span /> <button onClick={() => restoreInput.current?.click()}>Restore a JSON backup <ArrowRight size={15} /></button></div>
      </div> : <>
        <section className="metric-grid" aria-label="Receivables overview">
          <div className="metric-card metric-dark"><span>Open balance <span className="metric-icon"><FileSpreadsheet size={17} /></span></span><strong>{dollars(openBalance)}</strong><small>Across {active.length} open invoices</small></div>
          <div className="metric-card"><span>Overdue balance <span className="metric-icon rose"><Clock3 size={17} /></span></span><strong>{dollars(overdueBalance)}</strong><small>Past the due date</small></div>
          <div className="metric-card"><span>Actions due <span className="metric-icon amber"><CalendarClock size={17} /></span></span><strong>{actionCount.toString().padStart(2, '0')}</strong><small>{brokenPromises ? `${brokenPromises} missed payment ${brokenPromises === 1 ? 'promise' : 'promises'}` : 'Follow-ups due today or earlier'}</small></div>
          <div className="metric-card"><span>Promised this week <span className="metric-icon mint"><CheckCircle2 size={17} /></span></span><strong>{dollars(promisedThisWeek)}</strong><small>Customer-reported dates</small></div>
        </section>

        <section className="board-section">
          <div className="board-heading"><div><h2>Invoice queue</h2><p>Sorted so urgent items rise to the top.</p></div><div className="board-count">{rows.length} shown <ChevronDown size={15} /></div></div>
          <div className="board-toolbar"><div className="filter-tabs" role="group" aria-label="Filter invoices">
            {([['all', 'All open'], ['overdue', 'Overdue'], ['action', 'Action due'], ['promise', 'Promises'], ...(reviewKeys.size ? [['review', `Review ${reviewKeys.size}`] as [QueueFilter, string]] : []), ['paid', 'Paid']] as [QueueFilter, string][]).map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}
          </div><label className="search-box"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search invoices" aria-label="Search invoices" /></label></div>
          <div className="table-wrap"><table className="invoice-table"><thead><tr><th>CLIENT / INVOICE</th><th>BLOCKER</th><th>NEXT MOVE</th><th>DUE</th><th>AMOUNT</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>
            {rows.map(item => <tr key={item.key} onClick={() => setSelectedKey(item.key)}>
              <td><button className="invoice-open" onClick={() => setSelectedKey(item.key)} aria-label={`Open ${item.invoiceNumber} for ${item.customer}`}><div className="client-cell"><span className="client-avatar">{item.customer.slice(0, 1).toUpperCase()}</span><div><strong>{item.customer}</strong><small>{item.invoiceNumber} <span className="cell-dot">·</span> {statusLabels[item.annotation.status]}</small></div></div></button></td>
              <td><span className={`blocker-tag ${item.annotation.status === 'resolved' || item.annotation.status === 'paid' ? 'none' : item.annotation.blocker}`}>{item.annotation.status === 'paid' ? 'Paid' : item.annotation.status === 'resolved' ? 'Blocker cleared' : blockerLabels[item.annotation.blocker]}</span></td>
              <td><div className="next-cell"><strong>{item.annotation.nextAction || (item.annotation.status === 'paid' ? 'Payment received' : 'Set a next action')}</strong><small>{item.annotation.nextActionDate ? `Due ${dateLabel(item.annotation.nextActionDate)}` : item.annotation.promiseDate ? `Promised ${dateLabel(item.annotation.promiseDate)}` : 'No date set'}</small></div></td>
              <td><div className="due-cell"><strong>{dateLabel(item.dueDate)}</strong><small className={item.isOverdue ? 'overdue-text' : ''}>{item.annotation.status === 'paid' ? 'Closed' : item.isOverdue ? `${item.daysOverdue}d overdue` : 'Upcoming'}</small></div></td>
              <td className="amount-cell">{dollars(item.amount)}</td><td><ArrowUpRight size={16} className="row-arrow" /></td>
            </tr>)}
          </tbody></table>{rows.length === 0 && <div className="no-results"><Inbox size={28} /><strong>No invoices match this view.</strong><span>Try another filter or search.</span></div>}</div>
        </section>
        <div className="workspace-footer"><div><LockKeyhole size={15} /> Stored in this browser only. Back up regularly.</div><div><button onClick={() => restoreInput.current?.click()}>Restore backup</button><span>·</span><a href="https://github.com/Akam1123/promiseledger/issues/new?template=feedback.yml" target="_blank" rel="noreferrer">Send feedback <ArrowUpRight size={13} /></a></div></div>
      </>}
    </main>

    {selected && <InvoiceDrawer key={selected.key} invoice={selected} asOf={asOf} onClose={() => setSelectedKey(null)} onSave={updateInvoice} onDelete={deleteInvoice} onToast={setToast} />}
    {showAdd && <AddInvoiceModal onClose={() => setShowAdd(false)} onAdd={addInvoice} />}
    {showGuide && <GuideModal onClose={() => setShowGuide(false)} onRestore={() => { setShowGuide(false); restoreInput.current?.click() }} />}
    {toast && <div className={`toast ${toast.kind || 'good'}`} role="status"><span>{toast.kind === 'warn' ? <CircleAlert size={18} /> : <CheckCircle2 size={18} />}</span>{toast.text}<button onClick={() => setToast(null)} aria-label="Dismiss message"><X size={15} /></button></div>}
  </div>
}

function InvoiceDrawer({ invoice, asOf, onClose, onSave, onDelete, onToast }: { invoice: Invoice; asOf: string; onClose: () => void; onSave: (invoice: Invoice) => void; onDelete: (invoice: Invoice) => boolean; onToast: (toast: Toast) => void }) {
  const [draft, setDraft] = useState<Invoice>({ ...invoice, annotation: { ...invoice.annotation } })
  const [emailOpen, setEmailOpen] = useState(false)
  const info = deriveInvoice(draft, asOf)
  const email = emailDraft(draft)
  const requestClose = () => {
    if (JSON.stringify(draft) !== JSON.stringify(invoice) && !window.confirm('Discard your unsaved invoice changes?')) return
    onClose()
  }
  const dialogRef = useDialogFocus<HTMLDivElement>(requestClose)
  const setAnnotation = <K extends keyof InvoiceAnnotation>(key: K, value: InvoiceAnnotation[K]) => setDraft(current => ({ ...current, annotation: { ...current.annotation, [key]: value } }))
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(`Subject: ${email.subject}\nTo: ${email.recipient || '[recipient]'}\n\n${email.body}`)
      onToast({ text: 'Email draft copied. Review it before sending.', kind: 'good' })
    } catch { onToast({ text: 'Copy failed. Select and copy the draft text below.', kind: 'warn' }) }
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) requestClose() }}>
    <div ref={dialogRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div className="drawer-top"><div><span className="drawer-kicker">INVOICE DETAILS</span><h2 id="drawer-title">{draft.invoiceNumber}</h2><p>{draft.customer}</p></div><button className="icon-button" onClick={requestClose} aria-label="Close invoice"><X size={21} /></button></div>
      <div className="drawer-scroll">
        <div className="invoice-summary"><div><small>Amount due</small><strong>{dollars(draft.amount)}</strong></div><div><small>Due date</small><strong>{dateLabel(draft.dueDate)}</strong></div><div><small>Age</small><strong className={info.isOverdue ? 'red-ink' : ''}>{info.isOverdue ? `${info.daysOverdue} days late` : 'On time'}</strong></div></div>
        <div className="drawer-section"><div className="section-label"><span>01</span> RESOLUTION STATUS</div><div className="form-grid two"><label>Status<select value={draft.annotation.status} onChange={event => setAnnotation('status', event.target.value as InvoiceAnnotation['status'])}>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>What is holding payment?<select value={draft.annotation.blocker} onChange={event => setAnnotation('blocker', event.target.value as InvoiceAnnotation['blocker'])}>{Object.entries(blockerLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div></div>
        <div className="drawer-section"><div className="section-label"><span>02</span> NEXT MOVE</div><div className="form-grid"><label>Next action<input value={draft.annotation.nextAction || ''} onChange={event => setAnnotation('nextAction', event.target.value)} placeholder="e.g. Ask AP for the purchase order" /></label><div className="form-grid two"><label>Owner<input value={draft.annotation.owner || ''} onChange={event => setAnnotation('owner', event.target.value)} placeholder="Name or team" /></label><label>Action due<input type="date" value={draft.annotation.nextActionDate || ''} onChange={event => setAnnotation('nextActionDate', event.target.value)} /></label></div></div></div>
        <div className="drawer-section"><div className="section-label"><span>03</span> PAYMENT COMMITMENT</div><div className="form-grid two"><label>Promised payment date<input type="date" value={draft.annotation.promiseDate || ''} onChange={event => setAnnotation('promiseDate', event.target.value)} /></label><label>Last contact<input type="date" value={draft.annotation.lastContactDate || ''} onChange={event => setAnnotation('lastContactDate', event.target.value)} /></label></div><p className="field-hint">A promised date is a customer statement, not a guaranteed payment.</p></div>
        <div className="drawer-section"><div className="section-label"><span>04</span> CONTEXT</div><div className="form-grid"><label>Client email<input type="email" value={draft.email || ''} onChange={event => setDraft(current => ({ ...current, email: event.target.value }))} placeholder="accounts@client.com" /></label><label>Notes<textarea rows={4} value={draft.annotation.notes || ''} onChange={event => setAnnotation('notes', event.target.value)} placeholder="What did the client say? What is needed to resolve this?" /></label></div></div>
        {draft.annotation.status === 'paid' ? <div className="paid-panel"><CheckCircle2 size={18} /><span>Marked paid in this workspace. Confirm receipt in your accounting ledger. Follow-up drafting is disabled.</span></div> : <div className="draft-panel"><div className="draft-heading"><div><Mail size={18} /><strong>Human-reviewed follow-up</strong></div><button onClick={() => setEmailOpen(!emailOpen)}>{emailOpen ? 'Hide draft' : 'Write draft'} <ArrowRight size={15} /></button></div>{emailOpen && <div className="email-draft"><label>Subject<input readOnly value={email.subject} /></label><label>Message<textarea readOnly rows={9} value={email.body} /></label><div className="draft-actions"><button className="button button-secondary" onClick={() => void copyDraft()}><Copy size={16} /> Copy draft</button>{email.recipient && <a className="button button-quiet" href={`mailto:${encodeURIComponent(email.recipient)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}>Open email app <ArrowUpRight size={16} /></a>}</div><small>Review the facts, tone, recipient, and invoice record before sending. Nothing is sent automatically.</small></div>}</div>}
      </div>
      <div className="drawer-bottom"><button className="button button-danger" onClick={() => onDelete(draft)}>Delete invoice</button><span className="drawer-bottom-spacer" /><button className="button button-quiet" onClick={requestClose}>Cancel</button><button className="button button-primary" onClick={() => { onSave(draft); onClose() }}><Check size={18} /> Save changes</button></div>
    </div>
  </div>
}

function AddInvoiceModal({ onClose, onAdd }: { onClose: () => void; onAdd: (details: { customer: string; invoiceNumber: string; amount: string; dueDate: string; issueDate: string; email: string }) => boolean }) {
  const [form, setForm] = useState({ customer: '', invoiceNumber: '', amount: '', dueDate: '', issueDate: '', email: '' })
  const requestClose = () => { if (Object.values(form).some(Boolean) && !window.confirm('Discard your unsaved invoice?')) return; onClose() }
  const dialogRef = useDialogFocus<HTMLFormElement>(requestClose)
  const set = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }))
  return <div className="modal-backdrop modal-centered" onMouseDown={event => { if (event.target === event.currentTarget) requestClose() }}><form ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="add-title" onSubmit={event => { event.preventDefault(); if (onAdd(form)) onClose() }}><div className="dialog-head"><div><span className="drawer-kicker">MANUAL ENTRY</span><h2 id="add-title">Add an invoice</h2><p>Track an open invoice without importing a CSV.</p></div><button type="button" className="icon-button" onClick={requestClose} aria-label="Close"><X size={20} /></button></div><div className="form-grid"><label>Customer name <span className="required">*</span><input required value={form.customer} onChange={event => set('customer', event.target.value)} placeholder="Northstar Studio" /></label><div className="form-grid two"><label>Invoice number <span className="required">*</span><input required value={form.invoiceNumber} onChange={event => set('invoiceNumber', event.target.value)} placeholder="INV-1042" /></label><label>Remaining amount due (USD) <span className="required">*</span><input required type="number" min="0.01" step="0.01" value={form.amount} onChange={event => set('amount', event.target.value)} placeholder="4800.00" /></label></div><div className="form-grid two"><label>Invoice date<input type="date" value={form.issueDate} onChange={event => set('issueDate', event.target.value)} /></label><label>Due date <span className="required">*</span><input required type="date" value={form.dueDate} onChange={event => set('dueDate', event.target.value)} /></label></div><label>Client email<input type="email" value={form.email} onChange={event => set('email', event.target.value)} placeholder="ap@client.com" /></label></div><div className="dialog-actions"><button type="button" className="button button-quiet" onClick={requestClose}>Cancel</button><button type="submit" className="button button-primary"><Plus size={17} /> Add invoice</button></div></form></div>
}

function GuideModal({ onClose, onRestore }: { onClose: () => void; onRestore: () => void }) {
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose)
  return <div className="modal-backdrop modal-centered" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><div ref={dialogRef} className="dialog guide" role="dialog" aria-modal="true" aria-labelledby="guide-title"><div className="dialog-head"><div><span className="drawer-kicker">QUICK GUIDE</span><h2 id="guide-title">Working with PromiseLedger</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></div><div className="guide-content"><section><span>01</span><div><h3>Get invoices in</h3><p>Export an open invoices or aging CSV from your ledger. Include customer, invoice number, due date and remaining amount due. If both Amount and Balance appear, Balance is preferred. Email and invoice date are optional. Import the same file again later to refresh amounts and dates; your resolution notes stay attached. Review items absent from a new snapshot and those marked paid locally that still appear.</p></div></section><section><span>02</span><div><h3>Work one blocker at a time</h3><p>Open an invoice to record the reason it is stuck, a next action, its owner and due date, plus any customer payment promise. Set status to Paid only when your ledger confirms receipt.</p></div></section><section><span>03</span><div><h3>Keep your own copy</h3><p>This workspace lives in your browser's local storage. It has no login or team sync. Use Backup JSON often and store the file according to your firm's security policy. Do not include bank credentials or sensitive document contents in notes.</p></div></section></div><div className="guide-actions"><a href={sampleCsvUrl} download="sample-ar-aging.csv">Sample CSV <ArrowDownToLine size={16} /></a><button onClick={onRestore}>Restore JSON backup <ArrowRight size={16} /></button></div></div></div>
}

export default App
