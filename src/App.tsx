import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

import { Board3D } from './components/Board3D'
import { FocusBar } from './components/FocusBar'
import { IconCamera, IconCollapse, IconExpand, IconGear, IconUndo } from './components/Icons'
import { SettingsModal } from './components/SettingsModal'
import { chooseMove, DIFFICULTY_LABEL, THINKING_DELAY } from './game/ai'
import { useTicTacToe } from './game/hooks'
import { describeStatus } from './game/rules'
import {
  DEFAULT_SETTINGS,
  DIFFICULTIES,
  resolveCpuMark,
  settingsReducer,
  type SettingsState,
} from './game/settings'
import { loadPersisted, savePersisted } from './game/storage'
import { other, type Mark, type Scores } from './game/types'
import { usePrefersNarrowLayout, usePrefersReducedMotion } from './hooks/useMediaQuery'
import { useSound } from './hooks/useSound'
import type { ThemeColors, ThemeSettings } from './theme/palette'
import { uiTokens } from './theme/palette'
import {
  DEFAULT_THEME_ID,
  getPreset,
  randomThemeVariant,
  resolveTheme,
  THEME_PRESETS,
} from './theme/presets'

const AUTO_ADVANCE_MS = 4200
const EMPTY_SCORES: Scores = { X: 0, O: 0, draws: 0 }

function initSettings(saved: Partial<SettingsState> | undefined): SettingsState {
  return settingsReducer(DEFAULT_SETTINGS, { type: 'restore', settings: saved ?? {} })
}

function initTheme(saved: ThemeSettings | undefined): ThemeSettings {
  if (!saved || typeof saved.presetId !== 'string') return { presetId: DEFAULT_THEME_ID, colors: {} }
  return { presetId: getPreset(saved.presetId).id, colors: saved.colors ?? {} }
}

/** How many plies to roll back so the human is on move again. */
function pliesToUndo(plies: number, human: Mark | null, startingMark: Mark): number {
  if (plies <= 0) return 0
  if (!human) return 1
  for (let k = plies - 1; k >= 0; k -= 1) {
    const turnAt = k % 2 === 0 ? startingMark : other(startingMark)
    if (turnAt === human) return plies - k
  }
  return plies
}

