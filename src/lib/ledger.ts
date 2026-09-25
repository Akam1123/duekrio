import type {
  BlockerCategory,
  CsvImportResult,
  DerivedInvoice,
  ImportIssue,
  Invoice,
  InvoiceAnnotation,
  LedgerSummary,
  PriorityBand,
  ResolutionStatus,
} from './types'

export type {
  BlockerCategory,
  CsvImportResult,
  DerivedInvoice,
  ImportIssue,
  Invoice,
  InvoiceAnnotation,
  LedgerSummary,
  PriorityBand,
  ResolutionStatus,
} from './types'

const DAY_MS = 86_400_000
const statuses: readonly ResolutionStatus[] = ['open', 'in_progress', 'resolved', 'paid']
const blockers: readonly BlockerCategory[] = [
  'none',
  'awaiting_approval',
  'missing_documentation',
  'dispute',
  'cash_flow',
  'unreachable',
  'other',
]

const headerAliases = {
  customer: ['customer', 'customer name', 'client', 'client name', 'company', 'company name', 'bill to'],
  invoiceNumber: ['invoice number', 'invoice #', 'invoice no', 'invoice id', 'invoice', 'number'],
  amount: ['open balance', 'balance due', 'amount due', 'outstanding amount', 'outstanding', 'balance', 'total due', 'amount'],
  dueDate: ['due date', 'due', 'payment due'],
  issueDate: ['issue date', 'invoice date', 'date issued', 'date'],
  email: ['email', 'customer email', 'client email', 'contact email'],
  status: ['status', 'resolution status'],
  blocker: ['blocker', 'blocker category'],
  owner: ['owner', 'assigned to'],
  nextAction: ['next action', 'action'],
  nextActionDate: ['next action date', 'action date'],
  promiseDate: ['promise date', 'promise to pay date', 'promised payment date'],
  notes: ['notes', 'note'],
  lastContactDate: ['last contact date', 'last contacted'],
} as const

type HeaderName = keyof typeof headerAliases
interface CsvRecord { fields: string[]; row: number }

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeIdentity(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

export function invoiceKey(customer: string, invoiceNumber: string): string {
  return JSON.stringify([normalizeIdentity(customer), normalizeIdentity(invoiceNumber)])
}

/** Parses RFC-style quoted CSV fields, including commas, escaped quotes and embedded newlines. */
function readCsv(csv: string): CsvRecord[] {
  const input = csv.replace(/^\uFEFF/, '')
  const records: CsvRecord[] = []
  let fields: string[] = []
  let field = ''
  let quoted = false
  let row = 1
  let recordRow = 1

  const finishRecord = () => {
    fields.push(field)
    if (fields.some((cell) => cell.trim() !== '')) records.push({ fields, row: recordRow })
    fields = []
    field = ''
  }

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (quoted) {
        quoted = false
      } else if (field === '') {
        quoted = true
      } else {
        throw new Error(`Unexpected quote on line ${row}`)
      }
    } else if (char === ',' && !quoted) {
      fields.push(field)
      field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      finishRecord()
      if (char === '\r' && input[i + 1] === '\n') i += 1
      row += 1
      recordRow = row
    } else if (char === '\n' || char === '\r') {
      field += '\n'
      if (char === '\r' && input[i + 1] === '\n') i += 1
      row += 1
    } else {
      field += char
    }
  }
  if (quoted) throw new Error(`Unterminated quoted field starting on line ${recordRow}`)
  if (field !== '' || fields.length > 0) finishRecord()
  return records
}

function dateParts(year: number, month: number, day: number): string | undefined {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

/** Accepts ISO dates and unambiguous US month/day/year dates; returns ISO. */
export function normalizeDate(value: string): string | undefined {
  const text = value.trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
  if (iso) return dateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)
  if (us) return dateParts(Number(us[3]), Number(us[1]), Number(us[2]))
  return undefined
}

function parseAmount(value: string): number | undefined {
  const text = value.trim().replace(/^\$/, '').trim()
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return undefined
  const amount = Number(text.replace(/,/g, ''))
  if (!Number.isFinite(amount) || amount * 100 > Number.MAX_SAFE_INTEGER) return undefined
  return Math.round(amount * 100) / 100
}

function headerPositions(fields: string[]): Partial<Record<HeaderName, number>> {
  const headers = fields.map(normalizeHeader)
  const positions: Partial<Record<HeaderName, number>> = {}
  for (const name of Object.keys(headerAliases) as HeaderName[]) {
    const aliases: readonly string[] = headerAliases[name]
    // An export may include both original invoice Amount and remaining Balance.
    // For AR, the latter is the collectible amount even when Amount appears first.
    const index = name === 'amount'
      ? (aliases.map((alias) => headers.indexOf(alias)).find((position) => position >= 0) ?? -1)
      : headers.findIndex((header) => aliases.includes(header))
    if (index >= 0) positions[name] = index
  }
  return positions
}

