import { describe, expect, it } from 'vitest'

import { CUSTOM_COLOR_KEYS, applyCustomColors, uiTokens } from '../src/theme/palette'
import { isHexColor } from '../src/theme/colors'
import {
  DEFAULT_THEME_ID,
  THEME_PRESETS,
  getPreset,
  presetOptions,
  randomThemeVariant,
  resolveTheme,
} from '../src/theme/presets'

const HEX = /^#[0-9a-fA-F]{6}$/

const colourFields = [
  'boardFrame',
  'tile',
  'tileHover',
  'gridLine',
  'x',
  'o',
  'win',
  'accent',
  'shadow',
] as const

describe('theme presets', () => {
  it('ships a handful of well-formed schemes', () => {
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(6)

    const ids = THEME_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const preset of THEME_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(1)
      expect(preset.background).toHaveLength(2)
      for (const hex of [...preset.background, ...colourFields.map((key) => preset[key])]) {
        expect(hex, `${preset.id} ${hex}`).toMatch(HEX)
      }
      expect(preset.bloom.strength).toBeGreaterThanOrEqual(0)
      expect(preset.exposure).toBeGreaterThan(0)
    }
  })

  it('defaults to a preset that actually exists', () => {
    expect(THEME_PRESETS.map((preset) => preset.id)).toContain(DEFAULT_THEME_ID)
    expect(getPreset('not-a-real-theme').id).toBe(THEME_PRESETS[0].id)
  })

  it('offers swatches for the theme picker', () => {
    const options = presetOptions()
    expect(options).toHaveLength(THEME_PRESETS.length)
    for (const option of options) {
      expect(option.swatch.length).toBeGreaterThanOrEqual(3)
      expect(option.description.length).toBeGreaterThan(0)
    }
  })
})

describe('custom colours', () => {
  it('overwrites only what you pick', () => {
    const base = getPreset(DEFAULT_THEME_ID)
    const mixed = applyCustomColors(base, { x: '#ff0000', o: '#00ff00' })

    expect(mixed.x).toBe('#ff0000')
    expect(mixed.o).toBe('#00ff00')
    expect(mixed.tile).toBe(base.tile)
    expect(mixed.background).toEqual(base.background)
    expect(mixed.id).toBe(`${base.id}-custom`)
  })

  it('derives the tile hover and the shadow from the colours you set', () => {
    const base = getPreset(DEFAULT_THEME_ID)
    const mixed = applyCustomColors(base, { tile: '#203040', accent: '#ff8800' })

    expect(mixed.tile).toBe('#203040')
    expect(mixed.tileHover).not.toBe(mixed.tile)
    expect(isHexColor(mixed.tileHover)).toBe(true)
    expect(isHexColor(mixed.shadow)).toBe(true)
    expect(mixed.accent).toBe('#ff8800')
  })

  it('accepts every key the sidebar exposes', () => {
    const base = getPreset('arctic')
    const colors = Object.fromEntries(CUSTOM_COLOR_KEYS.map(({ key }) => [key, '#123456']))
    const mixed = applyCustomColors(base, colors)

    expect(mixed.background).toEqual(['#123456', '#123456'])
    for (const key of ['boardFrame', 'tile', 'gridLine', 'x', 'o', 'win', 'accent'] as const) {
      expect(mixed[key]).toBe('#123456')
    }
  })

  it('shuffles the marks but keeps the mood of the preset', () => {
    const base = getPreset(DEFAULT_THEME_ID)
    const variant = randomThemeVariant(base, () => 0.25)

    expect(variant.background).toEqual(base.background)
    expect(variant.x).not.toBe(base.x)
    expect(variant.o).not.toBe(base.o)
    expect(HEX.test(variant.x)).toBe(true)
    expect(HEX.test(variant.o)).toBe(true)
  })
})

describe('resolveTheme', () => {
  it('returns the preset untouched when nothing is overridden', () => {
    const palette = resolveTheme({ presetId: 'arctic', colors: {} })
    expect(palette.id).toBe('arctic')
    expect(palette.x).toBe(getPreset('arctic').x)
  })

  it('layers the overrides on top of the preset', () => {
    const palette = resolveTheme({ presetId: 'arctic', colors: { win: '#abcdef' } })
    expect(palette.win).toBe('#abcdef')
    expect(palette.id).toBe('arctic-custom')
  })
})

describe('ui tokens', () => {
  it('writes text that reads against the darkest background band', () => {
    const tokens = uiTokens(getPreset('mono-graphite'))
    expect(HEX.test(tokens.text)).toBe(true)
    expect(tokens.text.toLowerCase()).not.toBe('null')
    expect(tokens.text).not.toBe(tokens.textDim)
  })

  it('produces translucent panels so the 3D board shows through', () => {
    const tokens = uiTokens(getPreset('arctic'))
    expect(tokens.surface).toContain('rgba(')
    expect(tokens.surfaceStrong).toContain('rgba(')
    expect(tokens.border).toContain('rgba(')
    expect(tokens.focusRing).toBe(getPreset('arctic').accent)
  })
})
