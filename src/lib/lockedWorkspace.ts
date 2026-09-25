import { exportWorkspaceJson, importWorkspaceJson } from './workspace'
import type { WorkspaceSnapshot } from './workspace'

/** Separate from promiseledger.workspace.v1. Migrating or deleting that key requires an explicit, verified UI flow. */
export const LOCKED_WORKSPACE_STORAGE_KEY = 'duenara.workspace.locked.v1'

const FORMAT = 'duenara-locked-workspace'
const VERSION = 1
const KDF = 'PBKDF2-SHA256'
const ITERATIONS = 600_000
const CIPHER = 'AES-256-GCM'
const SALT_BYTES = 16
const IV_BYTES = 12
const TAG_BYTES = 16
const MAX_PLAINTEXT_BYTES = 10 * 1024 * 1024
const MAX_ENVELOPE_CHARS = 15 * 1024 * 1024
const MAX_PASSPHRASE_BYTES = 1024
export const MIN_LOCK_PASSPHRASE_LENGTH = 16

interface Envelope {
  format: typeof FORMAT
  version: typeof VERSION
  kdf: typeof KDF
  iterations: typeof ITERATIONS
  cipher: typeof CIPHER
  salt: string
  iv: string
  ciphertext: string
}

interface ParsedEnvelope {
  salt: Uint8Array<ArrayBuffer>
  saltBase64: string
  iv: Uint8Array<ArrayBuffer>
  ivBase64: string
  ciphertext: Uint8Array<ArrayBuffer>
}

function requireCrypto(): SubtleCrypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error('Secure browser cryptography is unavailable. Use a current HTTPS browser.')
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

function fromBase64(value: unknown, label: string, maxBytes: number): Uint8Array<ArrayBuffer> {
  const maxChars = 4 * Math.ceil(maxBytes / 3)
  if (typeof value !== 'string' || !value || value.length > maxChars || value.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error(`Invalid locked workspace ${label}. No data was changed.`)
  }
  let decoded: Uint8Array<ArrayBuffer>
  try {
    decoded = Uint8Array.from(atob(value), character => character.charCodeAt(0))
  } catch {
    throw new Error(`Invalid locked workspace ${label}. No data was changed.`)
  }
  if (decoded.length > maxBytes || toBase64(decoded) !== value) {
    throw new Error(`Invalid locked workspace ${label}. No data was changed.`)
  }
  return decoded
}

function parseEnvelope(raw: string): ParsedEnvelope {
  if (raw.length > MAX_ENVELOPE_CHARS) throw new Error('Locked workspace is too large. No data was changed.')
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new Error('Invalid locked workspace JSON. No data was changed.') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid locked workspace format. No data was changed.')
  }
  const envelope = value as Record<string, unknown>
  if (Object.keys(envelope).sort().join(',') !== 'cipher,ciphertext,format,iterations,iv,kdf,salt,version' ||
      envelope.format !== FORMAT || envelope.version !== VERSION || envelope.kdf !== KDF ||
      envelope.iterations !== ITERATIONS || envelope.cipher !== CIPHER) {
    throw new Error('Unsupported locked workspace format. No data was changed.')
  }
  const salt = fromBase64(envelope.salt, 'salt', SALT_BYTES)
  const iv = fromBase64(envelope.iv, 'IV', IV_BYTES)
  const ciphertext = fromBase64(envelope.ciphertext, 'ciphertext', MAX_PLAINTEXT_BYTES + TAG_BYTES)
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || ciphertext.length < TAG_BYTES) {
    throw new Error('Invalid locked workspace lengths. No data was changed.')
  }
  return { salt, saltBase64: envelope.salt as string, iv, ivBase64: envelope.iv as string, ciphertext }
}

