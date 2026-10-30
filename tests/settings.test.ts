import { describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS, settingsReducer } from '../src/game/settings'
import type { BoardDesign } from '../src/game/settings'

describe('board design setting', () => {
  it('defaults to the classic slate', () => {
    expect(DEFAULT_SETTINGS.boardDesign).toBe('classic')
  })

  it('accepts the four built-in designs', () => {
    for (const design of ['classic', 'carved', 'floating', 'neon'] as const) {
      const next = settingsReducer(DEFAULT_SETTINGS, { type: 'patch', patch: { boardDesign: design } })
      expect(next.boardDesign).toBe(design)
    }
  })

  it('ignores unknown design values', () => {
    const bogus = 'spaceship' as unknown as BoardDesign
    const next = settingsReducer(DEFAULT_SETTINGS, { type: 'patch', patch: { boardDesign: bogus } })
    expect(next.boardDesign).toBe('classic')
  })

  it('restores a persisted design alongside the other settings', () => {
    const next = settingsReducer(DEFAULT_SETTINGS, {
      type: 'restore',
      settings: { boardDesign: 'floating', difficulty: 'easy', fullscreen: true },
    })
    expect(next.boardDesign).toBe('floating')
    expect(next.difficulty).toBe('easy')
    expect(next.fullscreen).toBe(true)
    expect(next.mode).toBe(DEFAULT_SETTINGS.mode)
  })
})