export default function App() {
  const [persisted] = useState(loadPersisted)

  const [settings, dispatchSettings] = useReducer(
    settingsReducer,
    persisted.settings,
    initSettings,
  )
  const patchSettings = useCallback(
    (patch: Partial<SettingsState>) => dispatchSettings({ type: 'patch', patch }),
    [],
  )

  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(() => initTheme(persisted.theme))
  const palette = useMemo(() => resolveTheme(themeSettings), [themeSettings])
  const tokens = useMemo(() => uiTokens(palette), [palette])

  const [scores, setScores] = useState<Scores>(() => persisted.scores ?? EMPTY_SCORES)
  const [lastResult, setLastResult] = useState<Mark | 'draw' | null>(null)
  const [thinking, setThinking] = useState(false)
  const [cameraSignal, setCameraSignal] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const closeSettings = useCallback(() => setSettingsOpen(false), [])

  const systemReducedMotion = usePrefersReducedMotion()
  const narrowLayout = usePrefersNarrowLayout()
  const reduced = settings.motion === 'reduced' || (settings.motion === 'auto' && systemReducedMotion)
  const sound = useSound(settings.sound)

  const game = useTicTacToe('X')
  const cpuMark = settings.mode === 'cpu' ? resolveCpuMark(settings.cpuSide, game.startingMark) : null
  const humanMark = cpuMark ? other(cpuMark) : null

  /** Newest game/settings values, so long-lived listeners stay mounted. */
  const liveRef = useRef({ game, settings, cpuMark, humanMark, sound })
  liveRef.current = { game, settings, cpuMark, humanMark, sound }

  const pliesRef = useRef(0)
  const resolvedRef = useRef<string | null>(null)
  const autoTimerRef = useRef<number | null>(null)

  /* ---------------- theme actions ---------------- */

  const cycleTheme = useCallback((step: number) => {
    setThemeSettings((prev) => {
      const index = THEME_PRESETS.findIndex((preset) => preset.id === prev.presetId)
      const next = THEME_PRESETS[(index + step + THEME_PRESETS.length) % THEME_PRESETS.length]
      return { presetId: next.id, colors: {} }
    })
  }, [])

  /** Keeps the current scheme but re-rolls the mark and grid colours. */
  const shuffleTheme = useCallback(() => {
    setThemeSettings((prev) => {
      const variant = randomThemeVariant(getPreset(prev.presetId))
      const colors: ThemeColors = {
        accent: variant.accent,
        x: variant.x,
        o: variant.o,
        win: variant.win,
        gridLine: variant.gridLine,
      }
      return { ...prev, colors }
    })
  }, [])

  const resetTheme = useCallback(
    () => setThemeSettings({ presetId: DEFAULT_THEME_ID, colors: {} }),
    [],
  )

  /* ---------------- rounds ---------------- */

  const startRound = useCallback(
    (mark?: Mark) => {
      const rule = liveRef.current.settings.startingRule
      const next = mark ?? (rule === 'alternate' ? other(game.startingMark) : rule)
      game.newRound(next)
      setThinking(false)
      setLastResult(null)
      pliesRef.current = 0
      resolvedRef.current = null
    },
    [game],
  )

  const startRoundRef = useRef(startRound)
  startRoundRef.current = startRound

  const undo = useCallback(() => {
    const plies = pliesToUndo(game.plies, liveRef.current.humanMark, game.startingMark)
    if (plies <= 0) return
    setThinking(false)
    game.undo(plies)
  }, [game])

  const playIndex = useCallback((index: number) => {
    const live = liveRef.current
    const status = live.game.status
    if (status.kind === 'win') {
      live.sound.win(status.mark)
      return
    }
    if (status.kind === 'draw') {
      live.sound.draw()
      return
    }
    if (live.cpuMark && live.game.turn === live.cpuMark) return
    if (!live.game.canPlay(index)) {
      live.sound.invalid()
      return
    }
    void sound.resume()
    live.game.play(index)
  }, [sound])

  /* ---------------- fullscreen mode ---------------- */

  const enterFullscreen = useCallback(() => {
    patchSettings({ fullscreen: true })
    const root = document.documentElement
    if (typeof root.requestFullscreen === 'function') {
      root.requestFullscreen().catch(() => {})
    }
  }, [patchSettings])

  const exitFullscreen = useCallback(() => {
    patchSettings({ fullscreen: false })
    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
      document.exitFullscreen().catch(() => {})
    }
  }, [patchSettings])

  const toggleFullscreen = useCallback(() => {
    if (liveRef.current.settings.fullscreen) exitFullscreenRef.current()
    else enterFullscreenRef.current()
  }, [])

  const enterFullscreenRef = useRef(enterFullscreen)
  enterFullscreenRef.current = enterFullscreen
  const exitFullscreenRef = useRef(exitFullscreen)
  exitFullscreenRef.current = exitFullscreen
  const toggleFullscreenRef = useRef(toggleFullscreen)
  toggleFullscreenRef.current = toggleFullscreen

  // the browser's own Esc leaves fullscreen: keep our layout in sync with it
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && liveRef.current.settings.fullscreen) {
        dispatchSettings({ type: 'patch', patch: { fullscreen: false } })
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  /* ---------------- cpu turn ---------------- */

  const cpuEffectDeps = [cpuMark, game.board, game.turn, game.playable, game.status, reduced, settings.difficulty]

  useEffect(() => {
    if (!cpuMark || !game.playable || game.turn !== cpuMark) return

    setThinking(true)
    const thinkTime = reduced ? Math.min(THINKING_DELAY[settings.difficulty], 160) : THINKING_DELAY[settings.difficulty]
    const timer = window.setTimeout(() => {
      const live = liveRef.current
      const choice = chooseMove(live.game.board, cpuMark, live.settings.difficulty)
      setThinking(false)
      if (choice.index < 0) return
      live.game.play(choice.index)
    }, thinkTime)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, cpuEffectDeps)

  /* ---------------- feedback: sounds & result ---------------- */

  useEffect(() => {
    const plies = game.history.length
    const previous = pliesRef.current
    pliesRef.current = plies
    if (plies <= previous) return
    const mark = plies % 2 === 1 ? game.startingMark : other(game.startingMark)
    sound.move(mark)
  }, [game.history, game.startingMark, sound])

  useEffect(() => {
    const status = game.status
    if (status.kind === 'playing') {
      resolvedRef.current = null
      if (autoTimerRef.current !== null) {
        window.clearTimeout(autoTimerRef.current)
        autoTimerRef.current = null
      }
      return
    }

    // Scoring happens once per finished round; the rematch timer is re-armed so a
    // StrictMode remount or a settings tweak cannot lose the auto-advance.
    const key = `${game.startingMark}:${game.plies}:${status.kind}`
    if (resolvedRef.current !== key) {
      resolvedRef.current = key
      if (status.kind === 'win') {
        const winner = status.mark
        setScores((prev) => ({ ...prev, [winner]: prev[winner] + 1 }))
        setLastResult(winner)
        sound.win(winner)
      } else {
        setScores((prev) => ({ ...prev, draws: prev.draws + 1 }))
        setLastResult('draw')
        sound.draw()
      }
    }

    if (liveRef.current.settings.autoAdvance && autoTimerRef.current === null) {
      autoTimerRef.current = window.setTimeout(
        () => {
          autoTimerRef.current = null
          startRoundRef.current()
        },
        reduced ? 2200 : AUTO_ADVANCE_MS,
      )
    }
  }, [game.status, game.plies, game.startingMark, reduced, sound, settings.autoAdvance])

  useEffect(
    () => () => {
      if (autoTimerRef.current !== null) window.clearTimeout(autoTimerRef.current)
    },
    [],
  )

  /* ---------------- keyboard ---------------- */

  const undoRef = useRef(undo)
  undoRef.current = undo
  const cycleThemeRef = useRef(cycleTheme)
  cycleThemeRef.current = cycleTheme
  const settingsOpenRef = useRef(settingsOpen)
  settingsOpenRef.current = settingsOpen

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }

      const live = liveRef.current
      const key = event.key

      if (key >= '1' && key <= '9') {
        if (!live.game.playable) return
        playIndex(Number(key) - 1)
        event.preventDefault()
        return
      }

      switch (key.toLowerCase()) {
        case 'u':
          if (live.game.plies > 0) {
            undoRef.current()
            event.preventDefault()
          }
          break
        case 'n':
          startRoundRef.current()
          event.preventDefault()
          break
        case 't':
          cycleThemeRef.current(1)
          break
        case 'c':
          setCameraSignal((value) => value + 1)
          break
        case 'f':
          toggleFullscreenRef.current()
          break
        case 's':
          setSettingsOpen((open) => !open)
          event.preventDefault()
          break
        case 'escape':
          // while the settings dialog is up it owns Escape (its own listener closes it);
          // swallow the event here so one press never closes the modal and leaves fullscreen
          if (settingsOpenRef.current) {
            event.preventDefault()
          } else if (live.settings.fullscreen) {
            exitFullscreenRef.current()
            event.preventDefault()
          }
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [playIndex])

  /* ---------------- persistence ---------------- */

  useEffect(() => {
    savePersisted({ version: 1, settings, theme: themeSettings, scores })
  }, [settings, themeSettings, scores])

  /* ---------------- theme colours for the DOM ---------------- */

  const themeVars = useMemo(
    () =>
      ({
        '--bg-top': palette.background[0],
        '--bg-bottom': palette.background[1],
        '--frame': palette.boardFrame,
        '--tile': palette.tile,
        '--grid': palette.gridLine,
        '--x': palette.x,
        '--o': palette.o,
        '--win': palette.win,
        '--accent': palette.accent,
        '--shadow': palette.shadow,
        '--text': tokens.text,
        '--text-dim': tokens.textDim,
        '--surface': tokens.surface,
        '--surface-strong': tokens.surfaceStrong,
        '--border': tokens.border,
        '--border-strong': tokens.borderStrong,
        '--backdrop': tokens.backdrop,
        '--focus': tokens.focusRing,
      }) as CSSProperties,
    [palette, tokens],
  )

  /* ---------------- display text ---------------- */

  const finished = game.status.kind !== 'playing'
  const difficultyName = DIFFICULTY_LABEL[settings.difficulty]

  /** Who won, phrased for the mode that is being played. */
  function resultText(): string {
    const status = game.status
    if (status.kind !== 'win') return describeStatus(status)
    if (settings.mode === 'pvp' || !cpuMark) return `${status.mark} wins`
    return status.mark === cpuMark ? `CPU wins` : `You win`
  }

  const statusLabel = finished
    ? resultText()
    : thinking
      ? `CPU (${difficultyName}) is thinking…`
      : cpuMark
        ? game.turn === cpuMark
          ? `CPU (${cpuMark}) to move`
          : `You (${other(cpuMark)}) to move`
        : `${game.turn} to move`

  const tagline =
    settings.mode === 'cpu'
      ? `${difficultyName} CPU · you play ${humanMark ?? 'the other mark'}`
      : 'Two players, one board'

  const resultOverlay = finished ? (
    <div className="overlay" role="status">
      <p className="overlay-title">{resultText()}</p>
      <p className="overlay-copy">
        {settings.autoAdvance ? 'Another round is on its way.' : 'Take your time — the board waits.'}
      </p>
      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={() => startRound()}>
          Play again
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => startRound(game.startingMark)}>
          Same sides
        </button>
      </div>
    </div>
  ) : null

  const thinkingOverlay = !finished && thinking ? (
    <div className="thinking-overlay">
      <span className="spinner" aria-hidden="true" />
      CPU thinking…
    </div>
  ) : null

  const overlay = settings.fullscreen ? (
    <>
      <FocusBar
        statusLabel={statusLabel}
        turn={game.turn}
        sideLabel={cpuMark ? (cpuMark === game.turn ? 'CPU' : 'You') : null}
        scores={scores}
        canUndo={game.plies > 0}
        onNewRound={() => startRound()}
        onUndo={undo}
        onOpenControls={openSettings}
        onExitFullscreen={exitFullscreen}
      />
      {thinkingOverlay}
      {resultOverlay}
    </>
  ) : (
    resultOverlay ?? thinkingOverlay
  )

  return (
    <div
      className="app"
      style={themeVars}
      data-narrow={narrowLayout}
      data-fullscreen={settings.fullscreen}
    >
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            3D
          </span>
          <div>
            <h1 className="app-title">Tic Tac Toe 3D</h1>
            <p className="tagline">
              {tagline} · {palette.label}
            </p>
          </div>
        </div>
        <div className="app-actions">
          <button type="button" className="btn btn--primary" onClick={() => startRound()}>
            New round
          </button>
          <button
            type="button"
            className="btn btn--icon"
            onClick={undo}
            disabled={game.plies === 0}
            aria-label="Undo"
            title="Undo · U"
          >
            <IconUndo />
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={() => setCameraSignal((v) => v + 1)}
            aria-label="Reset camera"
            title="Reset camera · C"
          >
            <IconCamera />
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={toggleFullscreen}
            aria-pressed={settings.fullscreen}
            aria-label={settings.fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            title="Board-only mode · F"
          >
            {settings.fullscreen ? <IconCollapse /> : <IconExpand />}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={openSettings}
            aria-label="Settings"
            title="Match, appearance and motion options · S"
          >
            <IconGear />
          </button>
        </div>
      </header>

      <div className="status-bar">
        <span className="status-text">{statusLabel}</span>
        {cpuMark ? (
          <span className="turn-badge" data-mark={game.turn} key={game.turn}>
            {cpuMark === game.turn ? 'CPU' : 'You'}
          </span>
        ) : null}
        {thinking && !finished ? (
          <span className="thinking-badge">
            <span className="spinner" aria-hidden="true" />
            thinking
          </span>
        ) : null}
        <span className="status-chip">
          X {scores.X} · O {scores.O} · draws {scores.draws}
        </span>
      </div>

      <main className="app-main">
        <section className="board-col">
          <Board3D
            board={game.board}
            status={game.status}
            turn={game.turn}
            playable={game.playable}
            palette={palette}
            camera={settings.camera}
            boardDesign={settings.boardDesign}
            reducedMotion={reduced}
            bloom={settings.post}
            guides={settings.showGuides}
            onCellTap={playIndex}
            resetCameraSignal={cameraSignal}
            overlay={overlay}
          />
          <div className="board-toolbar">
            {settings.mode === 'cpu' ? (
              <div className="diff-chips mobile-only" role="group" aria-label="CPU difficulty">
                {DIFFICULTIES.map((level) => (
                  <button
                    key={level}
                    type="button"
                    className="chip"
                    data-active={settings.difficulty === level}
                    onClick={() => patchSettings({ difficulty: level })}
                  >
                    {DIFFICULTY_LABEL[level]}
                  </button>
                ))}
              </div>
            ) : null}
            <p className="toolbar-note">
              Click or tap a square to play · drag to orbit the camera · pinch or wheel to zoom
              {narrowLayout ? null : (
                <>
                  {' · '}
                  <kbd>1</kbd>-<kbd>9</kbd> play · <kbd>U</kbd> undo · <kbd>N</kbd> new round ·{' '}
                  <kbd>F</kbd> fullscreen · <kbd>S</kbd> settings · <kbd>T</kbd> theme · <kbd>C</kbd> camera
                </>
              )}
            </p>
          </div>
        </section>
      </main>

      {settingsOpen ? (
        <SettingsModal
          settings={settings}
          onSettings={patchSettings}
          themeSettings={themeSettings}
          onThemeSettings={setThemeSettings}
          palette={palette}
          systemReducedMotion={systemReducedMotion}
          scores={scores}
          cpuMark={cpuMark}
          lastResult={lastResult}
          canUndo={game.plies > 0}
          onNewRound={() => startRound()}
          onUndo={undo}
          onResetScores={() => {
            setScores(EMPTY_SCORES)
            setLastResult(null)
          }}
          onShuffleTheme={shuffleTheme}
          onResetTheme={resetTheme}
          onClose={closeSettings}
        />
      ) : null}

      <footer className="app-footer">
        React · three.js · minimax with alpha-beta pruning · {difficultyName} CPU
        {settings.mode === 'pvp' ? ' off' : ''}
      </footer>
    </div>
  )
}
