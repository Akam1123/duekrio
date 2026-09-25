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
  TrendingUp,
  X,
} from 'lucide-react'
import {
  deriveInvoice,
  exportInvoicesCsv,
  importLedgerJson,
  parseInvoiceCsv,
  prioritizeInvoices,
} from './lib/ledger'
import {
  WORKSPACE_STORAGE_KEY,
  MIN_BACKUP_PASSPHRASE_LENGTH,
  canonicalWorkspace,
  decryptWorkspaceJson,
  emptyReview,
  encryptWorkspaceJson,
  exportWorkspaceJson,
  importWorkspaceJson,
  isEncryptedWorkspaceJson,
  saveWorkspaceIfCurrent,
  serializeWorkspace,
  validateEncryptedWorkspaceJson,
} from './lib/workspace'
import type { ImportReview, SaveResult, WorkspaceSnapshot } from './lib/workspace'
import {
  LOCKED_WORKSPACE_STORAGE_KEY,
  LockedWorkspaceSession,
  MIN_LOCK_PASSPHRASE_LENGTH,
  validateLockedWorkspaceEnvelope,
  unlockLockedWorkspace,
} from './lib/lockedWorkspace'
import { saveLockedWorkspaceIfCurrent } from './lib/lockedWorkspaceStorage'
import type { CsvImportResult, Invoice, InvoiceAnnotation } from './lib/types'

type View = 'home' | 'app'
type QueueFilter = 'all' | 'overdue' | 'action' | 'promise' | 'review' | 'paid'
type Toast = { text: string; kind?: 'good' | 'warn' }
type PendingImport = { fileName: string; result: CsvImportResult; review: ImportReview; replacingDemo: boolean }
const MAX_CSV_BYTES = 2 * 1024 * 1024
// Leave room for notes and non-ASCII text in a valid browser-storage backup,
// while rejecting unexpectedly large files before reading or parsing them.
const MAX_JSON_BACKUP_BYTES = 10 * 1024 * 1024
const MAX_ENCRYPTED_BACKUP_FILE_BYTES = 16 * 1024 * 1024
const sampleCsvUrl = (window as Window & { __DUENARA_SAMPLE_CSV_URL__?: string }).__DUENARA_SAMPLE_CSV_URL__
  ?? `${import.meta.env.BASE_URL}sample-ar-aging.csv`
const contentBaseUrl = window.location.protocol === 'file:' ? 'https://duekrio.pages.dev/' : import.meta.env.BASE_URL
const sharedPreviewHost = window.location.hostname === 'akam1123.github.io'
const legacyCloudflareHost = window.location.hostname === 'duenara.pages.dev'
const legacyAddress = sharedPreviewHost || legacyCloudflareHost
const dedicatedSiteUrl = 'https://duekrio.pages.dev/'
const dedicatedWorkspaceUrl = `${dedicatedSiteUrl}#/app`
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

async function fileMatchesExactText(file: File, expected: string): Promise<boolean> {
  const expectedBytes = new TextEncoder().encode(expected)
  if (file.size !== expectedBytes.byteLength) return false
  const selectedBytes = new Uint8Array(await file.arrayBuffer())
  return selectedBytes.every((byte, index) => byte === expectedBytes[index])
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
  return <button className="brand" onClick={onClick} aria-label="Duekrio home">
    <span className="brand-mark"><span /></span>
    <span>Due<span className="brand-soft">krio</span></span>
  </button>
}

function LegacyDataCaution() {
  if (!sharedPreviewHost) return null
  return <p className="preview-data-caution"><CircleAlert size={16} /><span>This old GitHub address shares browser storage with other projects on its origin. Browser storage is readable unless you explicitly enable local encryption. Use <a href={dedicatedSiteUrl} target="_blank" rel="noopener noreferrer">duekrio.pages.dev</a> for new work. To move saved work, download a JSON backup here and restore it there. CSV and plain JSON exports remain readable; a passphrase-encrypted JSON backup is available.</span></p>
}

function Landing({ openApp, startSample, sampleAvailable, lockedOpen, onLock }: { openApp: () => void; startSample: () => void; sampleAvailable: boolean; lockedOpen: boolean; onLock: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return <div className="site-shell">
    <header className="site-nav wrap">
      <Brand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
      <nav className={menuOpen ? 'site-links open' : 'site-links'} aria-label="Main navigation">
        <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
        <a href="#who-it-is-for" onClick={() => setMenuOpen(false)}>Who it is for</a>
        <a href={`${contentBaseUrl}resources/`}>Resources</a>
        <a href={`${contentBaseUrl}privacy/`}>Privacy</a>
        {lockedOpen && <button className="nav-lock" onClick={onLock}><LockKeyhole size={16} /> Lock workspace</button>}
        <button className="nav-cta" onClick={openApp}>Open workspace <ArrowRight size={16} /></button>
      </nav>
      <button className="mobile-menu" aria-label="Toggle menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
    </header>

    {lockedOpen && <aside className="lock-session-banner wrap" role="status"><span>Your encrypted workspace is unlocked in this tab until you lock it or reload.</span><button type="button" onClick={onLock}><LockKeyhole size={16} /> Lock workspace</button></aside>}

    {legacyAddress && <aside className="legacy-migration wrap" aria-label="Duekrio's current address"><div><strong>Duekrio is now at duekrio.pages.dev.</strong><p>Browser data saved on this older address stays here. Open this workspace and download a JSON backup, unlocking it first if needed. Restore it on the new address and verify your invoices before clearing the older copy.</p></div><div className="legacy-migration-actions"><button type="button" onClick={openApp}>Open old workspace</button><a href={dedicatedWorkspaceUrl} target="_blank" rel="noopener noreferrer">Open duekrio.pages.dev <ArrowUpRight size={15} /></a></div></aside>}

    <main>
      <section className="hero wrap">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> A clearer way to work your receivables</div>
          <h1>Every unpaid invoice has a reason. <em>Give it a next move.</em></h1>
          <p className="hero-intro">An aging report tells you what is overdue. Duekrio helps you track <strong>why</strong>, <strong>who owns the next step</strong>, and <strong>what happens next</strong>—alongside your accounting software.</p>
          <div className="hero-actions">
            <button className="button button-primary button-large" onClick={openApp}>Open free workspace <ArrowRight size={19} /></button>
            {sampleAvailable ? <button className="text-link text-link-button" onClick={startSample}>Explore sample data <ArrowRight size={17} /></button> : <a className="text-link" href="#how-it-works">See how it works <ArrowDownToLine size={17} /></a>}
          </div>
          <div className="hero-trust"><ShieldCheck size={17} /><span>No account · No bank connection · Browser-only storage. <a href={`${contentBaseUrl}privacy/`}>How your data works</a></span></div>
        </div>
        <div className="hero-visual" aria-label="Illustration of the Duekrio action board">
          <div className="visual-glow" />
          <div className="mock-window">
            <div className="mock-top"><span className="mock-icon">d</span><span>Action queue</span><span className="mock-pill">Illustrative data</span></div>
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
          <article className="step-card"><span className="step-no">01</span><div className="step-icon mint"><FileSpreadsheet size={25} /></div><h3>Import your aging CSV</h3><p>Preview the rows before confirming. A repeat import updates balances while keeping your notes and decisions.</p></article>
          <article className="step-card"><span className="step-no">02</span><div className="step-icon peach"><Filter size={25} /></div><h3>Name the blocker</h3><p>Record the reason payment is stuck, the person responsible, the next action, and any payment commitment.</p></article>
          <article className="step-card"><span className="step-no">03</span><div className="step-icon lilac"><TrendingUp size={25} /></div><h3>Run the weekly queue</h3><p>See overdue actions and missed promises first. Review a follow-up draft, then keep your own backup.</p></article>
        </div>
      </section>

      <section id="who-it-is-for" className="fit-section">
        <div className="wrap fit-grid"><div><span className="kicker">A SMALL, USEFUL FIRST STEP</span><h2>For the person who runs the weekly follow-up.</h2><p>Made for small B2B service firms that send invoices from QuickBooks, Xero, or another ledger and need a clearer human follow-up process. The owner field is a label in your own workspace, not a shared teammate account.</p><div className="fit-list"><span><CheckCircle2 size={19} /> Agencies and consultancies</span><span><CheckCircle2 size={19} /> Field service and project firms</span><span><CheckCircle2 size={19} /> Owner-led finance teams</span></div></div><div className="fit-card"><span className="fit-card-top"><LockKeyhole size={20} /> EARLY ACCESS WORKSPACE</span><h3>Free to use while we learn.</h3><p>This first release runs in your browser. It does not send emails, connect to a ledger, process payments, or offer multi-user sync.</p><button className="button button-primary" onClick={openApp}>Try the workspace <ArrowRight size={18} /></button><small>Keep a JSON backup before clearing browser data.</small></div></div>
      </section>

      <section className="section wrap resources-section" aria-labelledby="resources-title">
        <div className="section-heading"><div><span className="kicker">FREE PRACTICAL GUIDES</span><h2 id="resources-title">Build a better follow-up habit.</h2></div><p>Useful even if you keep working in a spreadsheet. Each guide uses fictional examples and puts a person in control.</p></div>
        <div className="resource-grid"><a href={`${contentBaseUrl}resources/weekly-ar-review-checklist/`} className="resource-card"><span>WORKFLOW GUIDE</span><h3>Weekly AR review checklist</h3><p>From a current aging report to one owner and one next action for every exception.</p><b>Read the checklist <ArrowRight size={17} /></b></a><a href={`${contentBaseUrl}resources/overdue-invoice-email-templates/`} className="resource-card"><span>COMMUNICATION GUIDE</span><h3>Overdue invoice email templates</h3><p>Copyable messages to edit and review for a status check, a missing document, and a payment promise.</p><b>See the templates <ArrowRight size={17} /></b></a></div>
      </section>

      <section className="faq-section" aria-labelledby="faq-title"><div className="wrap faq-grid"><div><span className="kicker">THE IMPORTANT DETAILS</span><h2 id="faq-title">Know exactly what this version does.</h2><p>Duekrio is a focused first release. You stay in control of the source ledger, customer messages, and backups.</p></div><div className="faq-list"><details><summary>Where is my invoice data stored?</summary><p>In this browser on this device. There is no account or cloud sync. Export a JSON backup regularly, especially before clearing site data or changing devices. <a href={`${contentBaseUrl}privacy/`}>Read the privacy details.</a></p></details><details><summary>Can my teammates log in to the same board?</summary><p>No. The owner field is an organizational label in your local workspace. Team accounts, permissions, and sync are not in this release.</p></details><details><summary>Does Duekrio send reminders or collect payments?</summary><p>No. It prepares a draft for you to review and send through your own email app. Confirm payment in your accounting system before marking an invoice paid.</p></details><details><summary>Which CSV exports work?</summary><p>A flat file with customer, invoice number, remaining amount due, and due date. This release treats amounts as USD and dates as YYYY-MM-DD or US M/D/YYYY. The import preview shows skipped rows before anything changes.</p></details><details><summary>Is it free?</summary><p>Yes, this public early-access workspace is free. There is no payment step or paid account. Future pricing, if any, would be announced separately.</p></details></div></div></section>
    </main>

    <footer className="site-footer wrap"><Brand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} /><span>Make the next move clear.</span><div className="site-footer-links"><a href={`${contentBaseUrl}resources/`}>Resources</a><a href={`${contentBaseUrl}privacy/`}>Privacy</a><a href={`${contentBaseUrl}terms/`}>Use terms</a><a href="https://github.com/Akam1123/duekrio" target="_blank" rel="noreferrer">Source & feedback <ArrowUpRight size={14} /></a></div></footer>
  </div>
}

type LoadedWorkspace = {
  invoices: Invoice[]
  demo: boolean
  review: ImportReview
  raw: string | null
  warning?: string
  corruptRaw?: string
  lockedRaw?: string
  lockedReadError?: boolean
  legacyRaw?: string | null
}

