import { describe, expect, it } from 'vitest'
import { exportLedgerJson, invoiceKey } from './ledger'
import {
  WORKSPACE_STORAGE_KEY,
  exportWorkspaceJson,
  importWorkspaceJson,
  saveWorkspaceIfCurrent,
} from './workspace'
import type { Invoice } from './types'

const row: Invoice = {
  key: invoiceKey('Northstar', 'INV-1'),
  customer: 'Northstar',
  invoiceNumber: 'INV-1',
  amount: 100,
  dueDate: '2026-09-01',
  annotation: { status: 'open', blocker: 'none' },
}

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

describe('workspace persistence', () => {
  it('keeps sample status and reconciliation flags in a JSON backup', () => {
    const snapshot = {
      invoices: [row], demo: true,
      review: { missingKeys: [row.key], paidSeenKeys: ['another'] },
    }
    expect(importWorkspaceJson(exportWorkspaceJson(snapshot))).toEqual(snapshot)
    expect(importWorkspaceJson(exportLedgerJson([row]))).toEqual({
      invoices: [row], demo: false, review: { missingKeys: [], paidSeenKeys: [] },
    })
  })

  it('rejects broken backup metadata instead of silently discarding it', () => {
    const backup = JSON.parse(exportWorkspaceJson({ invoices: [row], demo: false, review: { missingKeys: [], paidSeenKeys: [] } }))
    backup.review.missingKeys = [42]
    expect(() => importWorkspaceJson(JSON.stringify(backup))).toThrow('Invalid backup review flags')
    backup.review = { missingKeys: [], paidSeenKeys: [] }
    backup.demo = 'false'
    expect(() => importWorkspaceJson(JSON.stringify(backup))).toThrow('Invalid backup sample status')
  })

  it('refuses a stale tab write and keeps the newer browser snapshot', () => {
    const storage = memoryStorage()
    const original = { invoices: [row], demo: false, review: { missingKeys: [], paidSeenKeys: [] } }
    const first = saveWorkspaceIfCurrent(storage, null, original)
    expect(first.kind).toBe('saved')
    const newer = { ...original, review: { missingKeys: [row.key], paidSeenKeys: [] } }
    const saved = saveWorkspaceIfCurrent(storage, first.kind === 'saved' ? first.raw : null, newer)
    expect(saved.kind).toBe('saved')
    expect(saveWorkspaceIfCurrent(storage, first.kind === 'saved' ? first.raw : null, original)).toEqual({ kind: 'conflict' })
    expect(JSON.parse(storage.getItem(WORKSPACE_STORAGE_KEY)!)).toEqual(newer)
  })
})