function getCell(record: CsvRecord, positions: Partial<Record<HeaderName, number>>, name: HeaderName): string {
  const index = positions[name]
  if (index === undefined) return ''
  const text = (record.fields[index] ?? '').trim()
  // Undo the spreadsheet formula guard added by exportInvoicesCsv.
  return /^'[\s]*[=+\-@]/.test(text) ? text.slice(1) : text
}

function optionalDate(
  record: CsvRecord,
  positions: Partial<Record<HeaderName, number>>,
  name: 'issueDate' | 'nextActionDate' | 'promiseDate' | 'lastContactDate',
  issues: ImportIssue[],
): string | undefined {
  const raw = getCell(record, positions, name)
  if (!raw) return undefined
  const date = normalizeDate(raw)
  if (!date) issues.push({ row: record.row, message: `Invalid ${name}: ${raw}` })
  return date
}

function csvAnnotation(record: CsvRecord, positions: Partial<Record<HeaderName, number>>, issues: ImportIssue[]): InvoiceAnnotation {
  const rawStatus = getCell(record, positions, 'status') as ResolutionStatus
  const rawBlocker = getCell(record, positions, 'blocker') as BlockerCategory
  if (rawStatus && !statuses.includes(rawStatus)) issues.push({ row: record.row, message: `Unknown status: ${rawStatus}` })
  if (rawBlocker && !blockers.includes(rawBlocker)) issues.push({ row: record.row, message: `Unknown blocker: ${rawBlocker}` })

  const annotation: InvoiceAnnotation = {
    status: statuses.includes(rawStatus) ? rawStatus : 'open',
    blocker: blockers.includes(rawBlocker) ? rawBlocker : 'none',
  }
  for (const name of ['owner', 'nextAction', 'notes'] as const) {
    const value = getCell(record, positions, name)
    if (value) annotation[name] = value
  }
  for (const name of ['nextActionDate', 'promiseDate', 'lastContactDate'] as const) {
    const date = optionalDate(record, positions, name, issues)
    if (date) annotation[name] = date
  }
  return annotation
}

/**
 * Imports a source CSV into an existing portfolio. Source fields update on reimport;
 * user annotations and invoices missing from the new file are retained.
 */
export function parseInvoiceCsv(csv: string, existing: Invoice[] = []): CsvImportResult {
  const result: CsvImportResult = { invoices: [...existing], added: 0, updated: 0, skipped: 0, issues: [] }
  let records: CsvRecord[]
  try {
    records = readCsv(csv)
  } catch (error) {
    result.issues.push({ row: 1, message: error instanceof Error ? error.message : 'Invalid CSV' })
    return result
  }
  if (records.length === 0) {
    result.issues.push({ row: 1, message: 'CSV is empty' })
    return result
  }

  const positions = headerPositions(records[0]!.fields)
  const required = ['customer', 'invoiceNumber', 'amount', 'dueDate'] as const
  const missing = required.filter((name) => positions[name] === undefined)
  if (missing.length > 0) {
    result.issues.push({ row: records[0]!.row, message: `Missing required columns: ${missing.join(', ')}` })
    return result
  }

  const indices = new Map(existing.map((invoice, index) => [invoice.key, index]))
  const incoming = new Set<string>()
  for (const record of records.slice(1)) {
    const customer = getCell(record, positions, 'customer')
    const invoiceNumber = getCell(record, positions, 'invoiceNumber')
    const amount = parseAmount(getCell(record, positions, 'amount'))
    const dueDate = normalizeDate(getCell(record, positions, 'dueDate'))
    if (!customer || !invoiceNumber || amount === undefined || !dueDate) {
      const reasons = [
        !customer && 'customer',
        !invoiceNumber && 'invoiceNumber',
        amount === undefined && 'amount (non-negative USD with up to two decimals)',
        !dueDate && 'dueDate (YYYY-MM-DD or M/D/YYYY)',
      ].filter(Boolean)
      result.issues.push({ row: record.row, message: `Invalid or missing ${reasons.join(', ')}` })
      result.skipped += 1
      continue
    }
    const key = invoiceKey(customer, invoiceNumber)
    if (incoming.has(key)) {
      result.issues.push({ row: record.row, message: `Duplicate invoice in CSV: ${customer} / ${invoiceNumber}` })
      result.skipped += 1
      continue
    }
    incoming.add(key)
    const priorIndex = indices.get(key)
    const issueDate = optionalDate(record, positions, 'issueDate', result.issues)
    const email = getCell(record, positions, 'email') || undefined
    const invoice: Invoice = {
      key,
      customer,
      invoiceNumber,
      amount,
      dueDate,
      ...(issueDate ? { issueDate } : {}),
      ...(email ? { email } : {}),
      annotation: priorIndex === undefined
        ? csvAnnotation(record, positions, result.issues)
        : priorAnnotation(existing[priorIndex]!.annotation),
    }
    if (priorIndex === undefined) {
      indices.set(key, result.invoices.length)
      result.invoices.push(invoice)
      result.added += 1
    } else {
      result.invoices[priorIndex] = invoice
      result.updated += 1
    }
  }
  return result
}