function loadSaved(): LoadedWorkspace {
  const empty = { invoices: [] as Invoice[], demo: false, review: emptyReview(), raw: null }
  try {
    const lockedRaw = window.localStorage.getItem(LOCKED_WORKSPACE_STORAGE_KEY)
    if (lockedRaw !== null) {
      let legacyRaw: string | null | undefined
      try { legacyRaw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY) } catch { /* The encrypted copy still takes priority. */ }
      return { ...empty, lockedRaw, legacyRaw }
    }
  } catch {
    return { ...empty, lockedReadError: true, warning: 'Encrypted browser storage could not be read. Reload after browser storage becomes available.' }
  }
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
    if (raw === null) return { invoices: [], demo: false, review: emptyReview(), raw }
    return { ...parseStoredPlainWorkspace(raw), raw }
  } catch {
    return raw === null
      ? { invoices: [], demo: false, review: emptyReview(), raw, warning: 'Browser storage could not be read. Changes may not be saved; export a JSON backup before leaving.' }
      : { invoices: [], demo: false, review: emptyReview(), raw, warning: 'Saved browser data could not be loaded.', corruptRaw: raw }
  }
}

function parseStoredPlainWorkspace(raw: string): WorkspaceSnapshot {
  const parsed = JSON.parse(raw) as { invoices?: unknown; demo?: unknown; review?: Partial<ImportReview> }
  const invoices = importLedgerJson(JSON.stringify({ format: 'duenara', version: 1, invoices: parsed.invoices }))
  const review = parsed.review && Array.isArray(parsed.review.missingKeys) && Array.isArray(parsed.review.paidSeenKeys)
    ? { missingKeys: parsed.review.missingKeys.filter((key): key is string => typeof key === 'string'), paidSeenKeys: parsed.review.paidSeenKeys.filter((key): key is string => typeof key === 'string') }
    : emptyReview()
  return { invoices, demo: parsed.demo === true, review }
}

function withWorkspaceLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  // Web Locks awaits the async callback; its DOM TypeScript overload retains a
  // nested Promise type even though native Promises flatten at runtime.
  return navigator.locks?.request ? navigator.locks.request(key, action) as unknown as Promise<T> : action()
}

