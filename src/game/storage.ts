import type { SettingsState } from './settings'
import type { Scores } from './types'
import type { ThemeSettings } from '../theme/palette'

export const STORAGE_KEY = 'tic-tac-toe-3d:v1'

export interface PersistShape {
  version: 1
  settings: SettingsState
  theme: ThemeSettings
  scores: Scores
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reads saved state; returns an empty object when nothing usable is stored. */
export function loadPersisted(): Partial<PersistShape> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) ? (parsed as Partial<PersistShape>) : {}
  } catch {
    return {}
  }
}

export function savePersisted(state: PersistShape): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* storage may be unavailable (private mode, quota) — the game still works */
  }
}

export function clearPersisted(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