function priorAnnotation(annotation: InvoiceAnnotation): InvoiceAnnotation {
  return { ...annotation }
}

function dayNumber(isoDate: string): number {
  const normalized = normalizeDate(isoDate)
  if (!normalized) throw new Error(`Invalid date: ${isoDate}`)
  const [year, month, day] = normalized.split('-').map(Number) as [number, number, number]
  return Date.UTC(year, month - 1, day) / DAY_MS
}

function terminal(status: ResolutionStatus): boolean {
  return status === 'paid'
}

/** A transparent, heuristic work-queue score; it is not a payment prediction. */
export function deriveInvoice(invoice: Invoice, asOf: string): DerivedInvoice {
  const today = dayNumber(asOf)
  const due = dayNumber(invoice.dueDate)
  const active = !terminal(invoice.annotation.status)
  const daysOverdue = active ? Math.max(0, today - due) : 0
  const daysUntilDue = active ? Math.max(0, due - today) : 0
  const isOverdue = daysOverdue > 0
  const isBlocked = active && invoice.annotation.status !== 'resolved' && invoice.annotation.blocker !== 'none'
  const isPromiseBroken = active && !!invoice.annotation.promiseDate && dayNumber(invoice.annotation.promiseDate) < today
  const isActionLate = active && !!invoice.annotation.nextActionDate && dayNumber(invoice.annotation.nextActionDate) < today

  let priorityScore = 0
  if (active) {
    priorityScore += daysOverdue >= 61 ? 55 : daysOverdue >= 31 ? 45 : daysOverdue >= 15 ? 35 : daysOverdue >= 1 ? 25 : daysUntilDue <= 3 ? 15 : daysUntilDue <= 7 ? 8 : 0
    priorityScore += invoice.amount >= 25_000 ? 20 : invoice.amount >= 10_000 ? 15 : invoice.amount >= 2_500 ? 10 : invoice.amount >= 500 ? 5 : 0
    if (isPromiseBroken) priorityScore += 25
    if (isActionLate) priorityScore += 15
    if (isBlocked) priorityScore += 5
    priorityScore = Math.min(priorityScore, 100)
  }
  const priorityBand: PriorityBand = !active ? 'none' : priorityScore >= 80 ? 'urgent' : priorityScore >= 55 ? 'high' : priorityScore >= 30 ? 'medium' : 'low'

  return {
    ...invoice,
    annotation: { ...invoice.annotation },
    daysOverdue,
    daysUntilDue,
    isOverdue,
    isBlocked,
    isPromiseBroken: Boolean(isPromiseBroken),
    isActionLate: Boolean(isActionLate),
    priorityScore,
    priorityBand,
  }
}

export function prioritizeInvoices(invoices: Invoice[], asOf: string): DerivedInvoice[] {
  return invoices.map((invoice) => deriveInvoice(invoice, asOf)).sort((a, b) =>
    Number(terminal(a.annotation.status)) - Number(terminal(b.annotation.status)) ||
    b.priorityScore - a.priorityScore ||
    b.daysOverdue - a.daysOverdue ||
    b.amount - a.amount ||
    a.customer.localeCompare(b.customer) ||
    a.invoiceNumber.localeCompare(b.invoiceNumber),
  )
}

export function summarizeLedger(invoices: Invoice[], asOf: string): LedgerSummary {
  const rows = invoices.map((invoice) => deriveInvoice(invoice, asOf))
  const active = rows.filter((invoice) => !terminal(invoice.annotation.status))
  const overdue = active.filter((invoice) => invoice.isOverdue)
  const cents = (items: DerivedInvoice[]) => items.reduce((sum, invoice) => sum + Math.round(invoice.amount * 100), 0) / 100
  return {
    invoiceCount: rows.length,
    activeCount: active.length,
    outstandingAmount: cents(active),
    overdueCount: overdue.length,
    overdueAmount: cents(overdue),
    brokenPromiseCount: active.filter((invoice) => invoice.isPromiseBroken).length,
    actionsOverdueCount: active.filter((invoice) => invoice.isActionLate).length,
    blockedCount: active.filter((invoice) => invoice.isBlocked).length,
    highPriorityCount: active.filter((invoice) => invoice.priorityBand === 'high' || invoice.priorityBand === 'urgent').length,
  }
}