function App() {
  const [view, navigate] = useRoute()
  const [saved] = useState(loadSaved)
  const [invoices, setInvoices] = useState<Invoice[]>(saved.invoices)
  const [demo, setDemo] = useState(saved.demo)
  const [importReview, setImportReview] = useState<ImportReview>(saved.review)
  const [loadBlocked, setLoadBlocked] = useState(saved.corruptRaw !== undefined)
  const [storageConflict, setStorageConflict] = useState(false)
  const [conflictBackupDownloaded, setConflictBackupDownloaded] = useState(false)
  const [rawDownloaded, setRawDownloaded] = useState(false)
  const [rawPrepared, setRawPrepared] = useState(false)
  const [rawVerificationError, setRawVerificationError] = useState('')
  const [conflictBackupPrepared, setConflictBackupPrepared] = useState(false)
  const [conflictBackupVerificationError, setConflictBackupVerificationError] = useState('')
  const [storageWarning, setStorageWarning] = useState(saved.warning || '')
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>('saved')
  const [lockedMode, setLockedMode] = useState(saved.lockedRaw !== undefined || saved.lockedReadError === true)
  const [lockedReady, setLockedReady] = useState(false)
  const [lockedRaw, setLockedRaw] = useState<string | null>(saved.lockedRaw ?? null)
  const [lockedReadError, setLockedReadError] = useState(saved.lockedReadError === true)
  const [legacyCopyPresent, setLegacyCopyPresent] = useState(saved.legacyRaw != null)
  const [showLockSetup, setShowLockSetup] = useState(false)
  const [showLegacyCleanup, setShowLegacyCleanup] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<QueueFilter>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [backupRequest, setBackupRequest] = useState<'normal' | 'conflict' | null>(null)
  const [pendingEncryptedRestore, setPendingEncryptedRestore] = useState<{ fileName: string; json: string } | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const csvInput = useRef<HTMLInputElement>(null)
  const restoreInput = useRef<HTMLInputElement>(null)
  const rawVerifyInput = useRef<HTMLInputElement>(null)
  const conflictVerifyInput = useRef<HTMLInputElement>(null)
  const invoicesRef = useRef(invoices)
  const demoRef = useRef(demo)
  const lastSavedRawRef = useRef(saved.raw)
  const legacyRawRef = useRef(saved.legacyRaw ?? saved.raw)
  const lockedRawRef = useRef(saved.lockedRaw ?? null)
  const lockedSessionRef = useRef<LockedWorkspaceSession | null>(null)
  const lockedModeRef = useRef(lockedMode)
  const lockedReadyRef = useRef(lockedReady)
  const lastSavedSnapshotRef = useRef(serializeWorkspace({ invoices: saved.invoices, demo: saved.demo, review: saved.review }))
  const latestSnapshotRef = useRef<WorkspaceSnapshot>({ invoices, demo, review: importReview })
  const saveInFlightRef = useRef(false)
  const conflictRef = useRef(false)
  const conflictBackupDownloadedRef = useRef(conflictBackupDownloaded)
  const loadBlockedRef = useRef(loadBlocked)
  const rawPreparedExpectedRef = useRef<string | null>(null)
  const rawPreparedKeyRef = useRef<string | null>(null)
  const rawVerificationAttemptRef = useRef(0)
  const conflictBackupExpectedRef = useRef<string | null>(null)
  const conflictBackupSnapshotRef = useRef<string | null>(null)
  invoicesRef.current = invoices
  demoRef.current = demo
  latestSnapshotRef.current = { invoices, demo, review: importReview }
  conflictBackupDownloadedRef.current = conflictBackupDownloaded
  loadBlockedRef.current = loadBlocked
  lockedModeRef.current = lockedMode
  lockedReadyRef.current = lockedReady
  const hasUnsavedChanges = (!lockedMode || lockedReady) && serializeWorkspace(latestSnapshotRef.current) !== lastSavedSnapshotRef.current
  const displayedSaveState = hasUnsavedChanges ? saveState === 'failed' ? 'failed' : 'saving' : 'saved'
  const asOf = today()

  function markStorageConflict() {
    if (conflictRef.current) return
    conflictRef.current = true
    setStorageConflict(true)
    if (window.location.hash !== '#/app') window.location.hash = '/app'
  }

  async function createLockedMode(passphrase: string): Promise<void> {
    if (lockedModeRef.current || loadBlockedRef.current || conflictRef.current) throw new Error('Resolve the current workspace warning before locking it.')
    if (saveInFlightRef.current) throw new Error('A browser save is still running. Wait for it to finish and try again.')
    const snapshot = latestSnapshotRef.current
    const serialized = serializeWorkspace(snapshot)
    if (serialized !== lastSavedSnapshotRef.current) throw new Error('Save the current changes or download a JSON backup before locking this workspace.')
    const session = await LockedWorkspaceSession.create(passphrase)
    let adopted = false
    try {
      await withWorkspaceLock(WORKSPACE_STORAGE_KEY, () => withWorkspaceLock(LOCKED_WORKSPACE_STORAGE_KEY, async () => {
        if (lockedModeRef.current || conflictRef.current || serializeWorkspace(latestSnapshotRef.current) !== serialized) {
          throw new Error('The workspace changed while it was being locked. Try again with the latest copy.')
        }
        const oldRaw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
        if (oldRaw !== lastSavedRawRef.current) {
          markStorageConflict()
          throw new Error('Another tab changed the old workspace. Back up this tab before trying again.')
        }
        const result = await saveLockedWorkspaceIfCurrent(window.localStorage, null, snapshot, session)
        if (result.kind === 'conflict') {
          markStorageConflict()
          throw new Error('Another tab created an encrypted workspace. Back up this tab and load that copy.')
        }
        if (result.kind === 'failed') throw new Error('Browser storage did not retain the encrypted copy. Your old workspace remains available; try again or export a backup.')
        if (window.localStorage.getItem(WORKSPACE_STORAGE_KEY) !== oldRaw) {
          if (window.localStorage.getItem(LOCKED_WORKSPACE_STORAGE_KEY) === result.raw) {
            window.localStorage.removeItem(LOCKED_WORKSPACE_STORAGE_KEY)
          }
          markStorageConflict()
          throw new Error('The old workspace changed during migration. Back up this tab before loading the latest version.')
        }
        lockedSessionRef.current = session
        lockedRawRef.current = result.raw
        legacyRawRef.current = oldRaw
        lastSavedSnapshotRef.current = serialized
        lockedModeRef.current = true
        lockedReadyRef.current = true
        setLockedRaw(result.raw)
        setLockedMode(true)
        setLockedReady(true)
        setLegacyCopyPresent(oldRaw !== null)
        setShowLockSetup(false)
        setStorageWarning('')
        setSaveState('saved')
        setToast({ text: 'Encrypted workspace saved and verified in this browser. Keep the passphrase and an encrypted backup.', kind: 'good' })
        adopted = true
      }))
    } finally {
      if (!adopted) session.close()
    }
  }

  async function unlockWorkspace(passphrase: string): Promise<void> {
    if (!lockedModeRef.current || lockedReadyRef.current) return
    const raw = window.localStorage.getItem(LOCKED_WORKSPACE_STORAGE_KEY)
    if (!raw) throw new Error('Encrypted browser data is missing. Keep the raw copy or restore a backup before making changes.')
    const { session, snapshot } = await unlockLockedWorkspace(raw, passphrase)
    try {
      if (window.localStorage.getItem(LOCKED_WORKSPACE_STORAGE_KEY) !== raw) {
        throw new Error('Another tab changed the encrypted workspace while it was unlocking. Try again with the latest copy.')
      }
      lockedSessionRef.current = session
      lockedRawRef.current = raw
      lastSavedSnapshotRef.current = serializeWorkspace(snapshot)
      lockedReadyRef.current = true
      setLockedRaw(raw)
      setInvoices(snapshot.invoices)
      setDemo(snapshot.demo)
      setImportReview(snapshot.review)
      setLockedReady(true)
      setLockedReadError(false)
      setStorageWarning('')
      setSaveState('saved')
    } catch (error) {
      session.close()
      throw error
    }
  }

  function lockWorkspaceNow(): void {
    if (!lockedModeRef.current || !lockedReadyRef.current) return
    if (saveInFlightRef.current || serializeWorkspace(latestSnapshotRef.current) !== lastSavedSnapshotRef.current || conflictRef.current) {
      setToast({ text: 'Save the current changes or download a JSON backup before locking this tab.', kind: 'warn' })
      return
    }
    lockedReadyRef.current = false
    lockedSessionRef.current?.close()
    lockedSessionRef.current = null
    setLockedReady(false)
    setRawDownloaded(false)
    setInvoices([])
    setDemo(false)
    setImportReview(emptyReview())
    setSelectedKey(null)
    setPendingImport(null)
    setBackupRequest(null)
    setPendingEncryptedRestore(null)
    setShowLegacyCleanup(false)
    setShowAdd(false)
    setShowGuide(false)
    setToast(null)
    // A React state reset leaves the initial loaded snapshot and saved refs in
    // this JavaScript heap. A fresh document drops those decrypted references.
    window.location.hash = '/app'
    window.location.reload()
  }

  function downloadLockedRaw(): void {
    const raw = lockedRawRef.current
    if (!raw) return
    saveDownload(raw, `duekrio-locked-raw-${asOf}.json`, 'application/json')
    rawPreparedExpectedRef.current = raw
    rawPreparedKeyRef.current = LOCKED_WORKSPACE_STORAGE_KEY
    rawVerificationAttemptRef.current += 1
    setRawPrepared(true)
    setRawDownloaded(false)
    setConflictBackupDownloaded(false)
    setRawVerificationError('')
  }

  async function verifyRawDownload(file: File, attempt: number, expected: string | null, key: string | null): Promise<void> {
    if (expected === null || !key) throw new Error('Download the exact raw copy again before verifying it.')
    if (!(await fileMatchesExactText(file, expected))) {
      throw new Error('The selected file does not match the downloaded raw copy byte for byte. Keep the browser data and download it again.')
    }
    if (attempt !== rawVerificationAttemptRef.current) return
    if (rawPreparedExpectedRef.current !== expected || rawPreparedKeyRef.current !== key) {
      throw new Error('The raw browser copy changed during verification. Download it again.')
    }
    if (!(loadBlockedRef.current && conflictRef.current)) {
      await withWorkspaceLock(key, async () => {
        if (window.localStorage.getItem(key) !== expected) {
          throw new Error('Browser storage changed after that download. Download the latest raw copy and try again.')
        }
      })
    }
    // File reads and Web Locks are asynchronous. A newer selection or download
    // must win even if this older attempt settles after it.
    if (attempt !== rawVerificationAttemptRef.current) return
    if (rawPreparedExpectedRef.current !== expected || rawPreparedKeyRef.current !== key) {
      throw new Error('The raw browser copy changed during verification. Download it again.')
    }
    setRawVerificationError('')
    setRawDownloaded(true)
    if (loadBlockedRef.current && conflictRef.current) setConflictBackupDownloaded(true)
  }

  async function handleRawVerification(file?: File): Promise<void> {
    if (!file) return
    const attempt = ++rawVerificationAttemptRef.current
    const expected = rawPreparedExpectedRef.current
    const key = rawPreparedKeyRef.current
    setRawDownloaded(false)
    setConflictBackupDownloaded(false)
    setRawVerificationError('')
    try { await verifyRawDownload(file, attempt, expected, key) } catch (error) {
      if (attempt !== rawVerificationAttemptRef.current) return
      setRawDownloaded(false)
      setConflictBackupDownloaded(false)
      setRawVerificationError(error instanceof Error ? error.message : 'The raw file could not be verified. Download it again.')
    }
  }

  async function replaceLockedFromRecovery(snapshot: WorkspaceSnapshot, passphrase: string, sourceRaw?: string): Promise<void> {
    if (!lockedModeRef.current || lockedReadyRef.current) throw new Error('Recovery is available only while the encrypted workspace is locked.')
    if (lockedRawRef.current !== null && !rawDownloaded) throw new Error('Download the exact encrypted raw copy before replacing it.')
    if (lockedRawRef.current !== null && rawPreparedExpectedRef.current !== lockedRawRef.current) throw new Error('Verify a raw file matching the current encrypted copy before replacing it.')
    if (!window.confirm('Replace the current encrypted browser copy with this recovery source? Keep the raw copy you downloaded and any older backup.')) return
    const expectedLocked = lockedRawRef.current
    const session = await LockedWorkspaceSession.create(passphrase)
    let adopted = false
    try {
      const commit = () => withWorkspaceLock(LOCKED_WORKSPACE_STORAGE_KEY, async () => {
        if (lockedReadyRef.current || lockedRawRef.current !== expectedLocked) throw new Error('The encrypted workspace changed during recovery. No data was replaced.')
        if (sourceRaw !== undefined && window.localStorage.getItem(WORKSPACE_STORAGE_KEY) !== sourceRaw) {
          throw new Error('The older browser copy changed during recovery. Try again with its latest version.')
        }
        const result = await saveLockedWorkspaceIfCurrent(window.localStorage, expectedLocked, snapshot, session)
        if (result.kind === 'conflict') throw new Error('Another tab changed the encrypted workspace. No recovery data was written.')
        if (result.kind === 'failed') throw new Error('Browser storage did not retain the recovered encrypted copy. The raw copy and older browser copy were not removed.')
        if (sourceRaw !== undefined && window.localStorage.getItem(WORKSPACE_STORAGE_KEY) !== sourceRaw) {
          if (window.localStorage.getItem(LOCKED_WORKSPACE_STORAGE_KEY) === result.raw) {
            if (expectedLocked === null) window.localStorage.removeItem(LOCKED_WORKSPACE_STORAGE_KEY)
            else window.localStorage.setItem(LOCKED_WORKSPACE_STORAGE_KEY, expectedLocked)
            if (window.localStorage.getItem(LOCKED_WORKSPACE_STORAGE_KEY) !== expectedLocked) {
              throw new Error('The older browser copy changed and the prior encrypted copy could not be restored. Keep both raw copies.')
            }
          }
          throw new Error('The older browser copy changed during recovery. Keep both copies and try again.')
        }
        lockedSessionRef.current = session
        lockedRawRef.current = result.raw
        lastSavedSnapshotRef.current = serializeWorkspace(snapshot)
        lockedReadyRef.current = true
        setLockedRaw(result.raw)
        setInvoices(snapshot.invoices)
        setDemo(snapshot.demo)
        setImportReview(snapshot.review)
        setLockedReady(true)
        setLockedReadError(false)
        rawVerificationAttemptRef.current += 1
        rawPreparedExpectedRef.current = null
        rawPreparedKeyRef.current = null
        setRawPrepared(false)
        setRawDownloaded(false)
        setSaveState('saved')
        setStorageWarning('')
        setToast({ text: 'Recovered encrypted workspace saved and verified. Keep a fresh encrypted backup.', kind: 'good' })
        adopted = true
      })
      if (sourceRaw !== undefined) await withWorkspaceLock(WORKSPACE_STORAGE_KEY, commit)
      else await commit()
    } finally {
      if (!adopted) session.close()
    }
  }

  async function recoverLockedFromLegacy(passphrase: string): Promise<void> {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
    if (raw === null) throw new Error('No older browser copy is available. Choose a JSON backup instead.')
    const snapshot = parseStoredPlainWorkspace(raw)
    await replaceLockedFromRecovery(snapshot, passphrase, raw)
  }

  async function recoverLockedFromBackup(file: File, backupPassphrase: string, passphrase: string): Promise<void> {
    if (file.size > MAX_ENCRYPTED_BACKUP_FILE_BYTES) throw new Error('This backup is over 16 MB. No data was changed.')
    const json = await file.text()
    const snapshot = isEncryptedWorkspaceJson(json)
      ? await decryptWorkspaceJson(json, backupPassphrase)
      : file.size <= MAX_JSON_BACKUP_BYTES ? importWorkspaceJson(json) : (() => { throw new Error('Plain JSON backup is over 10 MB. No data was changed.') })()
    await replaceLockedFromRecovery(snapshot, passphrase)
  }

  async function downloadEncryptedLegacyBackup(passphrase: string): Promise<void> {
    if (!lockedModeRef.current || !lockedReadyRef.current || !legacyCopyPresent) throw new Error('No older readable copy is available for this step.')
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
    if (raw === null || raw !== legacyRawRef.current) throw new Error('The older browser copy changed. Reload and review it before backing it up.')
    const snapshot = parseStoredPlainWorkspace(raw)
    const encrypted = await encryptWorkspaceJson(snapshot, passphrase)
    saveDownload(encrypted, `duekrio-older-browser-copy-${asOf}.encrypted.json`, 'application/json')
  }

  async function removeLegacyCopyAfterBackup(file: File, passphrase: string): Promise<boolean> {
    if (!lockedModeRef.current || !lockedReadyRef.current || !legacyCopyPresent || conflictRef.current || saveInFlightRef.current ||
        serializeWorkspace(latestSnapshotRef.current) !== lastSavedSnapshotRef.current) {
      throw new Error('Finish saving the encrypted workspace before removing the older copy.')
    }
    if (file.size > MAX_ENCRYPTED_BACKUP_FILE_BYTES) throw new Error('The selected backup is over 16 MB. Nothing was removed.')
    const json = await file.text()
    if (!isEncryptedWorkspaceJson(json)) throw new Error('Select the encrypted JSON backup of the older browser copy. Nothing was removed.')
    const restored = await decryptWorkspaceJson(json, passphrase)
    const expectedLegacy = legacyRawRef.current
    if (expectedLegacy === null || canonicalWorkspace(restored) !== canonicalWorkspace(parseStoredPlainWorkspace(expectedLegacy))) {
      throw new Error('This backup does not match the older browser copy. Nothing was removed.')
    }
    if (!window.confirm('The encrypted backup matches the older copy. Remove only that readable browser copy now? Keep the downloaded backup and your workspace passphrase.')) return false

    await withWorkspaceLock(WORKSPACE_STORAGE_KEY, () => withWorkspaceLock(LOCKED_WORKSPACE_STORAGE_KEY, async () => {
      const session = lockedSessionRef.current
      if (!session || !lockedReadyRef.current || conflictRef.current) throw new Error('The encrypted workspace is not ready. Nothing was removed.')
      const currentLocked = window.localStorage.getItem(LOCKED_WORKSPACE_STORAGE_KEY)
      if (currentLocked === null || currentLocked !== lockedRawRef.current) {
        markStorageConflict()
        throw new Error('Another tab changed the encrypted workspace. Nothing was removed.')
      }
      const verifiedCurrent = await session.open(currentLocked)
      if (canonicalWorkspace(verifiedCurrent) !== canonicalWorkspace(latestSnapshotRef.current)) {
        throw new Error('The encrypted workspace did not match this tab. Nothing was removed.')
      }
      const currentLegacy = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
      if (currentLegacy !== expectedLegacy || canonicalWorkspace(restored) !== canonicalWorkspace(parseStoredPlainWorkspace(currentLegacy))) {
        throw new Error('The older browser copy changed. Nothing was removed.')
      }
      window.localStorage.removeItem(WORKSPACE_STORAGE_KEY)
      if (window.localStorage.getItem(WORKSPACE_STORAGE_KEY) !== null) throw new Error('The older readable copy could not be removed. Try again.')
      legacyRawRef.current = null
      setLegacyCopyPresent(false)
      setShowLegacyCleanup(false)
      setToast({ text: 'Older readable browser copy removed after encrypted backup verification. The encrypted workspace remains available.', kind: 'good' })
    }))
    return true
  }

  function persistCurrentWorkspace() {
    if (loadBlockedRef.current || conflictRef.current || saveInFlightRef.current || (lockedModeRef.current && !lockedReadyRef.current)) return
    if (serializeWorkspace(latestSnapshotRef.current) === lastSavedSnapshotRef.current) {
      if (saveState === 'failed') {
        setSaveState('saved')
        setStorageWarning('')
      }
      return
    }
    const modeAtStart = lockedModeRef.current
    saveInFlightRef.current = true
    setSaveState('saving')
    let failed = false
    const markSaveFailed = (message: string) => {
      failed = true
      setSaveState('failed')
      setStorageWarning(message)
    }
    const save = async () => {
      if (loadBlockedRef.current || conflictRef.current || lockedModeRef.current !== modeAtStart || (modeAtStart && !lockedReadyRef.current)) return
      const snapshot = latestSnapshotRef.current
      try {
        let result: SaveResult
        if (modeAtStart) {
          const session = lockedSessionRef.current
          if (!session) throw new Error('The encrypted workspace is locked.')
          result = await saveLockedWorkspaceIfCurrent(window.localStorage, lockedRawRef.current, snapshot, session)
        } else {
          if (window.localStorage.getItem(LOCKED_WORKSPACE_STORAGE_KEY) !== null) { markStorageConflict(); return }
          result = saveWorkspaceIfCurrent(window.localStorage, lastSavedRawRef.current, snapshot)
        }
        if (lockedModeRef.current !== modeAtStart || conflictRef.current) return
        if (result.kind === 'conflict') { markStorageConflict(); return }
        if (result.kind === 'failed') {
          markSaveFailed(`Changes in this tab were not saved. ${modeAtStart ? 'Encrypted ' : ''}browser storage did not retain the write. Retry saving or download a JSON backup before leaving.`)
          return
        }
        if (modeAtStart) {
          lockedRawRef.current = result.raw
          setLockedRaw(result.raw)
        } else lastSavedRawRef.current = result.raw
        lastSavedSnapshotRef.current = serializeWorkspace(snapshot)
        setStorageWarning('')
      } catch {
        markSaveFailed(`Changes in this tab were not saved. ${modeAtStart ? 'Encrypted ' : ''}browser storage may be unavailable or full. Retry saving or download a JSON backup before leaving.`)
      }
    }
    // A single in-flight request coalesces edits and saves the latest snapshot.
    // Web Locks serialize read-check-write across tabs; the preflight check also
    // refuses stale writes in browsers without Web Locks.
    const request = Promise.resolve().then(() => withWorkspaceLock(modeAtStart ? LOCKED_WORKSPACE_STORAGE_KEY : WORKSPACE_STORAGE_KEY, save))
    void request.catch(() => {
      markSaveFailed('Changes in this tab were not saved. Browser storage is unavailable. Retry saving or download a JSON backup before leaving.')
    }).finally(() => {
      saveInFlightRef.current = false
      if (failed || loadBlockedRef.current || conflictRef.current || lockedModeRef.current !== modeAtStart || (modeAtStart && !lockedReadyRef.current)) return
      if (serializeWorkspace(latestSnapshotRef.current) !== lastSavedSnapshotRef.current) persistCurrentWorkspace()
      else setSaveState('saved')
    })
  }

  useEffect(() => {
    persistCurrentWorkspace()
  }, [invoices, demo, importReview, loadBlocked, lockedMode, lockedReady])

  useEffect(() => {
    const checkLatest = () => {
      try {
        const currentLocked = window.localStorage.getItem(LOCKED_WORKSPACE_STORAGE_KEY)
        if (lockedModeRef.current) {
          setLegacyCopyPresent(window.localStorage.getItem(WORKSPACE_STORAGE_KEY) !== null)
          if (!lockedReadyRef.current) {
            if (currentLocked !== lockedRawRef.current) {
              lockedRawRef.current = currentLocked
              setLockedRaw(currentLocked)
              rawVerificationAttemptRef.current += 1
              setRawDownloaded(false)
              setConflictBackupDownloaded(false)
              setRawPrepared(false)
              rawPreparedExpectedRef.current = null
              rawPreparedKeyRef.current = null
              setRawVerificationError('The encrypted browser copy changed. Download and verify the latest raw file before recovery.')
            }
            setLockedReadError(false)
          } else if (currentLocked !== lockedRawRef.current) markStorageConflict()
        } else if (currentLocked !== null || window.localStorage.getItem(WORKSPACE_STORAGE_KEY) !== lastSavedRawRef.current) {
          markStorageConflict()
        }
      } catch { /* The storage warning is handled by the save path. */ }
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === WORKSPACE_STORAGE_KEY || event.key === LOCKED_WORKSPACE_STORAGE_KEY || event.key === null) checkLatest()
    }
    const onVisible = () => { if (document.visibilityState === 'visible') checkLatest() }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', checkLatest)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', checkLatest)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 5500)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (storageConflict) {
      setConflictBackupDownloaded(false)
      setConflictBackupPrepared(false)
      conflictBackupExpectedRef.current = null
      conflictBackupSnapshotRef.current = null
    }
  }, [invoices, demo, importReview, storageConflict])

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      const hasUnbackedConflict = conflictRef.current && !conflictBackupDownloadedRef.current
      const hasUnsavedChanges = !conflictRef.current &&
        (!lockedModeRef.current || lockedReadyRef.current) &&
        serializeWorkspace(latestSnapshotRef.current) !== lastSavedSnapshotRef.current
      if (!hasUnbackedConflict && !hasUnsavedChanges) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [])

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
    if (loadBlocked || storageConflict) {
      setToast({ text: storageConflict ? 'This tab is paused after another tab changed the workspace. Back up this copy, then load the latest version.' : 'Download the unreadable raw data, then restore or discard it before importing.', kind: 'warn' })
      if (csvInput.current) csvInput.current.value = ''
      return
    }
    try {
      if (file.size > MAX_CSV_BYTES) throw new Error('This CSV is over 2 MB. Export a smaller aging report and try again.')
      const text = await file.text()
      const currentDemo = demoRef.current
      const current = currentDemo ? [] : invoicesRef.current
      const result = parseInvoiceCsv(text, current)
      if (result.added + result.updated === 0) {
        setPendingImport({ fileName: file.name, result, review: emptyReview(), replacingDemo: currentDemo })
        return
      }
      const snapshot = parseInvoiceCsv(text)
      const present = new Set(snapshot.invoices.map(item => item.key))
      const review: ImportReview = {
        missingKeys: current.filter(item => item.annotation.status !== 'paid' && !present.has(item.key)).map(item => item.key),
        paidSeenKeys: current.filter(item => item.annotation.status === 'paid' && present.has(item.key)).map(item => item.key),
      }
      setPendingImport({ fileName: file.name, result, review, replacingDemo: currentDemo })
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : 'Unable to read that CSV file.', kind: 'warn' })
    } finally {
      if (csvInput.current) csvInput.current.value = ''
    }
  }

  function confirmImport() {
    if (!pendingImport || loadBlocked || storageConflict || pendingImport.result.added + pendingImport.result.updated === 0) return
    const { result, review } = pendingImport
    setInvoices(result.invoices)
    setDemo(false)
    setImportReview(review)
    setPendingImport(null)
    const reviewCount = review.missingKeys.length + review.paidSeenKeys.length
    setToast({ text: `Loaded ${result.added} new and updated ${result.updated} invoices in this tab; saving now.${result.skipped ? ` ${result.skipped} rows skipped.` : ''}${reviewCount ? ` ${reviewCount} need reconciliation.` : ''}`, kind: result.issues.length || reviewCount ? 'warn' : 'good' })
  }

  function downloadCorruptCopy() {
    if (saved.corruptRaw === undefined) return
    saveDownload(saved.corruptRaw, `duekrio-unreadable-data-${asOf}.txt`, 'text/plain;charset=utf-8')
    rawPreparedExpectedRef.current = saved.corruptRaw
    rawPreparedKeyRef.current = WORKSPACE_STORAGE_KEY
    rawVerificationAttemptRef.current += 1
    setRawPrepared(true)
    setRawDownloaded(false)
    setConflictBackupDownloaded(false)
    setRawVerificationError('')
  }

  async function discardCorruptData() {
    if (!loadBlocked || storageConflict || !rawDownloaded || rawPreparedExpectedRef.current !== saved.corruptRaw) return
    if (!window.confirm('Discard the unreadable browser data and start with an empty workspace? Keep the raw copy you downloaded in case it can be recovered later.')) return
    try {
      await withWorkspaceLock(WORKSPACE_STORAGE_KEY, () => withWorkspaceLock(LOCKED_WORKSPACE_STORAGE_KEY, async () => {
        if (window.localStorage.getItem(WORKSPACE_STORAGE_KEY) !== saved.corruptRaw ||
            window.localStorage.getItem(LOCKED_WORKSPACE_STORAGE_KEY) !== null) {
          markStorageConflict()
          throw new Error('Browser storage changed. The unreadable copy was kept; review the latest workspace before trying again.')
        }
        window.localStorage.removeItem(WORKSPACE_STORAGE_KEY)
        if (window.localStorage.getItem(WORKSPACE_STORAGE_KEY) !== null) throw new Error('The unreadable browser entry could not be removed.')
        lastSavedRawRef.current = null
        lastSavedSnapshotRef.current = ''
        rawVerificationAttemptRef.current += 1
        rawPreparedExpectedRef.current = null
        rawPreparedKeyRef.current = null
        setRawPrepared(false)
        setRawDownloaded(false)
        setInvoices([])
        setDemo(false)
        setImportReview(emptyReview())
        setLoadBlocked(false)
        setStorageWarning('')
        setToast({ text: 'Unreadable browser data discarded. You can now start again.', kind: 'good' })
      }))
    } catch {
      setStorageWarning('Browser storage could not be cleared or changed during the operation. Keep your verified raw file and review the latest copy before trying again.')
    }
  }

  function applyRestoredSnapshot(restored: WorkspaceSnapshot): void {
    if (conflictRef.current) throw new Error('Another tab changed this workspace. Back up this tab, then load the latest saved version before restoring.')
    if ((loadBlocked || (invoices.length && !demo)) && !window.confirm(loadBlocked
      ? `Replace the unreadable browser data with ${restored.invoices.length} invoices from this backup? Keep the raw copy you downloaded in case it can be recovered later.`
      : `Replace your current ${invoices.length} invoices with ${restored.invoices.length} from this backup? Export your current backup first if you may need it.`)) return
    const activeKey = lockedModeRef.current ? LOCKED_WORKSPACE_STORAGE_KEY : WORKSPACE_STORAGE_KEY
    const expectedRaw = lockedModeRef.current ? lockedRawRef.current : lastSavedRawRef.current
    if (window.localStorage.getItem(activeKey) !== expectedRaw || (!lockedModeRef.current && window.localStorage.getItem(LOCKED_WORKSPACE_STORAGE_KEY) !== null)) {
      markStorageConflict()
      throw new Error('Another tab changed this workspace. No data was changed.')
    }
    lastSavedSnapshotRef.current = ''
    setInvoices(restored.invoices)
    setDemo(restored.demo)
    setImportReview(restored.review)
    setLoadBlocked(false)
    setStorageWarning('')
    setToast({ text: `Loaded ${restored.invoices.length} invoices from backup in this tab; saving now.`, kind: 'good' })
  }

  async function restoreBackup(file?: File) {
    if (!file) return
    try {
      if (conflictRef.current) throw new Error('Another tab changed this workspace. Back up this tab, then load the latest saved version before restoring.')
      if (loadBlocked && !rawDownloaded) throw new Error('Download the unreadable raw data before restoring a backup.')
      if (file.size > MAX_ENCRYPTED_BACKUP_FILE_BYTES) throw new Error('This backup is over 16 MB. No data was changed. Restore a smaller backup.')
      const json = await file.text()
      if (isEncryptedWorkspaceJson(json)) {
        validateEncryptedWorkspaceJson(json)
        setPendingEncryptedRestore({ fileName: file.name, json })
      } else {
        if (file.size > MAX_JSON_BACKUP_BYTES) throw new Error('This plain JSON backup is over 10 MB. No data was changed. Restore a smaller backup.')
        applyRestoredSnapshot(importWorkspaceJson(json))
      }
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : 'That backup could not be read.', kind: 'warn' })
    } finally {
      if (restoreInput.current) restoreInput.current.value = ''
    }
  }

  function addInvoice(details: { customer: string; invoiceNumber: string; amount: string; dueDate: string; issueDate: string; email: string }): string | null {
    if (loadBlocked) return 'Recover or discard unreadable browser data before adding an invoice.'
    const csv = 'Customer,Invoice Number,Invoice Date,Due Date,Amount,Email\n' +
      [details.customer, details.invoiceNumber, details.issueDate, details.dueDate, details.amount, details.email].map(csvCell).join(',')
    const result = parseInvoiceCsv(csv, demo ? [] : invoices)
    if (result.added + result.updated === 0) {
      return result.issues[0]?.message || 'Please check the invoice details.'
    }
    if (result.updated) return 'An invoice with this customer and number already exists. Open it in the queue to make changes. No data was changed.'
    if (demo && !window.confirm('Adding this invoice will replace the sample workspace and any edits made to sample invoices. Continue?')) return 'Sample invoices were kept. No data was changed.'
    setInvoices(result.invoices)
    setDemo(false)
    setToast(storageConflict ? { text: 'Invoice kept in this tab only. Download a JSON backup before loading the saved version.', kind: 'warn' } : { text: 'Invoice added in this tab; saving now.', kind: 'good' })
    return null
  }

  function updateInvoice(updated: Invoice) {
    setInvoices(current => current.map(item => item.key === updated.key ? updated : item))
    setToast(storageConflict ? { text: 'Invoice kept in this tab only. Download a JSON backup before loading the saved version.', kind: 'warn' } : { text: 'Invoice updated in this tab; saving now.', kind: 'good' })
  }

  function deleteInvoice(invoice: Invoice) {
    if (storageConflict) { setToast({ text: 'Deletion is paused because another tab changed the workspace.', kind: 'warn' }); return false }
    if (!window.confirm(`Delete ${invoice.invoiceNumber} for ${invoice.customer} from this browser? This cannot be undone unless you have a backup.`)) return false
    setInvoices(current => current.filter(item => item.key !== invoice.key))
    setImportReview(current => ({
      missingKeys: current.missingKeys.filter(key => key !== invoice.key),
      paidSeenKeys: current.paidSeenKeys.filter(key => key !== invoice.key),
    }))
    setSelectedKey(null)
    setToast({ text: 'Invoice removed from this tab; saving now.', kind: 'good' })
    return true
  }

  const downloadBackup = () => setBackupRequest('normal')
  const backupSnapshot = (): WorkspaceSnapshot => ({ invoices, demo, review: importReview })
  function finishBackupRequest(content: string) {
    if (backupRequest === 'conflict') {
      conflictBackupExpectedRef.current = content
      conflictBackupSnapshotRef.current = serializeWorkspace(backupSnapshot())
      setConflictBackupPrepared(true)
      setConflictBackupDownloaded(false)
      setConflictBackupVerificationError('')
    }
    setBackupRequest(null)
  }
  function downloadPlainBackup() {
    const content = exportWorkspaceJson(backupSnapshot())
    saveDownload(content, `duekrio-backup-${asOf}.json`, 'application/json')
    finishBackupRequest(content)
    setToast({ text: 'Plain JSON backup downloaded. Protect this readable file.', kind: 'warn' })
  }
  async function downloadEncryptedBackup(passphrase: string) {
    const encrypted = await encryptWorkspaceJson(backupSnapshot(), passphrase)
    saveDownload(encrypted, `duekrio-backup-${asOf}.encrypted.json`, 'application/json')
    finishBackupRequest(encrypted)
    setToast({ text: 'Encrypted JSON backup downloaded. Keep the passphrase separately; it cannot be recovered.', kind: 'good' })
  }
  const downloadCsv = () => saveDownload(exportInvoicesCsv(invoices), `duekrio-invoices-${asOf}.csv`, 'text/csv;charset=utf-8')

  function downloadConflictBackup() {
    setConflictBackupDownloaded(false)
    setConflictBackupVerificationError('')
    if (saved.corruptRaw !== undefined && loadBlocked) {
      downloadCorruptCopy()
    } else setBackupRequest('conflict')
  }

  async function verifyConflictBackup(file?: File): Promise<void> {
    if (!file || !conflictBackupPrepared || !conflictRef.current) return
    const expected = conflictBackupExpectedRef.current
    const snapshot = conflictBackupSnapshotRef.current
    if (expected === null || snapshot === null || serializeWorkspace(latestSnapshotRef.current) !== snapshot) {
      throw new Error('This tab changed after the backup was created. Download and verify a fresh copy.')
    }
    if (!(await fileMatchesExactText(file, expected))) {
      throw new Error('The selected file does not match this tab’s downloaded backup byte for byte. Download it again.')
    }
    if (serializeWorkspace(latestSnapshotRef.current) !== snapshot) {
      throw new Error('This tab changed during verification. Download and verify a fresh copy.')
    }
    setConflictBackupVerificationError('')
    setConflictBackupDownloaded(true)
  }

  async function handleConflictBackupVerification(file?: File): Promise<void> {
    try { await verifyConflictBackup(file) } catch (error) {
      setConflictBackupDownloaded(false)
      setConflictBackupVerificationError(error instanceof Error ? error.message : 'The selected backup could not be verified. Download it again.')
    }
  }

  function reloadAfterConflictBackup(): void {
    if (!conflictRef.current || !conflictBackupDownloadedRef.current) return
    if (loadBlockedRef.current) {
      if (rawPreparedExpectedRef.current !== saved.corruptRaw) return
    } else if (serializeWorkspace(latestSnapshotRef.current) !== conflictBackupSnapshotRef.current) {
      setConflictBackupDownloaded(false)
      setConflictBackupVerificationError('This tab changed after verification. Download and verify a fresh copy.')
      return
    }
    window.location.reload()
  }

  if (view === 'home') return <Landing openApp={() => navigate('app')} lockedOpen={lockedMode && lockedReady} onLock={lockWorkspaceNow} sampleAvailable={!lockedMode && !invoices.length && !loadBlocked && !storageConflict} startSample={() => { if (lockedMode || loadBlocked || storageConflict || invoices.length) return; setInvoices(makeDemo()); setDemo(true); setImportReview(emptyReview()); navigate('app') }} />

  if (lockedMode && !lockedReady) {
    let issue = lockedReadError ? 'Encrypted browser storage could not be read. Check browser storage settings, then reload.' : ''
    if (!issue && !lockedRaw) issue = 'The encrypted workspace is missing from browser storage. Do not clear any remaining site data.'
    if (!issue && lockedRaw) {
      try { validateLockedWorkspaceEnvelope(lockedRaw) } catch (error) {
        issue = error instanceof Error ? error.message : 'Encrypted browser data is damaged.'
      }
    }
    return <LockedWorkspaceGate issue={issue} rawAvailable={Boolean(lockedRaw)} rawPrepared={rawPrepared} rawDownloaded={rawDownloaded} rawVerificationError={rawVerificationError} legacyCopyPresent={legacyCopyPresent} onUnlock={unlockWorkspace} onDownloadRaw={downloadLockedRaw} onVerifyRaw={handleRawVerification} onRecoverLegacy={recoverLockedFromLegacy} onRecoverBackup={recoverLockedFromBackup} />
  }

  const migrationCopy = loadBlocked
    ? 'Saved data here could not be read. Follow the recovery steps below and keep the raw copy. Move only a valid JSON backup to the new address.'
    : storageConflict
      ? 'Another tab changed this workspace. Follow the recovery steps below and download this tab’s copy before moving to the new address.'
      : invoices.length
        ? `This browser keeps data for the two addresses separately. Download a JSON backup here, then restore it at duekrio.pages.dev and verify the invoices before clearing the older copy. ${lockedMode ? 'This workspace is encrypted locally while locked; plain JSON and CSV downloads are still readable.' : 'Local browser storage is readable until you enable workspace encryption.'}`
        : 'No invoices are loaded here. Open the new address to start, or restore an existing JSON backup there. Data from this address does not transfer automatically.'

  return <div className="app-shell">
    <header className="app-header">
      <div className="app-header-inner wrap">
        <Brand onClick={() => navigate('home')} />
        <span className="header-divider" />
        <span className="workspace-label">Workspace <span className="workspace-dot" /> <b>{lockedMode ? 'Encrypted · unlocked' : 'Local'}</b></span>
        <div className="app-header-actions">
          {lockedMode && <button className="header-link" onClick={lockWorkspaceNow}><LockKeyhole size={17} /> Lock workspace</button>}
          <button className="header-link" onClick={() => setShowGuide(true)}><HelpCircle size={17} /> Help</button>
          <button className="header-link" onClick={downloadBackup} disabled={!invoices.length}><ArrowDownToLine size={17} /> Backup</button>
          <button className="button button-primary button-small" onClick={() => csvInput.current?.click()} disabled={loadBlocked || storageConflict}><FileUp size={17} /> Import CSV</button>
          <button className="mobile-menu app-menu-toggle" aria-label="More actions" aria-expanded={showMobileMenu} onClick={() => setShowMobileMenu(!showMobileMenu)}><MoreHorizontal size={23} /></button>
        </div>
      </div>
      {showMobileMenu && <div className="app-mobile-actions">{lockedMode && <button onClick={() => { lockWorkspaceNow(); setShowMobileMenu(false) }}>Lock workspace</button>}<button onClick={() => { setShowGuide(true); setShowMobileMenu(false) }}>Help</button><button disabled={!invoices.length} onClick={() => { downloadBackup(); setShowMobileMenu(false) }}>Backup options</button><button disabled={loadBlocked || storageConflict} onClick={() => { csvInput.current?.click(); setShowMobileMenu(false) }}>Import CSV</button></div>}
    </header>
    <main className="app-main wrap">
      <input ref={csvInput} type="file" accept=".csv,text/csv" className="sr-only" onChange={event => void importCsv(event.target.files?.[0])} aria-label="Import invoice CSV" />
      <input ref={restoreInput} type="file" accept=".json,application/json" className="sr-only" onChange={event => void restoreBackup(event.target.files?.[0])} aria-label="Restore JSON backup, encrypted or plain" />
      <input ref={rawVerifyInput} type="file" accept=".json,.txt,application/json,text/plain" className="sr-only" onChange={event => { void handleRawVerification(event.target.files?.[0]); event.target.value = '' }} aria-label="Choose downloaded raw browser copy for byte verification" />
      <input ref={conflictVerifyInput} type="file" accept=".json,application/json" className="sr-only" onChange={event => { void handleConflictBackupVerification(event.target.files?.[0]); event.target.value = '' }} aria-label="Choose downloaded tab backup for byte verification" />
      <div className="app-title-row">
        <div><span className="kicker">YOUR RECEIVABLES, WITH A PLAN</span><h1>Action board<span className="title-period">.</span></h1><p>Know what is stuck, who is moving it, and when to follow up.</p></div>
        <div className="title-actions"><button className="button button-secondary" onClick={() => setShowAdd(true)} disabled={loadBlocked || storageConflict}><Plus size={17} /> Add invoice</button><button className="button button-quiet" onClick={downloadCsv} disabled={!invoices.length}><ArrowDownToLine size={17} /> Export CSV</button></div>
      </div>

      {legacyAddress && <aside className="legacy-migration" aria-label="Duekrio's current address"><div><strong>Duekrio is now at duekrio.pages.dev.</strong><p>{migrationCopy}</p></div><div className="legacy-migration-actions">{!loadBlocked && !storageConflict && invoices.length > 0 && <button type="button" onClick={downloadBackup}>Backup options</button>}<a href={dedicatedWorkspaceUrl} target="_blank" rel="noopener noreferrer">Open duekrio.pages.dev <ArrowUpRight size={15} /></a></div></aside>}

      {!loadBlocked && !storageConflict && <div className="browser-storage-note"><LockKeyhole size={17} /><span role="status">{displayedSaveState === 'failed' ? 'Changes are not saved in this browser.' : displayedSaveState === 'saving' ? 'Saving changes in this browser…' : storageWarning ? 'Browser storage could not be verified.' : lockedMode ? 'Current workspace saved encrypted in this browser.' : 'Saved without encryption in this browser only.'} {lockedMode && legacyCopyPresent ? 'An older readable copy remains in browser storage and is not protected by this lock. ' : ''}There is no online backup or team sync. <a href={`${contentBaseUrl}privacy/`}>How your data works</a></span>{lockedMode ? <button onClick={lockWorkspaceNow}><LockKeyhole size={15} /> Lock now</button> : <button onClick={() => setShowLockSetup(true)}><LockKeyhole size={15} /> Encrypt workspace</button>}<button onClick={downloadBackup} disabled={!invoices.length}>Backup options <ArrowDownToLine size={15} /></button></div>}

      {lockedMode && legacyCopyPresent && !storageConflict && <div className="notice warning legacy-cleanup-notice" role="alert"><CircleAlert size={19} /><span>An older readable browser copy remains on this device. Back it up and verify the encrypted file before removing only that old copy.</span><button type="button" disabled={displayedSaveState !== 'saved'} onClick={() => setShowLegacyCleanup(true)}>Protect and remove old copy <ArrowRight size={15} /></button></div>}

      {storageWarning && !loadBlocked && !storageConflict && <div className="notice warning" role="alert"><CircleAlert size={19} /><span>{storageWarning}</span>{displayedSaveState === 'failed' && <button type="button" onClick={persistCurrentWorkspace}>Retry saving <ArrowRight size={15} /></button>}</div>}
      {demo && !storageConflict && <div className="notice demo"><FileSpreadsheet size={18} /><span>You are viewing sample invoices. Import your own CSV to replace this demo.</span><button onClick={() => csvInput.current?.click()}>Import yours <ArrowRight size={15} /></button></div>}
      {reviewKeys.size > 0 && !storageConflict && <div className="notice warning review-notice"><CircleAlert size={19} /><span>{reviewMessage} Confirm status in your ledger.</span><button onClick={() => setFilter('review')}>Review {reviewKeys.size} <ArrowRight size={15} /></button><button onClick={() => { setImportReview(emptyReview()); if (filter === 'review') setFilter('all') }}>Mark reviewed</button></div>}

      {storageConflict ? <section className="recovery-panel conflict-panel" role="alert" aria-labelledby="conflict-title">
        <div className="recovery-icon"><CircleAlert size={30} /></div>
        <span className="kicker">WORKSPACE CHANGED IN ANOTHER TAB</span>
        <h2 id="conflict-title">This tab stopped saving.</h2>
        <p>{loadBlocked ? 'Another tab changed the browser workspace while this tab was recovering unreadable data. Download the original raw copy from this tab before loading the latest saved version.' : 'Another tab changed the browser workspace. The copy in this tab remains here, including edits you made before this warning. Download a backup before loading the latest saved version. You can then review or restore it as needed.'}</p>
        <div className="recovery-actions"><button className="button button-primary" onClick={downloadConflictBackup}><ArrowDownToLine size={17} /> 1. {loadBlocked ? 'Download original raw copy' : 'Back up this tab'}</button>{(loadBlocked ? rawPrepared : conflictBackupPrepared) && <button className="button button-secondary" onClick={() => (loadBlocked ? rawVerifyInput : conflictVerifyInput).current?.click()}><FileUp size={17} /> 2. Select downloaded file to verify</button>}<button className="button button-secondary" disabled={!conflictBackupDownloaded} onClick={reloadAfterConflictBackup}><ArrowRight size={17} /> 3. Load latest saved version</button></div>
        {(loadBlocked ? rawVerificationError : conflictBackupVerificationError) && <p className="form-error" role="alert">{loadBlocked ? rawVerificationError : conflictBackupVerificationError}</p>}
        {!conflictBackupDownloaded && <small>Select the file you downloaded so its exact bytes can be checked before this tab is replaced.</small>}
      </section> : loadBlocked ? <section className="recovery-panel" aria-labelledby="recovery-title">
        <div className="recovery-icon"><CircleAlert size={30} /></div>
        <span className="kicker">DATA RECOVERY</span>
        <h2 id="recovery-title">Your saved data needs attention.</h2>
        <p>{storageWarning} The workspace is paused to avoid overwriting it. First download the exact raw data stored in this browser. Then restore a valid JSON backup or explicitly discard the unreadable copy.</p>
        <div className="recovery-actions"><button className="button button-primary" onClick={downloadCorruptCopy}><ArrowDownToLine size={17} /> 1. Download raw copy</button>{rawPrepared && <button className="button button-secondary" onClick={() => rawVerifyInput.current?.click()}><FileUp size={17} /> 2. Select downloaded file to verify</button>}<button className="button button-secondary" disabled={!rawDownloaded} onClick={() => restoreInput.current?.click()}><FileUp size={17} /> 3. Restore JSON backup</button><button className="button button-danger" disabled={!rawDownloaded} onClick={() => void discardCorruptData()}>3. Discard and start over</button></div>
        {rawVerificationError && <p className="form-error" role="alert">{rawVerificationError}</p>}
        {!rawDownloaded && <small>Restore and discard unlock only after the selected raw file matches the browser copy byte for byte.</small>}
      </section> : !invoices.length ? <div className="empty-workspace">
        <div className="empty-art"><FileSpreadsheet size={34} /><span className="empty-spark s1" /><span className="empty-spark s2" /></div>
        <span className="kicker">START WITH AN AGING REPORT</span>
        <h2>Your next move starts here.</h2>
        <p>Import a CSV with customer, invoice number, due date and amount. Or use sample invoices to see how the board works.</p>
        <div className="empty-actions"><button className="button button-primary" onClick={() => csvInput.current?.click()}><FileUp size={18} /> Import CSV</button><button className="button button-secondary" onClick={() => { if (loadBlocked) return; setInvoices(makeDemo()); setDemo(true); setImportReview(emptyReview()) }}>Explore sample data</button></div>
        <div className="empty-foot"><a href={sampleCsvUrl} download="sample-ar-aging.csv">Download sample CSV <ArrowDownToLine size={15} /></a><span /> <button onClick={() => restoreInput.current?.click()}>Restore a backup <ArrowRight size={15} /></button></div>
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
        <div className="workspace-footer"><div><LockKeyhole size={15} /> {lockedMode ? 'Encrypted local copy. Lock this tab after use and back up regularly.' : 'Stored in this browser only. Back up regularly.'}</div><div><button onClick={() => restoreInput.current?.click()}>Restore backup</button><span>·</span><a href={`${contentBaseUrl}terms/`}>Use terms</a><span>·</span><a href="https://github.com/Akam1123/duekrio/issues/new?template=feedback.yml" target="_blank" rel="noreferrer">Send feedback <ArrowUpRight size={13} /></a></div></div>
      </>}
    </main>

    {selected && <InvoiceDrawer key={selected.key} invoice={selected} asOf={asOf} storageConflict={storageConflict} onClose={() => setSelectedKey(null)} onSave={updateInvoice} onDelete={deleteInvoice} onToast={setToast} />}
    {showAdd && <AddInvoiceModal onClose={() => setShowAdd(false)} onAdd={addInvoice} replacingDemo={demo} storageConflict={storageConflict} />}
    {showGuide && <GuideModal locked={lockedMode} legacyCopyPresent={legacyCopyPresent} onClose={() => setShowGuide(false)} onRestore={() => { setShowGuide(false); restoreInput.current?.click() }} />}
    {backupRequest && <BackupModal locked={lockedMode} legacyCopyPresent={legacyCopyPresent} onClose={() => setBackupRequest(null)} onPlain={downloadPlainBackup} onEncrypted={downloadEncryptedBackup} />}
    {showLockSetup && <LockSetupModal legacyCopyPresent={lastSavedRawRef.current !== null} onClose={() => setShowLockSetup(false)} onCreate={createLockedMode} />}
    {showLegacyCleanup && <LegacyCleanupModal onClose={() => setShowLegacyCleanup(false)} onDownload={downloadEncryptedLegacyBackup} onRemove={removeLegacyCopyAfterBackup} />}
    {pendingEncryptedRestore && <EncryptedRestoreModal fileName={pendingEncryptedRestore.fileName} onClose={() => setPendingEncryptedRestore(null)} onRestore={async passphrase => {
      const restored = await decryptWorkspaceJson(pendingEncryptedRestore.json, passphrase)
      applyRestoredSnapshot(restored)
      setPendingEncryptedRestore(null)
    }} />}
    {pendingImport && <ImportPreviewModal pending={pendingImport} storageConflict={storageConflict} onCancel={() => setPendingImport(null)} onConfirm={confirmImport} />}
    {toast && <div className={`toast ${toast.kind || 'good'}`} role="status"><span>{toast.kind === 'warn' ? <CircleAlert size={18} /> : <CheckCircle2 size={18} />}</span>{toast.text}<button onClick={() => setToast(null)} aria-label="Dismiss message"><X size={15} /></button></div>}
  </div>
}

