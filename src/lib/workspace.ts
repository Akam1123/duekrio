import { importLedgerJson } from './ledger'
import type { Invoice } from './types'

// Keep the original key so existing browser workspaces remain available.
export const WORKSPACE_STORAGE_KEY = 'promiseledger.workspace.v1'

export interface ImportReview {
  missingKeys: string[]
  paidSeenKeys: string[]
}

export interface WorkspaceSnapshot {
  invoices: Invoice[]
  demo: boolean
  review: ImportReview
}

export const emptyReview = (): ImportReview => ({ missingKeys: [], paidSeenKeys: [] })

function parseReview(value: unknown): ImportReview {
  if (value === undefined) return emptyReview()
  if (!value || typeof value !== 'object') throw new Error('Invalid backup review flags')
  const review = value as Record<string, unknown>
  if (!Array.isArray(review.missingKeys) || !review.missingKeys.every(key => typeof key === 'string') ||
      !Array.isArray(review.paidSeenKeys) || !review.paidSeenKeys.every(key => typeof key === 'string')) {
    throw new Error('Invalid backup review flags')
  }
  return { missingKeys: [...review.missingKeys], paidSeenKeys: [...review.paidSeenKeys] }
}

/** Restores a backup without dropping demo status or CSV reconciliation flags. */
export function importWorkspaceJson(json: string): WorkspaceSnapshot {
  const invoices = importLedgerJson(json)
  const payload = JSON.parse(json) as Record<string, unknown>
  if (payload.demo !== undefined && typeof payload.demo !== 'boolean') throw new Error('Invalid backup sample status')
  return { invoices, demo: payload.demo === true, review: parseReview(payload.review) }
}

export function exportWorkspaceJson(snapshot: WorkspaceSnapshot): string {
  return JSON.stringify({ format: 'duenara', version: 1, ...snapshot }, null, 2)
}

const ENCRYPTED_FORMAT = 'duenara-encrypted-backup'
const ENCRYPTED_VERSION = 1
const PBKDF2_ITERATIONS = 600_000
const MAX_PLAINTEXT_BYTES = 10 * 1024 * 1024
const SALT_BYTES = 16
const IV_BYTES = 12
const TAG_BYTES = 16
export const MIN_BACKUP_PASSPHRASE_LENGTH = 16

interface EncryptedEnvelope {
  format: typeof ENCRYPTED_FORMAT
  version: typeof ENCRYPTED_VERSION
  kdf: 'PBKDF2-SHA256'
  iterations: typeof PBKDF2_ITERATIONS
  cipher: 'AES-256-GCM'
  salt: string
  iv: string
  ciphertext: string
}

function requireCrypto(): SubtleCrypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error('Secure browser cryptography is unavailable. Use a current HTTPS browser or the plain JSON backup option.')
  }
  return globalThis.crypto.subtle
}

function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)))
  }
  return btoa(chunks.join(''))
}

function fromBase64(value: unknown, label: string): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) || !value) {
    throw new Error(`Invalid encrypted backup ${label}`)
  }
  const decoded = Uint8Array.from(atob(value), character => character.charCodeAt(0))
  if (toBase64(decoded) !== value) throw new Error(`Invalid encrypted backup ${label}`)
  return decoded
}

function parseEnvelope(json: string): { salt: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer>; ciphertext: Uint8Array<ArrayBuffer> } {
  let value: unknown
  try { value = JSON.parse(json) } catch { throw new Error('Invalid encrypted backup JSON') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid encrypted backup format')
  const raw = value as Record<string, unknown>
  const keys = Object.keys(raw).sort().join(',')
  if (keys !== 'cipher,ciphertext,format,iterations,iv,kdf,salt,version' ||
      raw.format !== ENCRYPTED_FORMAT || raw.version !== ENCRYPTED_VERSION ||
      raw.kdf !== 'PBKDF2-SHA256' || raw.iterations !== PBKDF2_ITERATIONS || raw.cipher !== 'AES-256-GCM') {
    throw new Error('Unsupported encrypted backup format')
  }
  const salt = fromBase64(raw.salt, 'salt')
  const iv = fromBase64(raw.iv, 'IV')
  const ciphertext = fromBase64(raw.ciphertext, 'ciphertext')
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES ||
      ciphertext.length < TAG_BYTES || ciphertext.length > MAX_PLAINTEXT_BYTES + TAG_BYTES) {
    throw new Error('Invalid encrypted backup lengths')
  }
  return { salt, iv, ciphertext }
}

