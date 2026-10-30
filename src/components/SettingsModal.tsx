import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { ScoreCard } from './ScoreCard'
import { DIFFICULTY_HINT, DIFFICULTY_LABEL } from '../game/ai'
import { CPU_SIDES, DIFFICULTIES } from '../game/settings'
import type { BoardDesign, CameraMode, MotionMode, SettingsState, StartingRule } from '../game/settings'
import type { CpuSide, GameMode, Mark, Scores } from '../game/types'
import { CUSTOM_COLOR_KEYS } from '../theme/palette'
import type { CustomColorKey, ThemePalette, ThemeSettings } from '../theme/palette'
import { presetOptions } from '../theme/presets'

export interface SettingsModalProps {
  settings: SettingsState
  onSettings: (patch: Partial<SettingsState>) => void
  themeSettings: ThemeSettings
  onThemeSettings: (next: ThemeSettings) => void
  palette: ThemePalette
  systemReducedMotion: boolean
  scores: Scores
  cpuMark: Mark | null
  lastResult: Mark | 'draw' | null
  canUndo: boolean
  onNewRound: () => void
  onUndo: () => void
  onResetScores: () => void
  onShuffleTheme: () => void
  onResetTheme: () => void
  onClose: () => void
}

type SectionId = 'match' | 'appearance' | 'motion'

const SECTIONS: { id: SectionId; label: string; hint: string }[] = [
  { id: 'match', label: 'Match', hint: 'Sides, difficulty, score' },
  { id: 'appearance', label: 'Appearance', hint: 'Theme, colours, board' },
  { id: 'motion', label: 'Motion & sound', hint: 'Effects and camera' },
]

/**
 * The one place every game control lives: a dialog with its own section sidebar.
 * Only the selected section is mounted, so each screen stays uncluttered.
 */