function LockedWorkspaceGate({ issue, rawAvailable, rawPrepared, rawDownloaded, rawVerificationError, legacyCopyPresent, onUnlock, onDownloadRaw, onVerifyRaw, onRecoverLegacy, onRecoverBackup }: {
  issue: string
  rawAvailable: boolean
  rawPrepared: boolean
  rawDownloaded: boolean
  rawVerificationError: string
  legacyCopyPresent: boolean
  onUnlock: (passphrase: string) => Promise<void>
  onDownloadRaw: () => void
  onVerifyRaw: (file?: File) => Promise<void>
  onRecoverLegacy: (passphrase: string) => Promise<void>
  onRecoverBackup: (file: File, backupPassphrase: string, passphrase: string) => Promise<void>
}) {
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recoverySource, setRecoverySource] = useState<'legacy' | 'backup'>(legacyCopyPresent ? 'legacy' : 'backup')
  const [recoveryFile, setRecoveryFile] = useState<File | null>(null)
  const [backupPassphrase, setBackupPassphrase] = useState('')
  const [newPassphrase, setNewPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')
  const rawVerifyInput = useRef<HTMLInputElement>(null)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try { await onUnlock(passphrase) } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This encrypted workspace could not be unlocked.')
    } finally { setBusy(false) }
  }
  async function recover(event: React.FormEvent) {
    event.preventDefault()
    if (recoveryBusy || (rawAvailable && !rawDownloaded)) return
    if (Array.from(newPassphrase).length < MIN_LOCK_PASSPHRASE_LENGTH) { setRecoveryError(`Use a new passphrase of at least ${MIN_LOCK_PASSPHRASE_LENGTH} characters.`); return }
    if (newPassphrase !== confirmation) { setRecoveryError('The new passphrases do not match.'); return }
    if (recoverySource === 'backup' && !recoveryFile) { setRecoveryError('Choose a JSON backup file.'); return }
    setRecoveryBusy(true)
    setRecoveryError('')
    try {
      if (recoverySource === 'legacy') await onRecoverLegacy(newPassphrase)
      else await onRecoverBackup(recoveryFile!, backupPassphrase, newPassphrase)
    } catch (cause) {
      setRecoveryError(cause instanceof Error ? cause.message : 'Recovery failed. No saved copy was removed.')
    } finally { setRecoveryBusy(false) }
  }
  return <div className="app-shell"><header className="app-header"><div className="app-header-inner wrap"><Brand onClick={() => { window.location.hash = '/' }} /><span className="workspace-label">Encrypted local workspace</span></div></header>{legacyAddress && <aside className="legacy-migration wrap" aria-label="Duekrio's current address"><div><strong>Duekrio is now at duekrio.pages.dev.</strong><p>Unlock this older workspace, download a JSON backup, then restore and verify it at the new address. Browser data does not move automatically.</p></div><div className="legacy-migration-actions"><a href={dedicatedWorkspaceUrl} target="_blank" rel="noopener noreferrer">Open duekrio.pages.dev <ArrowUpRight size={15} /></a></div></aside>}<main className="app-main wrap"><section className="recovery-panel locked-gate" aria-labelledby="locked-title"><div className="recovery-icon"><LockKeyhole size={30} /></div><span className="kicker">LOCAL WORKSPACE LOCK</span><h1 id="locked-title">Unlock your workspace.</h1><p>Your invoices are stored as encrypted browser data. The passphrase stays in this tab and is not sent to Duekrio. This tab stays unlocked until you lock it or reload.</p>
    {issue ? <div className="notice warning" role="alert"><CircleAlert size={19} /><span>{issue} No existing browser copy was changed.</span></div> : <form onSubmit={event => void submit(event)}><div className="form-grid"><label>Workspace passphrase<input type="password" autoComplete="off" spellCheck={false} required value={passphrase} onChange={event => { setPassphrase(event.target.value); setError('') }} /></label></div>{error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}<div className="recovery-actions"><button type="submit" className="button button-primary" disabled={busy}><LockKeyhole size={17} /> {busy ? 'Unlocking and verifying…' : 'Unlock workspace'}</button></div></form>}
    <div className="locked-gate-actions">{rawAvailable && <button type="button" className="button button-secondary" onClick={onDownloadRaw}><ArrowDownToLine size={17} /> 1. Download exact encrypted raw copy</button>}{rawPrepared && <><input ref={rawVerifyInput} type="file" accept=".json,application/json" className="sr-only" aria-label="Choose downloaded encrypted raw copy for byte verification" onChange={event => { void onVerifyRaw(event.target.files?.[0]); event.target.value = '' }} /><button type="button" className="button button-secondary" onClick={() => rawVerifyInput.current?.click()}><FileUp size={17} /> 2. Select that file to verify</button></>}<button type="button" className="button button-quiet" onClick={() => window.location.reload()}>Retry reading storage</button></div>
    {rawVerificationError && <p className="form-error" role="alert">{rawVerificationError}</p>}
    {legacyCopyPresent && <p className="locked-legacy-note"><CircleAlert size={17} /> An older unencrypted browser copy is still present. The lock does not protect that older copy. It will not be changed or deleted automatically.</p>}
    <details className="locked-recovery"><summary>Recover from an older copy or JSON backup</summary><p>Recovery replaces the encrypted browser copy only after the source has been validated and the new encrypted write has been verified. Download the exact raw copy above and select the saved file to verify its bytes before replacement.</p><form onSubmit={event => void recover(event)}><div className="form-grid"><label>Recovery source<select value={recoverySource} onChange={event => { setRecoverySource(event.target.value as 'legacy' | 'backup'); setRecoveryError('') }}>{legacyCopyPresent && <option value="legacy">Older unencrypted browser copy</option>}<option value="backup">JSON backup file</option></select></label>{recoverySource === 'backup' && <><label>JSON backup file<input type="file" accept=".json,application/json" onChange={event => setRecoveryFile(event.target.files?.[0] ?? null)} /></label><label>Backup passphrase, if the file is encrypted<input type="password" autoComplete="off" value={backupPassphrase} onChange={event => setBackupPassphrase(event.target.value)} /></label></>}<label>New workspace passphrase<input type="password" autoComplete="new-password" required minLength={MIN_LOCK_PASSPHRASE_LENGTH} value={newPassphrase} onChange={event => setNewPassphrase(event.target.value)} /></label><label>Confirm new passphrase<input type="password" autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label></div>{recoveryError && <p className="form-error" role="alert"><CircleAlert size={16} /> {recoveryError}</p>}<button type="submit" className="button button-secondary" disabled={recoveryBusy || (rawAvailable && !rawDownloaded)}>{recoveryBusy ? 'Checking and restoring…' : 'Restore encrypted workspace'}</button>{rawAvailable && !rawDownloaded && <small>Recovery unlocks after the selected raw file matches the current browser copy byte for byte.</small>}</form></details>
    <small>If you lose the passphrase, Duekrio cannot recover this encrypted copy. Keep an encrypted JSON backup in a safe place.</small>
  </section></main></div>
}

