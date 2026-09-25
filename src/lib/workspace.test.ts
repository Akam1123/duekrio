import { describe, expect, it } from 'vitest'
import { exportLedgerJson, invoiceKey } from './ledger'
import {
  WORKSPACE_STORAGE_KEY,
  decryptWorkspaceJson,
  encryptWorkspaceJson,
  exportWorkspaceJson,
  importWorkspaceJson,
  isEncryptedWorkspaceJson,
  saveWorkspaceIfCurrent,
  validateEncryptedWorkspaceJson,
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

  it('encrypts a complete backup with fresh randomness and restores it only with the passphrase', async () => {
    const snapshot = { invoices: [row], demo: true, review: { missingKeys: [row.key], paidSeenKeys: [] } }
    const passphrase = 'a long unique backup phrase for this test'
    const first = await encryptWorkspaceJson(snapshot, passphrase)
    const second = await encryptWorkspaceJson(snapshot, passphrase)
    expect(isEncryptedWorkspaceJson(first)).toBe(true)
    expect(first).not.toContain('Northstar')
    expect(JSON.parse(first).salt).not.toBe(JSON.parse(second).salt)
    expect(JSON.parse(first).iv).not.toBe(JSON.parse(second).iv)
    expect(await decryptWorkspaceJson(first, passphrase)).toEqual(snapshot)
    await expect(decryptWorkspaceJson(first, 'the wrong passphrase')).rejects.toThrow('Incorrect passphrase or damaged')
  })

  it('rejects tampered ciphertext and unsupported encrypted envelope metadata', async () => {
    const snapshot = { invoices: [row], demo: false, review: { missingKeys: [], paidSeenKeys: [] } }
    const encrypted = JSON.parse(await encryptWorkspaceJson(snapshot, 'another long unique test passphrase'))
    const original = encrypted.ciphertext as string
    encrypted.ciphertext = `${original[0] === 'A' ? 'B' : 'A'}${original.slice(1)}`
    await expect(decryptWorkspaceJson(JSON.stringify(encrypted), 'another long unique test passphrase')).rejects.toThrow('Incorrect passphrase or damaged')
    encrypted.ciphertext = original
    encrypted.iterations = 1
    expect(() => validateEncryptedWorkspaceJson(JSON.stringify(encrypted))).toThrow('Unsupported encrypted backup format')
    encrypted.iterations = 600_000
    encrypted.extra = 'ignored?'
    expect(() => validateEncryptedWorkspaceJson(JSON.stringify(encrypted))).toThrow('Unsupported encrypted backup format')
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

  it('preserves the previous snapshot after a failed write and refuses a stale retry', () => {
    const values = new Map<string, string>()
    let failWrites = false
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError')
        values.set(key, value)
      },
    }
    const original = { invoices: [row], demo: false, review: { missingKeys: [], paidSeenKeys: [] } }
    const first = saveWorkspaceIfCurrent(storage, null, original)
    expect(first.kind).toBe('saved')
    if (first.kind !== 'saved') return

    const pending = { ...original, review: { missingKeys: [row.key], paidSeenKeys: [] } }
    failWrites = true
    expect(() => saveWorkspaceIfCurrent(storage, first.raw, pending)).toThrow('Quota exceeded')
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).toBe(first.raw)

    failWrites = false
    const otherTab = { ...original, demo: true }
    const otherResult = saveWorkspaceIfCurrent(storage, first.raw, otherTab)
    expect(otherResult.kind).toBe('saved')
    expect(saveWorkspaceIfCurrent(storage, first.raw, pending)).toEqual({ kind: 'conflict' })
    expect(JSON.parse(storage.getItem(WORKSPACE_STORAGE_KEY)!)).toEqual(otherTab)
  })

  it('does not report success when browser storage silently drops a write', () => {
    const values = new Map<string, string>()
    let dropWrites = true
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { if (!dropWrites) values.set(key, value) },
    }
    const snapshot = { invoices: [row], demo: false, review: { missingKeys: [], paidSeenKeys: [] } }
    expect(saveWorkspaceIfCurrent(storage, null, snapshot)).toEqual({ kind: 'failed' })
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).toBeNull()
    dropWrites = false
    const retry = saveWorkspaceIfCurrent(storage, null, snapshot)
    expect(retry.kind).toBe('saved')
    expect(JSON.parse(storage.getItem(WORKSPACE_STORAGE_KEY)!)).toEqual(snapshot)
  })
})