function associatedData(saltBase64: string, ivBase64: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${FORMAT}:${VERSION}:${KDF}:${ITERATIONS}:${CIPHER}:${saltBase64}:${ivBase64}`)
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, creating: boolean): Promise<CryptoKey> {
  const subtle = requireCrypto()
  if (passphrase.length > MAX_PASSPHRASE_BYTES) throw new Error('Workspace passphrase is too long.')
  const passphraseBytes = new TextEncoder().encode(passphrase)
  if (passphraseBytes.length > MAX_PASSPHRASE_BYTES) throw new Error('Workspace passphrase is too long.')
  if (creating && Array.from(passphrase).length < MIN_LOCK_PASSPHRASE_LENGTH) {
    throw new Error(`Use a unique workspace passphrase of at least ${MIN_LOCK_PASSPHRASE_LENGTH} characters.`)
  }
  if (!passphraseBytes.length) throw new Error('Enter the workspace passphrase.')
  try {
    const material = await subtle.importKey('raw', passphraseBytes, 'PBKDF2', false, ['deriveKey'])
    return await subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
  } finally {
    passphraseBytes.fill(0)
  }
}

function validatedBytes(snapshot: WorkspaceSnapshot): Uint8Array<ArrayBuffer> {
  // Keep this format compatible with the existing versioned JSON backup validator.
  const normalized = importWorkspaceJson(exportWorkspaceJson(snapshot))
  const json = exportWorkspaceJson(normalized)
  if (json.length > MAX_PLAINTEXT_BYTES) throw new Error('Workspace is too large to lock.')
  const bytes = new TextEncoder().encode(json)
  if (bytes.length > MAX_PLAINTEXT_BYTES) throw new Error('Workspace is too large to lock.')
  return bytes
}

/** Holds a nonextractable key only in memory. Call close() when the UI locks or unloads. */
export class LockedWorkspaceSession {
  #key: CryptoKey | null
  #generation = 0
  readonly #saltBase64: string

  private constructor(key: CryptoKey, saltBase64: string) {
    this.#key = key
    this.#saltBase64 = saltBase64
  }

  static async create(passphrase: string): Promise<LockedWorkspaceSession> {
    requireCrypto()
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES))
    const key = await deriveKey(passphrase, salt, true)
    return new LockedWorkspaceSession(key, toBase64(salt))
  }

  static async unlock(raw: string, passphrase: string): Promise<{ session: LockedWorkspaceSession; snapshot: WorkspaceSnapshot }> {
    const parsed = parseEnvelope(raw)
    const key = await deriveKey(passphrase, parsed.salt, false)
    const session = new LockedWorkspaceSession(key, parsed.saltBase64)
    try {
      return { session, snapshot: await session.openParsed(parsed) }
    } catch (error) {
      session.close()
      throw error
    }
  }

  async seal(snapshot: WorkspaceSnapshot): Promise<string> {
    const key = this.#key
    if (!key) throw new Error('This workspace is locked.')
    const generation = this.#generation
    const subtle = requireCrypto()
    const plaintext = validatedBytes(snapshot)
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES))
    const ivBase64 = toBase64(iv)
    const ciphertext = new Uint8Array(await subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: associatedData(this.#saltBase64, ivBase64) },
      key,
      plaintext,
    ))
    if (this.#key !== key || this.#generation !== generation) throw new Error('This workspace is locked.')
    const envelope: Envelope = {
      format: FORMAT,
      version: VERSION,
      kdf: KDF,
      iterations: ITERATIONS,
      cipher: CIPHER,
      salt: this.#saltBase64,
      iv: ivBase64,
      ciphertext: toBase64(ciphertext),
    }
    return JSON.stringify(envelope)
  }

  async open(raw: string): Promise<WorkspaceSnapshot> {
    return this.openParsed(parseEnvelope(raw))
  }

  private async openParsed(parsed: ParsedEnvelope): Promise<WorkspaceSnapshot> {
    const key = this.#key
    if (!key) throw new Error('This workspace is locked.')
    const generation = this.#generation
    if (parsed.saltBase64 !== this.#saltBase64) {
      throw new Error('This encrypted data belongs to a different workspace. No data was changed.')
    }
    let plaintext: ArrayBuffer
    try {
      plaintext = await requireCrypto().decrypt(
        { name: 'AES-GCM', iv: parsed.iv, additionalData: associatedData(parsed.saltBase64, parsed.ivBase64) },
        key,
        parsed.ciphertext,
      )
    } catch {
      throw new Error('Incorrect passphrase or damaged locked workspace. No data was changed.')
    }
    if (this.#key !== key || this.#generation !== generation) throw new Error('This workspace is locked.')
    if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) throw new Error('Locked workspace is too large. No data was changed.')
    try {
      return importWorkspaceJson(new TextDecoder('utf-8', { fatal: true }).decode(plaintext))
    } catch {
      throw new Error('Damaged locked workspace data. No data was changed.')
    }
  }

  close(): void {
    this.#key = null
    this.#generation += 1
  }
}

/** This function does not read, write, or remove the existing plaintext v1 storage key. */
export async function createLockedWorkspace(snapshot: WorkspaceSnapshot, passphrase: string): Promise<{ session: LockedWorkspaceSession; envelope: string }> {
  const session = await LockedWorkspaceSession.create(passphrase)
  try {
    return { session, envelope: await session.seal(snapshot) }
  } catch (error) {
    session.close()
    throw error
  }
}

export async function unlockLockedWorkspace(raw: string, passphrase: string): Promise<{ session: LockedWorkspaceSession; snapshot: WorkspaceSnapshot }> {
  return LockedWorkspaceSession.unlock(raw, passphrase)
}

export function validateLockedWorkspaceEnvelope(raw: string): void {
  parseEnvelope(raw)
}