function LockSetupModal({ legacyCopyPresent, onClose, onCreate }: {
  legacyCopyPresent: boolean
  onClose: () => void
  onCreate: (passphrase: string) => Promise<void>
}) {
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useDialogFocus<HTMLFormElement>(() => { if (!busy) onClose() })
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (Array.from(passphrase).length < MIN_LOCK_PASSPHRASE_LENGTH) { setError(`Use a unique passphrase of at least ${MIN_LOCK_PASSPHRASE_LENGTH} characters.`); return }
    if (passphrase !== confirmation) { setError('The passphrases do not match.'); return }
    setBusy(true)
    setError('')
    try { await onCreate(passphrase) } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The encrypted workspace could not be created. Your old browser copy remains available.')
      setBusy(false)
    }
  }
  return <div className="modal-backdrop modal-centered" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}><form ref={dialogRef} className="dialog backup-dialog" role="dialog" aria-modal="true" aria-labelledby="lock-setup-title" onSubmit={event => void submit(event)}><div className="dialog-head"><div><span className="drawer-kicker">OPTIONAL LOCAL ENCRYPTION</span><h2 id="lock-setup-title">Encrypt this workspace</h2><p>Use a passphrase to protect future browser saves on this device.</p></div><button type="button" className="icon-button" disabled={busy} onClick={onClose} aria-label="Close encryption setup"><X size={20} /></button></div>
    <p className="field-hint">The encrypted copy is verified before this tab switches to it. Your passphrase stays in memory only while the tab is unlocked. Duekrio cannot reset it; keep a separate encrypted backup.</p>
    {legacyCopyPresent && <p className="preview-data-caution"><CircleAlert size={17} /><span>Your existing unencrypted browser copy will remain untouched. Until you separately remove that older copy after verifying a backup, this device still has readable invoice data.</span></p>}
    <div className="form-grid"><label>New workspace passphrase<input type="password" autoComplete="new-password" spellCheck={false} required minLength={MIN_LOCK_PASSPHRASE_LENGTH} value={passphrase} onChange={event => { setPassphrase(event.target.value); setError('') }} /></label><label>Confirm passphrase<input type="password" autoComplete="new-password" spellCheck={false} required value={confirmation} onChange={event => { setConfirmation(event.target.value); setError('') }} /></label></div>
    {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}
    <div className="dialog-actions"><button type="button" className="button button-quiet" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}><LockKeyhole size={17} /> {busy ? 'Encrypting and verifying…' : 'Create encrypted workspace'}</button></div>
  </form></div>
}

