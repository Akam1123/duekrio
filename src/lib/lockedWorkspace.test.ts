import { describe, expect, it } from 'vitest'
import { invoiceKey } from './ledger'
import {
  LOCKED_WORKSPACE_STORAGE_KEY,
  createLockedWorkspace,
  unlockLockedWorkspace,
  validateLockedWorkspaceEnvelope,
} from './lockedWorkspace'
import { WORKSPACE_STORAGE_KEY } from './workspace'
import type { WorkspaceSnapshot } from './workspace'

const passphrase = 'a unique local workspace passphrase 2026'
const snapshot: WorkspaceSnapshot = {
  invoices: [{
    key: invoiceKey('Northstar', 'INV-1'),
    customer: 'Northstar',
    invoiceNumber: 'INV-1',
    amount: 100,
    dueDate: '2026-09-01',
    annotation: { status: 'open', blocker: 'none', nextAction: 'Review the invoice' },
  }],
  demo: false,
  review: { missingKeys: [], paidSeenKeys: [] },
}

describe('optional locked local workspace envelope', () => {
  it('encrypts a validated snapshot and unlocks it without exposing the key or plaintext', async () => {
    const { session, envelope } = await createLockedWorkspace(snapshot, passphrase)
    expect(LOCKED_WORKSPACE_STORAGE_KEY).not.toBe(WORKSPACE_STORAGE_KEY)
    expect(envelope).not.toContain('Northstar')
    expect(envelope).not.toContain('Review the invoice')
    expect(JSON.stringify(session)).toBe('{}')
    expect(() => validateLockedWorkspaceEnvelope(envelope)).not.toThrow()

    const reopened = await unlockLockedWorkspace(envelope, passphrase)
    expect(reopened.snapshot).toEqual(snapshot)
    expect(await session.open(envelope)).toEqual(snapshot)
    session.close()
    reopened.session.close()
    await expect(session.open(envelope)).rejects.toThrow('locked')
    await expect(reopened.session.seal(snapshot)).rejects.toThrow('locked')
  })

  it('uses a fresh IV on every save and rejects a different workspace salt', async () => {
    const first = await createLockedWorkspace(snapshot, passphrase)
    const second = await first.session.seal(snapshot)
    const firstEnvelope = JSON.parse(first.envelope)
    const secondEnvelope = JSON.parse(second)
    expect(secondEnvelope.salt).toBe(firstEnvelope.salt)
    expect(secondEnvelope.iv).not.toBe(firstEnvelope.iv)
    expect(secondEnvelope.ciphertext).not.toBe(firstEnvelope.ciphertext)
    expect(await first.session.open(second)).toEqual(snapshot)

    const other = await createLockedWorkspace(snapshot, passphrase)
    expect(JSON.parse(other.envelope).salt).not.toBe(firstEnvelope.salt)
    await expect(first.session.open(other.envelope)).rejects.toThrow('different workspace')
    first.session.close()
    other.session.close()
  })

  it('does not complete an in-flight operation after the session is closed', async () => {
    const { session, envelope } = await createLockedWorkspace(snapshot, passphrase)
    const pendingSeal = session.seal(snapshot)
    session.close()
    await expect(pendingSeal).rejects.toThrow('locked')

    const reopened = await unlockLockedWorkspace(envelope, passphrase)
    const pendingOpen = reopened.session.open(envelope)
    reopened.session.close()
    await expect(pendingOpen).rejects.toThrow('locked')
  })

  it('rejects wrong passphrases and tampering without returning a snapshot', async () => {
    const { session, envelope } = await createLockedWorkspace(snapshot, passphrase)
    await expect(unlockLockedWorkspace(envelope, 'a different passphrase')).rejects.toThrow('Incorrect passphrase or damaged')
    const raw = JSON.parse(envelope)
    for (const field of ['ciphertext', 'iv', 'salt'] as const) {
      const modified = { ...raw, [field]: `${raw[field][0] === 'A' ? 'B' : 'A'}${raw[field].slice(1)}` }
      await expect(unlockLockedWorkspace(JSON.stringify(modified), passphrase)).rejects.toThrow('Incorrect passphrase or damaged')
    }
    session.close()
  })

  it('rejects unsupported algorithms, extra fields, malformed lengths, and oversized input before decryption', async () => {
    const { session, envelope } = await createLockedWorkspace(snapshot, passphrase)
    const raw = JSON.parse(envelope)
    expect(() => validateLockedWorkspaceEnvelope(JSON.stringify({ ...raw, iterations: 1 }))).toThrow('Unsupported locked workspace format')
    expect(() => validateLockedWorkspaceEnvelope(JSON.stringify({ ...raw, cipher: 'AES-CBC' }))).toThrow('Unsupported locked workspace format')
    expect(() => validateLockedWorkspaceEnvelope(JSON.stringify({ ...raw, extra: true }))).toThrow('Unsupported locked workspace format')
    expect(() => validateLockedWorkspaceEnvelope(JSON.stringify({ ...raw, salt: 'AA==' }))).toThrow('Invalid locked workspace lengths')
    expect(() => validateLockedWorkspaceEnvelope(JSON.stringify({ ...raw, ciphertext: 'AA==' }))).toThrow('Invalid locked workspace lengths')
    expect(() => validateLockedWorkspaceEnvelope('x'.repeat(15 * 1024 * 1024 + 1))).toThrow('too large')
    session.close()
  })

  it('does not create a locked workspace from an invalid snapshot or weak passphrase', async () => {
    await expect(createLockedWorkspace(snapshot, 'too short')).rejects.toThrow('at least 16 characters')
    const malformed = { ...snapshot, invoices: [{ ...snapshot.invoices[0]!, amount: -1 }] }
    await expect(createLockedWorkspace(malformed, passphrase)).rejects.toThrow('Invalid amount')
  })
})
