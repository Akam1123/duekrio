import { describe, expect, it } from 'vitest'
import {
  deriveInvoice,
  exportInvoicesCsv,
  exportLedgerJson,
  importLedgerJson,
  invoiceKey,
  parseInvoiceCsv,
  prioritizeInvoices,
  summarizeLedger,
} from './ledger'
import type { Invoice } from './types'

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    key: invoiceKey('Acme Studio', 'INV-100'),
    customer: 'Acme Studio',
    invoiceNumber: 'INV-100',
    amount: 2400,
    dueDate: '2026-09-01',
    annotation: { status: 'open', blocker: 'none' },
    ...overrides,
  }
}

describe('CSV import', () => {
  it.each(['Balance', 'Open Balance', 'Amount Due'])(
    'prefers the remaining %s over original Amount even when Amount appears first',
    (balanceHeader) => {
      const result = parseInvoiceCsv(
        `Customer,Invoice Number,Amount,${balanceHeader},Due Date\n` +
        'Acme Studio,INV-100,1250.00,300.25,2026-09-01\n',
      )
      expect(result.issues).toEqual([])
      expect(result.invoices[0]!.amount).toBe(300.25)
    },
  )

  it('reads quoted commas, quotes and embedded newlines without splitting invoices', () => {
    const csv = '\uFEFFCustomer,Invoice #,Open Balance,Due Date,Invoice Date,Email\r\n' +
      '"Acme, Inc.",INV-1,"$1,250.50",9/15/2026,9/1/2026,ap@acme.test\r\n' +
      '"Two ""Lines""\nCompany",INV-2,200,2026-09-21,,\r\n'
    const result = parseInvoiceCsv(csv)
    expect(result.issues).toEqual([])
    expect(result.added).toBe(2)
    expect(result.invoices[0]).toMatchObject({
      customer: 'Acme, Inc.', invoiceNumber: 'INV-1', amount: 1250.5,
      dueDate: '2026-09-15', issueDate: '2026-09-01', email: 'ap@acme.test',
    })
    expect(result.invoices[1]!.customer).toBe('Two "Lines"\nCompany')
  })

  it('keeps annotations and old invoices while updating source fields on reimport', () => {
    const old = invoice({
      email: 'old@acme.test',
      annotation: {
        status: 'in_progress', blocker: 'dispute', owner: 'Maya',
        nextAction: 'Call AP', nextActionDate: '2026-09-26', promiseDate: '2026-10-02',
        lastContactDate: '2026-09-20', notes: 'Customer queried the PO.',
      },
    })
    const untouched = invoice({
      key: invoiceKey('Other Co', 'INV-7'), customer: 'Other Co', invoiceNumber: 'INV-7',
    })
    const result = parseInvoiceCsv(
      'Customer,Invoice Number,Amount,Due Date,Email\n' +
      ' ACME   STUDIO ,inv-100,"$2,750.00",2026-09-05,new@acme.test\n' +
      'New Co,INV-8,35.10,2026-10-01,new@example.test\n',
      [old, untouched],
    )
    expect(result).toMatchObject({ added: 1, updated: 1, skipped: 0, issues: [] })
    expect(result.invoices).toHaveLength(3)
    expect(result.invoices[0]!.amount).toBe(2750)
    expect(result.invoices[0]!.dueDate).toBe('2026-09-05')
    expect(result.invoices[0]!.email).toBe('new@acme.test')
    expect(result.invoices[0]!.annotation).toEqual(old.annotation)
    expect(result.invoices[0]!.annotation).not.toBe(old.annotation)
    expect(result.invoices[1]).toEqual(untouched)
  })

  it('reports bad rows and duplicate invoice identities without mutating the portfolio', () => {
    const old = invoice()
    const csv = 'Customer,Invoice Number,Amount,Due Date\n' +
      'One,1,100,2026-09-31\n' +
      'One,1,100,2026-09-01\n' +
      'one, 1 ,200,2026-09-01\n' +
      'Two,2,-10,2026-09-01\n'
    const result = parseInvoiceCsv(csv, [old])
    expect(result).toMatchObject({ added: 1, updated: 0, skipped: 3 })
    expect(result.issues.map((issue) => issue.row)).toEqual([2, 4, 5])
    expect(result.invoices[0]).toBe(old)
    expect(result.invoices[1]!.amount).toBe(100)
  })

  it('leaves existing data intact when required columns or CSV syntax are invalid', () => {
    const old = invoice()
    const missing = parseInvoiceCsv('Customer,Amount\nNew,100\n', [old])
    expect(missing.invoices).toEqual([old])
    expect(missing.issues[0]!.message).toContain('Missing required columns')
    const broken = parseInvoiceCsv('Customer,Invoice Number,Amount,Due Date\n"Broken,1,100,2026-09-01', [old])
    expect(broken.invoices).toEqual([old])
    expect(broken.issues[0]!.message).toContain('Unterminated')
  })
})

