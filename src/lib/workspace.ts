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

export function serializeWorkspace(snapshot: WorkspaceSnapshot): string {
  return JSON.stringify(snapshot)
}

export type SaveResult = { kind: 'saved'; raw: string } | { kind: 'conflict' }

/** A stale tab cannot replace a newer workspace snapshot. Call under a Web Lock. */
export function saveWorkspaceIfCurrent(storage: Pick<Storage, 'getItem' | 'setItem'>, expectedRaw: string | null, snapshot: WorkspaceSnapshot): SaveResult {
  if (storage.getItem(WORKSPACE_STORAGE_KEY) !== expectedRaw) return { kind: 'conflict' }
  const raw = serializeWorkspace(snapshot)
  storage.setItem(WORKSPACE_STORAGE_KEY, raw)
  return { kind: 'saved', raw }
}