function LegacyCleanupModal({ onClose, onDownload, onRemove }: {
  onClose: () => void
  onDownload: (passphrase: string) => Promise<void>
  onRemove: (file: File, passphrase: string) => Promise<boolean>
}) {
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [downloaded, setDownloaded] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useDialogFocus<HTMLDivElement>(() => { if (!busy) onClose() })
  async function download() {
    if (Array.from(passphrase).length < MIN_BACKUP_PASSPHRASE_LENGTH) { setError(`Use a unique backup passphrase of at least ${MIN_BACKUP_PASSPHRASE_LENGTH} characters.`); return }
    if (passphrase !== confirmation) { setError('The backup passphrases do not match.'); return }
    setBusy(true)
    setError('')
    try { await onDownload(passphrase); setDownloaded(true) } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The encrypted backup could not be created.')
    } finally { setBusy(false) }
  }
  async function verifyAndRemove() {
    if (!downloaded || !file || busy) return
    setBusy(true)
    setError('')
    try { await onRemove(file, passphrase) } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The older copy could not be removed. Nothing else was changed.')
    } finally { setBusy(false) }
  }
  return <div className="modal-backdrop modal-centered" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}><div ref={dialogRef} className="dialog backup-dialog legacy-cleanup-dialog" role="dialog" aria-modal="true" aria-labelledby="cleanup-title"><div className="dialog-head"><div><span className="drawer-kicker">PROTECT THE OLDER COPY</span><h2 id="cleanup-title">Remove readable browser data</h2><p>The current encrypted workspace stays in place.</p></div><button type="button" className="icon-button" disabled={busy} onClick={onClose} aria-label="Close old copy cleanup"><X size={20} /></button></div>
    <p className="field-hint">First download a passphrase-encrypted backup of the older copy. Then select that file again. Duekrio decrypts and compares it with the exact older copy before offering to remove only the readable browser entry.</p>
    <div className="form-grid"><label>Backup passphrase<input type="password" autoComplete="new-password" spellCheck={false} value={passphrase} onChange={event => { setPassphrase(event.target.value); setError('') }} /></label><label>Confirm backup passphrase<input type="password" autoComplete="new-password" spellCheck={false} value={confirmation} onChange={event => { setConfirmation(event.target.value); setError('') }} /></label></div>
    <button type="button" className="button button-secondary" disabled={busy} onClick={() => void download()}><ArrowDownToLine size={17} /> 1. Download encrypted backup</button>
    {downloaded && <div className="form-grid cleanup-verify"><label>Choose that downloaded encrypted JSON file<input type="file" accept=".json,application/json" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label><p className="field-hint">The old copy will be removed only after the selected file decrypts to the matching data and the current encrypted workspace is verified again. Close any other tabs using this site before this step.</p></div>}
    {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}
    <div className="dialog-actions"><button type="button" className="button button-quiet" disabled={busy} onClick={onClose}>Keep older copy</button><button type="button" className="button button-primary" disabled={!downloaded || !file || busy} onClick={() => void verifyAndRemove()}>{busy ? 'Checking copies…' : '2. Verify backup and remove old copy'}</button></div>
  </div></div>
}