describe('collection queue', () => {
  it('uses due date, amount, broken promises, late action, and blockers for a deterministic score', () => {
    const row = invoice({
      amount: 12_000,
      annotation: {
        status: 'in_progress', blocker: 'dispute',
        promiseDate: '2026-09-20', nextActionDate: '2026-09-24',
      },
    })
    const derived = deriveInvoice(row, '2026-09-25')
    expect(derived).toMatchObject({
      daysOverdue: 24, isOverdue: true, isBlocked: true,
      isPromiseBroken: true, isActionLate: true,
      priorityScore: 95, priorityBand: 'urgent',
    })
    expect(row.annotation).toEqual({
      status: 'in_progress', blocker: 'dispute', promiseDate: '2026-09-20', nextActionDate: '2026-09-24',
    })
  })

  it('does not count a promise due today as broken and excludes paid invoices from the queue', () => {
    const promised = invoice({ annotation: { status: 'open', blocker: 'none', promiseDate: '2026-09-25' } })
    const paid = invoice({ annotation: { status: 'paid', blocker: 'none', promiseDate: '2026-09-01' } })
    expect(deriveInvoice(promised, '2026-09-25').isPromiseBroken).toBe(false)
    expect(deriveInvoice(paid, '2026-09-25')).toMatchObject({
      isOverdue: false, isPromiseBroken: false, priorityScore: 0, priorityBand: 'none',
    })
    const resolved = invoice({ annotation: { status: 'resolved', blocker: 'dispute' } })
    expect(deriveInvoice(resolved, '2026-09-25')).toMatchObject({ isOverdue: true, isBlocked: false, priorityBand: 'medium' })
  })

  it('sorts urgent work first and summarizes active USD balances in cents', () => {
    const rows = [
      invoice({ key: 'paid', amount: 400, annotation: { status: 'paid', blocker: 'none' } }),
      invoice({ key: 'future', amount: 0.29, dueDate: '2026-10-31' }),
      invoice({ key: 'late', amount: 100.1, dueDate: '2026-09-01', annotation: { status: 'open', blocker: 'none', promiseDate: '2026-09-20' } }),
    ]
    const ordered = prioritizeInvoices(rows, '2026-09-25')
    expect(ordered.map((row) => row.key)).toEqual(['late', 'future', 'paid'])
    expect(summarizeLedger(rows, '2026-09-25')).toEqual({
      invoiceCount: 3,
      activeCount: 2,
      outstandingAmount: 100.39,
      overdueCount: 1,
      overdueAmount: 100.1,
      brokenPromiseCount: 1,
      actionsOverdueCount: 0,
      blockedCount: 0,
      highPriorityCount: 1,
    })
  })
})

describe('exports', () => {
  it('round trips annotations through versioned JSON and rejects invalid backup data', () => {
    const row = invoice({
      annotation: { status: 'in_progress', blocker: 'cash_flow', owner: 'Maya', promiseDate: '2026-10-01', notes: 'Follow up.' },
    })
    expect(importLedgerJson(exportLedgerJson([row]))).toEqual([row])
    expect(() => importLedgerJson('{"format":"promiseledger","version":2,"invoices":[]}')).toThrow('Unsupported')
    const altered = JSON.parse(exportLedgerJson([row]))
    altered.invoices[0].amount = -100
    expect(() => importLedgerJson(JSON.stringify(altered))).toThrow('Invalid amount')
  })

  it('quotes text and guards spreadsheet formulas while keeping CSV backup importable', () => {
    const row = invoice({
      key: invoiceKey('=HYPERLINK("https://evil.test")', 'INV-9'),
      customer: '=HYPERLINK("https://evil.test")',
      invoiceNumber: 'INV-9',
      annotation: { status: 'open', blocker: 'none', notes: 'Asked, then replied "soon".' },
    })
    const csv = exportInvoicesCsv([row])
    expect(csv).toContain("'=HYPERLINK")
    const restored = parseInvoiceCsv(csv)
    expect(restored.issues).toEqual([])
    expect(restored.invoices).toEqual([row])
  })
})
