import type { CpuSide, Difficulty, GameMode, Mark } from './types'
import { other } from './types'

export type StartingRule = 'X' | 'O' | 'alternate'
export type MotionMode = 'auto' | 'full' | 'reduced'
export type CameraMode = 'orbit' | 'locked'
export type BoardDesign = 'classic' | 'carved' | 'floating' | 'neon'

export interface SettingsState {
  mode: GameMode
  cpuSide: CpuSide
  difficulty: Difficulty
  startingRule: StartingRule
  autoAdvance: boolean
  sound: boolean
  motion: MotionMode
  camera: CameraMode
  /** Board architecture: classic slate, carved slab, floating plates or neon lattice. */
  boardDesign: BoardDesign
  /** Post-processing glow (bloom). */
  post: boolean
  /** Show tappable cell numbers and the preview piece. */
  showGuides: boolean
  /** Board-only mode: hides chrome, shows the score on the board. */
  fullscreen: boolean
}

export const DEFAULT_SETTINGS: SettingsState = {
  mode: 'cpu',
  cpuSide: 'O',
  difficulty: 'hard',
  startingRule: 'alternate',
  autoAdvance: true,
  sound: true,
  motion: 'auto',
  camera: 'orbit',
  boardDesign: 'classic',
  post: true,
  showGuides: true,
  fullscreen: false,
}

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard', 'unbeatable']
export const CPU_SIDES: readonly CpuSide[] = ['X', 'O', 'random']

export type SettingsAction =
  | { type: 'patch'; patch: Partial<SettingsState> }
  | { type: 'restore'; settings: Partial<SettingsState> }
  | { type: 'defaults' }

function isOneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

function isBooleanFlag(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

const ENUM_VALUES = {
  mode: ['cpu', 'pvp'],
  cpuSide: ['X', 'O', 'random'],
  difficulty: ['easy', 'medium', 'hard', 'unbeatable'],
  startingRule: ['X', 'O', 'alternate'],
  motion: ['auto', 'full', 'reduced'],
  camera: ['orbit', 'locked'],
  boardDesign: ['classic', 'carved', 'floating', 'neon'],
} as const

function mergeSettings(base: SettingsState, patch: Partial<SettingsState> | undefined): SettingsState {
  if (!patch) return base
  const next: SettingsState = { ...base }

  if (isOneOf(ENUM_VALUES.mode, patch.mode)) next.mode = patch.mode
  if (isOneOf(ENUM_VALUES.cpuSide, patch.cpuSide)) next.cpuSide = patch.cpuSide
  if (isOneOf(ENUM_VALUES.difficulty, patch.difficulty)) next.difficulty = patch.difficulty
  if (isOneOf(ENUM_VALUES.startingRule, patch.startingRule)) next.startingRule = patch.startingRule
  if (isOneOf(ENUM_VALUES.motion, patch.motion)) next.motion = patch.motion
  if (isOneOf(ENUM_VALUES.camera, patch.camera)) next.camera = patch.camera
  if (isOneOf(ENUM_VALUES.boardDesign, patch.boardDesign)) next.boardDesign = patch.boardDesign

  if (isBooleanFlag(patch.autoAdvance)) next.autoAdvance = patch.autoAdvance
  if (isBooleanFlag(patch.sound)) next.sound = patch.sound
  if (isBooleanFlag(patch.post)) next.post = patch.post
  if (isBooleanFlag(patch.showGuides)) next.showGuides = patch.showGuides
  if (isBooleanFlag(patch.fullscreen)) next.fullscreen = patch.fullscreen

  return next
}

export function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case 'patch':
      return mergeSettings(state, action.patch)
    case 'restore':
      return mergeSettings(DEFAULT_SETTINGS, action.settings)
    case 'defaults':
      return { ...DEFAULT_SETTINGS }
    default:
      return state
  }
}

/** The mark the computer plays for a given round. */
export function resolveCpuMark(cpuSide: CpuSide, startingMark: Mark): Mark {
  if (cpuSide === 'random') return other(startingMark)
  return cpuSide
}

export function resolveHumanMark(cpuSide: CpuSide, startingMark: Mark): Mark {
  return other(resolveCpuMark(cpuSide, startingMark))
}