function InvoiceDrawer({ invoice, asOf, storageConflict, onClose, onSave, onDelete, onToast }: { invoice: Invoice; asOf: string; storageConflict: boolean; onClose: () => void; onSave: (invoice: Invoice) => void; onDelete: (invoice: Invoice) => boolean; onToast: (toast: Toast) => void }) {
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
        {storageConflict && <div className="notice warning" role="alert"><CircleAlert size={18} /><span>Another tab changed this workspace. Keep this draft in this tab, then download the tab backup shown behind this panel. It will not save to browser storage.</span></div>}
        <div className="invoice-summary"><div><small>Amount due</small><strong>{dollars(draft.amount)}</strong></div><div><small>Due date</small><strong>{dateLabel(draft.dueDate)}</strong></div><div><small>Age</small><strong className={info.isOverdue ? 'red-ink' : ''}>{info.isOverdue ? `${info.daysOverdue} days late` : 'On time'}</strong></div></div>
        <div className="drawer-section"><div className="section-label"><span>01</span> RESOLUTION STATUS</div><div className="form-grid two"><label>Status<select value={draft.annotation.status} onChange={event => setAnnotation('status', event.target.value as InvoiceAnnotation['status'])}>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>What is holding payment?<select value={draft.annotation.blocker} onChange={event => setAnnotation('blocker', event.target.value as InvoiceAnnotation['blocker'])}>{Object.entries(blockerLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div></div>
        <div className="drawer-section"><div className="section-label"><span>02</span> NEXT MOVE</div><div className="form-grid"><label>Next action<input value={draft.annotation.nextAction || ''} onChange={event => setAnnotation('nextAction', event.target.value)} placeholder="e.g. Ask AP for the purchase order" /></label><div className="form-grid two"><label>Owner<input value={draft.annotation.owner || ''} onChange={event => setAnnotation('owner', event.target.value)} placeholder="Name or team" /></label><label>Action due<input type="date" value={draft.annotation.nextActionDate || ''} onChange={event => setAnnotation('nextActionDate', event.target.value)} /></label></div></div></div>
        <div className="drawer-section"><div className="section-label"><span>03</span> PAYMENT COMMITMENT</div><div className="form-grid two"><label>Promised payment date<input type="date" value={draft.annotation.promiseDate || ''} onChange={event => setAnnotation('promiseDate', event.target.value)} /></label><label>Last contact<input type="date" value={draft.annotation.lastContactDate || ''} onChange={event => setAnnotation('lastContactDate', event.target.value)} /></label></div><p className="field-hint">A promised date is a customer statement, not a guaranteed payment.</p></div>
        <div className="drawer-section"><div className="section-label"><span>04</span> CONTEXT</div><div className="form-grid"><label>Client email<input type="email" value={draft.email || ''} onChange={event => setDraft(current => ({ ...current, email: event.target.value }))} placeholder="accounts@client.com" /></label><label>Notes<textarea rows={4} value={draft.annotation.notes || ''} onChange={event => setAnnotation('notes', event.target.value)} placeholder="What did the client say? What is needed to resolve this?" /></label></div></div>
        {draft.annotation.status === 'paid' ? <div className="paid-panel"><CheckCircle2 size={18} /><span>Marked paid in this workspace. Confirm receipt in your accounting ledger. Follow-up drafting is disabled.</span></div> : <div className="draft-panel"><div className="draft-heading"><div><Mail size={18} /><strong>Review-before-sending draft</strong></div><button onClick={() => setEmailOpen(!emailOpen)}>{emailOpen ? 'Hide draft' : 'Write draft'} <ArrowRight size={15} /></button></div>{emailOpen && <div className="email-draft"><label>Subject<input readOnly value={email.subject} /></label><label>Message<textarea readOnly rows={9} value={email.body} /></label><div className="draft-actions"><button className="button button-secondary" onClick={() => void copyDraft()}><Copy size={16} /> Copy draft</button>{email.recipient && <a className="button button-quiet" href={`mailto:${encodeURIComponent(email.recipient)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}>Open email app <ArrowUpRight size={16} /></a>}</div><small>Review the facts, tone, recipient, and invoice record before sending. Nothing is sent automatically.</small></div>}</div>}
      </div>
      <div className="drawer-bottom"><button className="button button-danger" disabled={storageConflict} onClick={() => onDelete(draft)}>Delete invoice</button><span className="drawer-bottom-spacer" /><button className="button button-quiet" onClick={requestClose}>Cancel</button><button className="button button-primary" onClick={() => { onSave(draft); onClose() }}><Check size={18} /> {storageConflict ? 'Keep for backup' : 'Save changes'}</button></div>
    </div>
  </div>
}

function ImportPreviewModal({ pending, storageConflict, onCancel, onConfirm }: { pending: PendingImport; storageConflict: boolean; onCancel: () => void; onConfirm: () => void }) {
  const [reviewedIssues, setReviewedIssues] = useState(false)
  const dialogRef = useDialogFocus<HTMLDivElement>(onCancel)
  const { result, review } = pending
  const retained = result.invoices.length - result.added - result.updated
  const hasValidRows = result.added + result.updated > 0
  const reviewKeys = new Set([...review.missingKeys, ...review.paidSeenKeys])
  const reviewInvoices = result.invoices.filter(invoice => reviewKeys.has(invoice.key))
  return <div className="modal-backdrop modal-centered" onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}>
    <div ref={dialogRef} className="dialog import-preview" role="dialog" aria-modal="true" aria-labelledby="import-preview-title" aria-describedby="import-preview-description">
      <div className="dialog-head"><div><span className="drawer-kicker">IMPORT PREVIEW</span><h2 id="import-preview-title">Check this CSV first</h2><p id="import-preview-description" className="import-filename">{pending.fileName}</p></div><button type="button" className="icon-button" onClick={onCancel} aria-label="Cancel import"><X size={20} /></button></div>
      <p className="import-intro">Nothing has changed yet. {hasValidRows ? pending.replacingDemo ? 'This import will replace the sample workspace and any sample edits.' : 'Matched invoices will receive the CSV balance, dates and email. Your notes stay attached, and invoices absent from this CSV are kept.' : 'No valid invoices were found. Check the issues below and choose another CSV.'}</p>
      <LegacyDataCaution />
      {storageConflict && <p className="preview-data-caution" role="alert"><CircleAlert size={16} /> Another tab changed the workspace. Cancel this import, back up this tab, and load the latest saved version.</p>}
      <div className="import-stats" aria-label="Import counts"><div><strong>{result.added}</strong><span>new</span></div><div><strong>{result.updated}</strong><span>updated</span></div><div className={result.skipped ? 'import-stat-alert' : ''}><strong>{result.skipped}</strong><span>skipped</span></div><div><strong>{retained}</strong><span>kept</span></div></div>
      {result.issues.length > 0 && <section className="import-issues" aria-labelledby="import-issues-title"><h3 id="import-issues-title"><CircleAlert size={17} /> {result.issues.length} CSV {result.issues.length === 1 ? 'issue' : 'issues'}</h3><p>Rows with missing or invalid required values and duplicate invoices will be skipped. Other warnings may mean optional information was not imported. Check every item before continuing.</p><ul>{result.issues.map((issue, index) => <li key={`${issue.row}-${index}`}><strong>Line {issue.row}</strong><span>{issue.message}</span></li>)}</ul><label className="import-ack"><input type="checkbox" checked={reviewedIssues} onChange={event => setReviewedIssues(event.target.checked)} /> I reviewed the CSV issues and accept importing the valid rows only.</label></section>}
      {reviewInvoices.length > 0 && <section className="import-reconcile" aria-labelledby="import-reconcile-title"><h3 id="import-reconcile-title"><CircleAlert size={17} /> {reviewInvoices.length} invoices need reconciliation</h3><p>These invoices remain in your workspace and will be flagged for review. Confirm their status in your accounting ledger.</p><ul>{reviewInvoices.map(invoice => <li key={invoice.key}>{invoice.customer} · {invoice.invoiceNumber} — {review.missingKeys.includes(invoice.key) ? 'absent from this CSV' : 'marked paid here but present in this CSV'}</li>)}</ul></section>}
      <div className="dialog-actions"><button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button><button type="button" className="button button-primary" disabled={storageConflict || !hasValidRows || (result.issues.length > 0 && !reviewedIssues)} onClick={onConfirm}><Check size={17} /> Confirm import</button></div>
    </div>
  </div>
}

function AddInvoiceModal({ onClose, onAdd, replacingDemo, storageConflict }: { onClose: () => void; onAdd: (details: { customer: string; invoiceNumber: string; amount: string; dueDate: string; issueDate: string; email: string }) => string | null; replacingDemo: boolean; storageConflict: boolean }) {
  const [form, setForm] = useState({ customer: '', invoiceNumber: '', amount: '', dueDate: '', issueDate: '', email: '' })
  const [error, setError] = useState('')
  const requestClose = () => { if (Object.values(form).some(Boolean) && !window.confirm('Discard your unsaved invoice?')) return; onClose() }
  const dialogRef = useDialogFocus<HTMLFormElement>(requestClose)
  const set = (key: keyof typeof form, value: string) => { setForm(current => ({ ...current, [key]: value })); setError('') }
  return <div className="modal-backdrop modal-centered" onMouseDown={event => { if (event.target === event.currentTarget) requestClose() }}><form ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="add-title" onSubmit={event => { event.preventDefault(); const issue = onAdd(form); if (issue) setError(issue); else onClose() }}><div className="dialog-head"><div><span className="drawer-kicker">MANUAL ENTRY</span><h2 id="add-title">Add an invoice</h2><p>{replacingDemo ? 'Adding your own invoice will replace the sample workspace.' : 'Track an open invoice without importing a CSV.'}</p></div><button type="button" className="icon-button" onClick={requestClose} aria-label="Close"><X size={20} /></button></div><LegacyDataCaution />{storageConflict && <p className="preview-data-caution" role="alert"><CircleAlert size={16} /> Another tab changed the workspace. Keep this form in this tab, then download the tab backup. It will not save to browser storage.</p>}<div className="form-grid"><label>Customer name <span className="required">*</span><input required value={form.customer} onChange={event => set('customer', event.target.value)} placeholder="Northstar Studio" /></label><div className="form-grid two"><label>Invoice number <span className="required">*</span><input required value={form.invoiceNumber} onChange={event => set('invoiceNumber', event.target.value)} placeholder="INV-1042" /></label><label>Remaining amount due (USD) <span className="required">*</span><input required type="number" min="0.01" step="0.01" value={form.amount} onChange={event => set('amount', event.target.value)} placeholder="4800.00" /></label></div><div className="form-grid two"><label>Invoice date<input type="date" value={form.issueDate} onChange={event => set('issueDate', event.target.value)} /></label><label>Due date <span className="required">*</span><input required type="date" value={form.dueDate} onChange={event => set('dueDate', event.target.value)} /></label></div><label>Client email<input type="email" value={form.email} onChange={event => set('email', event.target.value)} placeholder="ap@client.com" /></label></div>{error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}<div className="dialog-actions"><button type="button" className="button button-quiet" onClick={requestClose}>Cancel</button><button type="submit" className="button button-primary"><Plus size={17} /> {storageConflict ? 'Keep for backup' : 'Add invoice'}</button></div></form></div>
}

function GuideModal({ locked, legacyCopyPresent, onClose, onRestore }: { locked: boolean; legacyCopyPresent: boolean; onClose: () => void; onRestore: () => void }) {
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose)
  return <div className="modal-backdrop modal-centered" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><div ref={dialogRef} className="dialog guide" role="dialog" aria-modal="true" aria-labelledby="guide-title"><div className="dialog-head"><div><span className="drawer-kicker">QUICK GUIDE</span><h2 id="guide-title">Working with Duekrio</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></div><div className="guide-content"><section><span>01</span><div><h3>Get invoices in</h3><p>Export an open invoices or aging CSV from your ledger. Include customer, invoice number, due date and remaining amount due. If both Amount and Balance appear, Balance is preferred. Email and invoice date are optional. Import the same file again later to refresh amounts and dates; your resolution notes stay attached. Review items absent from a new snapshot and those marked paid locally that still appear.</p></div></section><section><span>02</span><div><h3>Work one blocker at a time</h3><p>Open an invoice to record the reason it is stuck, a next action, its owner and due date, plus any customer payment promise. Set status to Paid only when your ledger confirms receipt.</p></div></section><section><span>03</span><div><h3>Keep your own copy</h3><p>{locked ? `Current browser saves are encrypted with your workspace passphrase.${legacyCopyPresent ? ' An older readable copy remains until you back it up, verify it and remove it explicitly.' : ''} The tab stays unlocked until you lock it or reload.` : 'Browser storage is readable until you enable workspace encryption.'} There is no login or team sync. Use encrypted JSON backups and keep the passphrase separately; Duekrio cannot recover it. Plain JSON and CSV exports remain readable. Do not include bank credentials or sensitive document contents in notes.</p></div></section></div><div className="guide-actions"><a href={sampleCsvUrl} download="sample-ar-aging.csv">Sample CSV <ArrowDownToLine size={16} /></a><button onClick={onRestore}>Restore JSON backup <ArrowRight size={16} /></button></div></div></div>
}

function BackupModal({ locked, legacyCopyPresent, onClose, onPlain, onEncrypted }: { locked: boolean; legacyCopyPresent: boolean; onClose: () => void; onPlain: () => void; onEncrypted: (passphrase: string) => Promise<void> }) {
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useDialogFocus<HTMLDivElement>(() => { if (!busy) onClose() })
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (Array.from(passphrase).length < MIN_BACKUP_PASSPHRASE_LENGTH) { setError(`Use at least ${MIN_BACKUP_PASSPHRASE_LENGTH} characters in a unique passphrase.`); return }
    if (passphrase !== confirmation) { setError('The passphrases do not match.'); return }
    setBusy(true)
    setError('')
    try { await onEncrypted(passphrase) } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Encrypted backup could not be created.')
      setBusy(false)
    }
  }
  return <div className="modal-backdrop modal-centered" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div ref={dialogRef} className="dialog backup-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-title"><form onSubmit={event => void submit(event)}>
      <div className="dialog-head"><div><span className="drawer-kicker">BACK UP YOUR WORK</span><h2 id="backup-title">Choose a JSON backup</h2><p>Encrypted is safer for a file you will store or move.</p></div><button type="button" className="icon-button" disabled={busy} onClick={onClose} aria-label="Close backup options"><X size={20} /></button></div>
      <p className="field-hint">{locked ? `Current browser saves are encrypted.${legacyCopyPresent ? ' An older readable browser copy remains until you remove it.' : ''}` : 'This browser workspace is readable.'} Plain JSON and CSV exports are readable. Only the downloaded encrypted backup file is protected by its backup passphrase.</p>
      <div className="form-grid"><label>Backup passphrase<input type="password" autoComplete="off" spellCheck={false} value={passphrase} onChange={event => { setPassphrase(event.target.value); setError('') }} minLength={MIN_BACKUP_PASSPHRASE_LENGTH} placeholder="At least 16 characters" /></label><label>Repeat passphrase<input type="password" autoComplete="off" spellCheck={false} value={confirmation} onChange={event => { setConfirmation(event.target.value); setError('') }} placeholder="Enter the same passphrase" /></label></div>
      <p className="field-hint">Use a long, unique passphrase and keep it separately. Duekrio cannot recover the file if you lose it. The passphrase is not sent or saved by Duekrio.</p>
      {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}
      <div className="dialog-actions"><button type="button" className="button button-quiet" disabled={busy} onClick={onPlain}>Download readable JSON</button><button type="submit" className="button button-primary" disabled={busy}><LockKeyhole size={17} /> {busy ? 'Encrypting…' : 'Download encrypted JSON'}</button></div>
    </form></div>
  </div>
}

function EncryptedRestoreModal({ fileName, onClose, onRestore }: { fileName: string; onClose: () => void; onRestore: (passphrase: string) => Promise<void> }) {
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useDialogFocus<HTMLDivElement>(() => { if (!busy) onClose() })
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try { await onRestore(passphrase) } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Encrypted backup could not be restored.')
      setBusy(false)
    }
  }
  return <div className="modal-backdrop modal-centered" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div ref={dialogRef} className="dialog backup-dialog" role="dialog" aria-modal="true" aria-labelledby="encrypted-restore-title"><form onSubmit={event => void submit(event)}>
      <div className="dialog-head"><div><span className="drawer-kicker">ENCRYPTED BACKUP</span><h2 id="encrypted-restore-title">Unlock your backup</h2><p className="import-filename">{fileName}</p></div><button type="button" className="icon-button" disabled={busy} onClick={onClose} aria-label="Close encrypted restore"><X size={20} /></button></div>
      <p className="field-hint">Enter the passphrase used when this file was created. Nothing in your workspace changes unless decryption and backup validation succeed and you confirm replacement.</p>
      <div className="form-grid"><label>Backup passphrase<input type="password" autoComplete="off" spellCheck={false} required value={passphrase} onChange={event => { setPassphrase(event.target.value); setError('') }} /></label></div>
      {error && <p className="form-error" role="alert"><CircleAlert size={16} /> {error}</p>}
      <div className="dialog-actions"><button type="button" className="button button-quiet" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}><FileUp size={17} /> {busy ? 'Unlocking…' : 'Unlock and review restore'}</button></div>
    </form></div>
  </div>
}

export default App