const csvHeaders = [
  'Customer', 'Invoice Number', 'Amount', 'Issue Date', 'Due Date', 'Email',
  'Status', 'Blocker', 'Owner', 'Next Action', 'Next Action Date',
  'Promise Date', 'Notes', 'Last Contact Date',
]

function csvCell(value: string | number | undefined): string {
  let text = value === undefined ? '' : String(value)
  // Leading apostrophe stops Excel and similar spreadsheet formula execution.
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function exportInvoicesCsv(invoices: Invoice[]): string {
  const records = invoices.map((invoice) => [
    invoice.customer,
    invoice.invoiceNumber,
    invoice.amount.toFixed(2),
    invoice.issueDate,
    invoice.dueDate,
    invoice.email,
    invoice.annotation.status,
    invoice.annotation.blocker,
    invoice.annotation.owner,
    invoice.annotation.nextAction,
    invoice.annotation.nextActionDate,
    invoice.annotation.promiseDate,
    invoice.annotation.notes,
    invoice.annotation.lastContactDate,
  ].map(csvCell).join(','))
  return [csvHeaders.join(','), ...records].join('\r\n') + '\r\n'
}

export function exportLedgerJson(invoices: Invoice[]): string {
  return JSON.stringify({ format: 'promiseledger', version: 1, invoices }, null, 2)
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${field}`)
  return value.trim()
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return requireString(value, field)
}

function validateAnnotation(value: unknown): InvoiceAnnotation {
  if (!value || typeof value !== 'object') throw new Error('Invalid annotation')
  const raw = value as Record<string, unknown>
  if (!statuses.includes(raw.status as ResolutionStatus)) throw new Error('Invalid annotation status')
  if (!blockers.includes(raw.blocker as BlockerCategory)) throw new Error('Invalid annotation blocker')
  const annotation: InvoiceAnnotation = { status: raw.status as ResolutionStatus, blocker: raw.blocker as BlockerCategory }
  for (const name of ['owner', 'nextAction', 'notes'] as const) {
    const text = optionalString(raw[name], name)
    if (text) annotation[name] = text
  }
  for (const name of ['nextActionDate', 'promiseDate', 'lastContactDate'] as const) {
    const text = optionalString(raw[name], name)
    if (!text) continue
    const date = normalizeDate(text)
    if (!date) throw new Error(`Invalid ${name}`)
    annotation[name] = date
  }
  return annotation
}

/** Strictly restores the versioned JSON backup. Existing state should be replaced only after this succeeds. */
export function importLedgerJson(json: string): Invoice[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid JSON')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid ledger backup')
  const payload = parsed as Record<string, unknown>
  if (payload.format !== 'promiseledger' || payload.version !== 1 || !Array.isArray(payload.invoices)) {
    throw new Error('Unsupported ledger backup format')
  }
  const seen = new Set<string>()
  return payload.invoices.map((value, index): Invoice => {
    if (!value || typeof value !== 'object') throw new Error(`Invalid invoice ${index + 1}`)
    const raw = value as Record<string, unknown>
    const customer = requireString(raw.customer, 'customer')
    const invoiceNumber = requireString(raw.invoiceNumber, 'invoiceNumber')
    const dueDate = normalizeDate(requireString(raw.dueDate, 'dueDate'))
    if (!dueDate) throw new Error(`Invalid dueDate for invoice ${index + 1}`)
    if (typeof raw.amount !== 'number' || !Number.isFinite(raw.amount) || raw.amount < 0 || raw.amount * 100 > Number.MAX_SAFE_INTEGER || Math.round(raw.amount * 100) / 100 !== raw.amount) {
      throw new Error(`Invalid amount for invoice ${index + 1}`)
    }
    const key = invoiceKey(customer, invoiceNumber)
    if (seen.has(key)) throw new Error(`Duplicate invoice ${index + 1}`)
    seen.add(key)
    const issueText = optionalString(raw.issueDate, 'issueDate')
    const issueDate = issueText ? normalizeDate(issueText) : undefined
    if (issueText && !issueDate) throw new Error(`Invalid issueDate for invoice ${index + 1}`)
    const email = optionalString(raw.email, 'email')
    return {
      key,
      customer,
      invoiceNumber,
      amount: raw.amount,
      dueDate,
      ...(issueDate ? { issueDate } : {}),
      ...(email ? { email } : {}),
      annotation: validateAnnotation(raw.annotation),
    }
  })
}
