import type { Mark, Scores } from '../game/types'

export interface FocusBarProps {
  statusLabel: string
  turn: Mark
  /** 'CPU' / 'You' in cpu mode, null in two-player mode. */
  sideLabel: 'CPU' | 'You' | null
  scores: Scores
  canUndo: boolean
  onNewRound: () => void
  onUndo: () => void
  onOpenControls: () => void
  onExitFullscreen: () => void
}

/**
 * Compact heads-up strip for fullscreen mode: the status line, the score and the few
 * actions you can reach without leaving the board. The rest of the page chrome stays hidden.
 */
export function FocusBar({
  statusLabel,
  turn,
  sideLabel,
  scores,
  canUndo,
  onNewRound,
  onUndo,
  onOpenControls,
  onExitFullscreen,
}: FocusBarProps) {
  return (
    <div className="hud-bar">
      <span className="hud-status" aria-live="polite">
        {statusLabel}
        {sideLabel ? (
          <span className="turn-badge" data-mark={turn} key={turn}>
            {sideLabel}
          </span>
        ) : null}
      </span>

      <span className="hud-score" aria-label="Match score">
        <b data-mark="X">X {scores.X}</b>
        <span className="hud-sep" aria-hidden="true">
          ·
        </span>
        <b data-mark="O">O {scores.O}</b>
        <span className="hud-sep" aria-hidden="true">
          ·
        </span>
        <span className="hud-dim">draws {scores.draws}</span>
      </span>

      <div className="btn-row hud-actions">
        <button type="button" className="btn btn--primary" onClick={onNewRound}>
          New
        </button>
        <button type="button" className="btn" onClick={onUndo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" className="btn btn--ghost" onClick={onOpenControls}>
          Settings
        </button>
        <button type="button" className="btn btn--ghost" onClick={onExitFullscreen}>
          Exit fullscreen
        </button>
      </div>
    </div>
  )
}
