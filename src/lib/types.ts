export type ResolutionStatus = 'open' | 'in_progress' | 'resolved' | 'paid'

export type BlockerCategory =
  | 'none'
  | 'awaiting_approval'
  | 'missing_documentation'
  | 'dispute'
  | 'cash_flow'
  | 'unreachable'
  | 'other'

export interface InvoiceAnnotation {
  status: ResolutionStatus
  blocker: BlockerCategory
  owner?: string
  nextAction?: string
  nextActionDate?: string
  promiseDate?: string
  notes?: string
  lastContactDate?: string
}

/** Dates are ISO YYYY-MM-DD and amounts are USD, rounded to cents. */
export interface Invoice {
  /** Stable composite of normalized customer and invoice number. */
  key: string
  customer: string
  invoiceNumber: string
  amount: number
  issueDate?: string
  dueDate: string
  email?: string
  annotation: InvoiceAnnotation
}

export interface ImportIssue {
  /** Physical line where the CSV record starts; header is line 1. */
  row: number
  message: string
}

export interface CsvImportResult {
  /** Existing invoices remain, with incoming source fields merged by key. */
  invoices: Invoice[]
  added: number
  updated: number
  skipped: number
  issues: ImportIssue[]
}

export type PriorityBand = 'none' | 'low' | 'medium' | 'high' | 'urgent'

export interface DerivedInvoice extends Invoice {
  daysOverdue: number
  daysUntilDue: number
  isOverdue: boolean
  isBlocked: boolean
  isPromiseBroken: boolean
  isActionLate: boolean
  priorityScore: number
  priorityBand: PriorityBand
}

export interface LedgerSummary {
  invoiceCount: number
  activeCount: number
  outstandingAmount: number
  overdueCount: number
  overdueAmount: number
  brokenPromiseCount: number
  actionsOverdueCount: number
  blockedCount: number
  highPriorityCount: number
}