export function isEncryptedWorkspaceJson(json: string): boolean {
  let value: unknown
  try { value = JSON.parse(json) } catch { return false }
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (value as Record<string, unknown>).format === ENCRYPTED_FORMAT)
}

export function validateEncryptedWorkspaceJson(json: string): void {
  parseEnvelope(json)
}

async function deriveBackupKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, usage: KeyUsage): Promise<CryptoKey> {
  const subtle = requireCrypto()
  const secret = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    secret,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  )
}

/** Encrypts the downloaded JSON file separately from the optional locked browser workspace. */
export async function encryptWorkspaceJson(snapshot: WorkspaceSnapshot, passphrase: string): Promise<string> {
  if (Array.from(passphrase).length < MIN_BACKUP_PASSPHRASE_LENGTH) {
    throw new Error(`Use a unique backup passphrase of at least ${MIN_BACKUP_PASSPHRASE_LENGTH} characters.`)
  }
  const subtle = requireCrypto()
  const plaintext = new TextEncoder().encode(exportWorkspaceJson(snapshot))
  if (plaintext.length > MAX_PLAINTEXT_BYTES) throw new Error('Workspace is too large for an encrypted backup.')
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveBackupKey(passphrase, salt, 'encrypt')
  const ciphertext = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext))
  const envelope: EncryptedEnvelope = {
    format: ENCRYPTED_FORMAT,
    version: ENCRYPTED_VERSION,
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    cipher: 'AES-256-GCM',
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  }
  return JSON.stringify(envelope, null, 2)
}

/** Restores only after authenticated decryption and normal workspace validation succeed. */
export async function decryptWorkspaceJson(json: string, passphrase: string): Promise<WorkspaceSnapshot> {
  if (!passphrase) throw new Error('Enter the backup passphrase.')
  const { salt, iv, ciphertext } = parseEnvelope(json)
  const subtle = requireCrypto()
  const key = await deriveBackupKey(passphrase, salt, 'decrypt')
  let plaintext: ArrayBuffer
  try {
    plaintext = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  } catch {
    throw new Error('Incorrect passphrase or damaged encrypted backup. No data was changed.')
  }
  if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) throw new Error('Decrypted backup is too large. No data was changed.')
  return importWorkspaceJson(new TextDecoder('utf-8', { fatal: true }).decode(plaintext))
}

export function serializeWorkspace(snapshot: WorkspaceSnapshot): string {
  return JSON.stringify(snapshot)
}

/** Compare workspaces after the same schema validation used by encrypted storage. */
export function canonicalWorkspace(snapshot: WorkspaceSnapshot): string {
  return serializeWorkspace(importWorkspaceJson(exportWorkspaceJson(snapshot)))
}

export type SaveResult = { kind: 'saved'; raw: string } | { kind: 'conflict' } | { kind: 'failed' }

/** A stale tab cannot replace a newer workspace snapshot. Call under a Web Lock. */
export function saveWorkspaceIfCurrent(storage: Pick<Storage, 'getItem' | 'setItem'>, expectedRaw: string | null, snapshot: WorkspaceSnapshot): SaveResult {
  if (storage.getItem(WORKSPACE_STORAGE_KEY) !== expectedRaw) return { kind: 'conflict' }
  const raw = serializeWorkspace(snapshot)
  storage.setItem(WORKSPACE_STORAGE_KEY, raw)
  const observed = storage.getItem(WORKSPACE_STORAGE_KEY)
  if (observed !== raw) return observed === expectedRaw ? { kind: 'failed' } : { kind: 'conflict' }
  return { kind: 'saved', raw }
}
