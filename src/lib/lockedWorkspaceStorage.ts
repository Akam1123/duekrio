import { LOCKED_WORKSPACE_STORAGE_KEY, LockedWorkspaceSession } from './lockedWorkspace'
import { canonicalWorkspace } from './workspace'
import type { SaveResult, WorkspaceSnapshot } from './workspace'

type WritableStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** A write is successful only after the exact stored envelope decrypts to the requested snapshot. */
export async function saveLockedWorkspaceIfCurrent(
  storage: WritableStorage,
  expectedRaw: string | null,
  snapshot: WorkspaceSnapshot,
  session: LockedWorkspaceSession,
): Promise<SaveResult> {
  const requested = canonicalWorkspace(snapshot)
  const raw = await session.seal(snapshot)
  if (canonicalWorkspace(await session.open(raw)) !== requested) throw new Error('Encrypted workspace verification failed before saving.')
  if (storage.getItem(LOCKED_WORKSPACE_STORAGE_KEY) !== expectedRaw) return { kind: 'conflict' }

  storage.setItem(LOCKED_WORKSPACE_STORAGE_KEY, raw)
  const observed = storage.getItem(LOCKED_WORKSPACE_STORAGE_KEY)
  if (observed !== raw) return observed === expectedRaw ? { kind: 'failed' } : { kind: 'conflict' }

  try {
    if (canonicalWorkspace(await session.open(observed)) !== requested) {
      throw new Error('Encrypted workspace verification failed after saving.')
    }
  } catch (error) {
    // Restore only our own write while it is still current. The caller keeps
    // the in-memory snapshot and can retry or export a backup.
    if (storage.getItem(LOCKED_WORKSPACE_STORAGE_KEY) === raw) {
      if (expectedRaw === null) storage.removeItem(LOCKED_WORKSPACE_STORAGE_KEY)
      else storage.setItem(LOCKED_WORKSPACE_STORAGE_KEY, expectedRaw)
      if (storage.getItem(LOCKED_WORKSPACE_STORAGE_KEY) !== expectedRaw) {
        throw new Error('Encrypted workspace verification failed and the previous copy could not be restored.')
      }
    }
    throw error
  }
  return { kind: 'saved', raw }
}
