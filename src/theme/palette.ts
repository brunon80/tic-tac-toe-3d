import { darken, lighten, mix, readableOn, rgbaString } from './colors'

/** Colours the three.js scene uses. All hex strings. */
export interface SceneLook {
  background: readonly [string, string]
  boardFrame: string
  tile: string
  tileHover: string
  gridLine: string
  x: string
  o: string
  win: string
  accent: string
  shadow: string
  exposure: number
  emissive: number
  ambientIntensity: number
  keyIntensity: number
  rimIntensity: number
  metalness: number
  roughness: number
  bloom: { strength: number; radius: number; threshold: number }
}

export interface ThemePalette extends SceneLook {
  id: string
  label: string
  description: string
}

export type CustomColorKey =
  | 'backgroundTop'
  | 'backgroundBottom'
  | 'boardFrame'
  | 'tile'
  | 'gridLine'
  | 'x'
  | 'o'
  | 'win'
  | 'accent'

export const CUSTOM_COLOR_KEYS: readonly { key: CustomColorKey; label: string }[] = [
  { key: 'backgroundTop', label: 'Sky' },
  { key: 'backgroundBottom', label: 'Ground' },
  { key: 'boardFrame', label: 'Frame' },
  { key: 'tile', label: 'Tiles' },
  { key: 'gridLine', label: 'Grid' },
  { key: 'x', label: 'X pieces' },
  { key: 'o', label: 'O pieces' },
  { key: 'win', label: 'Winning line' },
  { key: 'accent', label: 'Accent' },
]

export const COLOR_TO_SCENE: Record<CustomColorKey, keyof SceneLook> = {
  backgroundTop: 'background',
  backgroundBottom: 'background',
  boardFrame: 'boardFrame',
  tile: 'tile',
  gridLine: 'gridLine',
  x: 'x',
  o: 'o',
  win: 'win',
  accent: 'accent',
}

export type ThemeColors = Partial<Record<CustomColorKey, string>>

export interface ThemeSettings {
  presetId: string
  colors: ThemeColors
}

/** Applies the user's custom colours on top of a preset, keeping derived effects in sync. */
export function applyCustomColors(base: ThemePalette, colors: ThemeColors): ThemePalette {
  const background: [string, string] = [
    colors.backgroundTop ?? base.background[0],
    colors.backgroundBottom ?? base.background[1],
  ]
  const overrides: Partial<SceneLook> = {}

  if (colors.boardFrame) overrides.boardFrame = colors.boardFrame
  if (colors.tile) {
    overrides.tile = colors.tile
    overrides.tileHover = lighten(colors.tile, 0.18)
  }
  if (colors.gridLine) overrides.gridLine = colors.gridLine
  if (colors.x) overrides.x = colors.x
  if (colors.o) overrides.o = colors.o
  if (colors.win) overrides.win = colors.win
  if (colors.accent) {
    overrides.accent = colors.accent
    overrides.win = colors.win ?? colors.accent
    overrides.gridLine = colors.gridLine ?? lighten(colors.accent, 0.1)
  }

  const blended: ThemePalette = {
    ...base,
    ...overrides,
    background,
    shadow: darken(background[1], 0.55),
    id: `${base.id}-custom`,
    label: `${base.label} (custom)`,
  }
  return blended
}

export interface UiTokens {
  text: string
  textDim: string
  surface: string
  surfaceStrong: string
  border: string
  borderStrong: string
  focusRing: string
  backdrop: string
}

export function uiTokens(palette: ThemePalette): UiTokens {
  const ground = palette.background[1]
  const text = readableOn(ground)
  const surface = mix(ground, text, 0.07)
  return {
    text,
    textDim: mix(text, ground, 0.42),
    surface: rgbaString(surface, 0.72),
    surfaceStrong: rgbaString(mix(ground, text, 0.13), 0.86),
    border: rgbaString(mix(ground, text, 0.28), 0.6),
    borderStrong: rgbaString(mix(ground, text, 0.45), 0.8),
    focusRing: palette.accent,
    backdrop: rgbaString(palette.shadow, 0.45),
  }
}