export function SettingsModal(props: SettingsModalProps) {
  const { onClose } = props
  const [section, setSection] = useState<SectionId>('match')
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return (
    <div
      className="settings-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
        <header className="settings-head">
          <h2>Settings</h2>
          <button type="button" className="settings-close" aria-label="Close settings" onClick={onClose} ref={closeRef}>
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={section === item.id ? 'true' : 'false'}
                onClick={() => setSection(item.id)}
              >
                <span className="settings-nav-label">{item.label}</span>
                <span className="settings-nav-hint">{item.hint}</span>
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {section === 'match' ? <MatchSection {...props} /> : null}
            {section === 'appearance' ? <AppearanceSection {...props} /> : null}
            {section === 'motion' ? <MotionSection {...props} /> : null}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ------------------------------ sections ------------------------------ */

function MatchSection(props: SettingsModalProps) {
  const { settings, onSettings } = props
  const cpuMode = settings.mode === 'cpu'

  return (
    <div className="modal-section">
      <ScoreCard
        scores={props.scores}
        mode={settings.mode}
        cpuMark={props.cpuMark}
        difficulty={settings.difficulty}
        lastResult={props.lastResult}
      />

      <section className="panel" aria-label="Match settings">
        <Field label="Players">
          <Segmented
            legend="Players"
            value={settings.mode}
            options={[
              { value: 'cpu', label: 'vs CPU' },
              { value: 'pvp', label: '2 players' },
            ]}
            onChange={(mode: GameMode) => onSettings({ mode })}
          />
        </Field>

        {cpuMode ? (
          <>
            <Field label="Difficulty" hint={DIFFICULTY_HINT[settings.difficulty]}>
              <Segmented
                legend="CPU difficulty"
                value={settings.difficulty}
                options={DIFFICULTIES.map((difficulty) => ({
                  value: difficulty,
                  label: DIFFICULTY_LABEL[difficulty],
                }))}
                onChange={(difficulty) => onSettings({ difficulty })}
              />
            </Field>

            <Field label="CPU mark" hint="You take the other mark">
              <Segmented
                legend="CPU mark"
                value={settings.cpuSide}
                options={CPU_SIDES.map((side: CpuSide) => ({
                  value: side,
                  label: side === 'random' ? 'Coin flip' : `CPU ${side}`,
                }))}
                onChange={(cpuSide) => onSettings({ cpuSide })}
              />
            </Field>
          </>
        ) : null}

        <Field label="Opening mark" hint="Applies from the next round on">
          <Segmented
            legend="Opening mark"
            value={settings.startingRule}
            options={[
              { value: 'X', label: 'X starts' },
              { value: 'O', label: 'O starts' },
              { value: 'alternate', label: 'Alternate' },
            ]}
            onChange={(startingRule: StartingRule) => onSettings({ startingRule })}
          />
        </Field>

        <Toggle
          checked={settings.autoAdvance}
          label="Play the next round automatically"
          onChange={(autoAdvance) => onSettings({ autoAdvance })}
        />
      </section>

      <section className="panel panel--actions" aria-label="Round actions">
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={props.onNewRound}>
            New round
          </button>
          <button type="button" className="btn" onClick={props.onUndo} disabled={!props.canUndo}>
            Undo
          </button>
        </div>
        <button type="button" className="btn btn--ghost" onClick={props.onResetScores}>
          Reset score
        </button>
        <p className="panel-note">
          Keys <kbd>1</kbd>-<kbd>9</kbd> play a square · <kbd>U</kbd> undo · <kbd>N</kbd> new round
        </p>
      </section>
    </div>
  )
}

function AppearanceSection(props: SettingsModalProps) {
  const { settings, onSettings, themeSettings, onThemeSettings, palette } = props

  return (
    <div className="modal-section">
      <section className="panel" aria-label="Appearance settings">
        <Field label="Theme scheme" hint={palette.label}>
          <div className="theme-grid" role="group" aria-label="Theme presets">
            {presetOptions().map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="theme-card"
                data-active={themeSettings.presetId === preset.id}
                title={preset.description}
                onClick={() => onThemeSettings({ ...themeSettings, presetId: preset.id })}
              >
                <span className="theme-swatches" aria-hidden="true">
                  {preset.swatch.map((color, index) => (
                    <span key={`${index}-${color}`} className="swatch" style={{ background: color }} />
                  ))}
                </span>
                <span className="theme-card-label">{preset.label}</span>
              </button>
            ))}
          </div>
        </Field>

        <div className="btn-row">
          <button type="button" className="btn" onClick={props.onShuffleTheme}>
            Shuffle colours
          </button>
          <button type="button" className="btn btn--ghost" onClick={props.onResetTheme}>
            Reset theme
          </button>
        </div>

        <Field label="Custom colours" hint="Overrides the preset">
          <div className="colour-grid">
            {CUSTOM_COLOR_KEYS.map(({ key, label }) => (
              <label key={key} className="colour-field">
                <input
                  type="color"
                  aria-label={label}
                  value={swatchHex(key, palette)}
                  onChange={(event) =>
                    onThemeSettings({
                      ...themeSettings,
                      colors: { ...themeSettings.colors, [key]: event.target.value },
                    })
                  }
                />
                <span className="colour-label">{label}</span>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Board design" hint="Four built-in 3D architectures, live swap">
          <Segmented
            legend="Board design"
            value={settings.boardDesign}
            options={BOARD_DESIGNS}
            onChange={(boardDesign) => onSettings({ boardDesign })}
          />
        </Field>

        <Toggle
          checked={settings.showGuides}
          label="Ghost preview and cell guides"
          onChange={(showGuides) => onSettings({ showGuides })}
        />
      </section>
    </div>
  )
}

function MotionSection(props: SettingsModalProps) {
  const { settings, onSettings } = props

  return (
    <div className="modal-section">
      <section className="panel" aria-label="Motion and sound settings">
        <Field
          label="Motion"
          hint={
            props.systemReducedMotion
              ? 'Your system asks for reduced motion'
              : 'Piece drops, winning beam, camera drift'
          }
        >
          <Segmented
            legend="Motion"
            value={settings.motion}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'full', label: 'Full' },
              { value: 'reduced', label: 'Reduced' },
            ]}
            onChange={(motion: MotionMode) => onSettings({ motion })}
          />
        </Field>

        <Field label="Camera" hint="Drag the board to look around">
          <Segmented
            legend="Camera"
            value={settings.camera}
            options={[
              { value: 'orbit', label: 'Free look' },
              { value: 'locked', label: 'Fixed' },
            ]}
            onChange={(camera: CameraMode) => onSettings({ camera })}
          />
        </Field>

        <Toggle
          checked={settings.post}
          label="Bloom glow"
          hint="Turn off on weak hardware for a better frame rate"
          onChange={(post) => onSettings({ post })}
        />
        <Toggle checked={settings.sound} label="Sound" onChange={(sound) => onSettings({ sound })} />
      </section>
    </div>
  )
}

/* ------------------------------ controls ------------------------------ */

const BOARD_DESIGNS: { value: BoardDesign; label: string }[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'carved', label: 'Carved' },
  { value: 'floating', label: 'Floating' },
  { value: 'neon', label: 'Neon' },
]

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-head">
        <span className="field-label">{label}</span>
        {hint ? <span className="field-hint">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}

function Segmented<T extends string>(props: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  legend: string
}) {
  return (
    <div className="segmented" role="group" aria-label={props.legend}>
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="chip"
          data-active={props.value === option.value}
          onClick={() => props.onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Toggle(props: {
  checked: boolean
  label: string
  hint?: string
  onChange: (value: boolean) => void
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-dot" />
      </span>
      <span className="toggle-copy">
        <span className="toggle-label">{props.label}</span>
        {props.hint ? <span className="toggle-hint">{props.hint}</span> : null}
      </span>
    </label>
  )
}

/** Current value of a custom colour key as it is applied to the scene. */
function swatchHex(key: CustomColorKey, palette: ThemePalette): string {
  switch (key) {
    case 'backgroundTop':
      return palette.background[0]
    case 'backgroundBottom':
      return palette.background[1]
    default:
      return palette[key]
  }
}
