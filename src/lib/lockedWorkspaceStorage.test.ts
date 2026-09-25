import { describe, expect, it } from 'vitest'
import { invoiceKey } from './ledger'
import { LOCKED_WORKSPACE_STORAGE_KEY, createLockedWorkspace, unlockLockedWorkspace } from './lockedWorkspace'
import { saveLockedWorkspaceIfCurrent } from './lockedWorkspaceStorage'
import type { WorkspaceSnapshot } from './workspace'

const snapshot: WorkspaceSnapshot = {
  invoices: [{
    key: invoiceKey('Northstar', 'INV-1'), customer: 'Northstar', invoiceNumber: 'INV-1',
    amount: 100, dueDate: '2026-09-01', annotation: { status: 'open', blocker: 'none' },
  }],
  demo: false,
  review: { missingKeys: [], paidSeenKeys: [] },
}

function memoryStorage() {
  const values = new Map<string, string>()
  let dropWrites = false
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { if (!dropWrites) values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  return { storage, setDropWrites: (drop: boolean) => { dropWrites = drop } }
}

describe('verified locked workspace storage', () => {
  it('stores an authenticated envelope and refuses a stale tab', async () => {
    const { storage } = memoryStorage()
    const { session } = await createLockedWorkspace(snapshot, 'a unique locked workspace phrase')
    const first = await saveLockedWorkspaceIfCurrent(storage, null, snapshot, session)
    expect(first.kind).toBe('saved')
    if (first.kind !== 'saved') return
    expect(first.raw).not.toContain('Northstar')
    expect((await unlockLockedWorkspace(first.raw, 'a unique locked workspace phrase')).snapshot).toEqual(snapshot)

    const newer = { ...snapshot, demo: true }
    const second = await saveLockedWorkspaceIfCurrent(storage, first.raw, newer, session)
    expect(second.kind).toBe('saved')
    expect(await saveLockedWorkspaceIfCurrent(storage, first.raw, snapshot, session)).toEqual({ kind: 'conflict' })
    expect(storage.getItem(LOCKED_WORKSPACE_STORAGE_KEY)).toBe(second.kind === 'saved' ? second.raw : null)
    session.close()
  })

  it('keeps the previous envelope when a new write is silently dropped', async () => {
    const { storage, setDropWrites } = memoryStorage()
    const { session } = await createLockedWorkspace(snapshot, 'another unique locked phrase 2026')
    const first = await saveLockedWorkspaceIfCurrent(storage, null, snapshot, session)
    expect(first.kind).toBe('saved')
    if (first.kind !== 'saved') return
    setDropWrites(true)
    expect(await saveLockedWorkspaceIfCurrent(storage, first.raw, { ...snapshot, demo: true }, session)).toEqual({ kind: 'failed' })
    expect(storage.getItem(LOCKED_WORKSPACE_STORAGE_KEY)).toBe(first.raw)
    setDropWrites(false)
    expect((await saveLockedWorkspaceIfCurrent(storage, first.raw, { ...snapshot, demo: true }, session)).kind).toBe('saved')
    session.close()
  })
})
