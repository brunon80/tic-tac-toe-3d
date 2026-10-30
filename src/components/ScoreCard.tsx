import { DIFFICULTY_LABEL } from '../game/ai'
import type { Difficulty, Scores } from '../game/types'
import type { GameMode, Mark } from '../game/types'

export interface ScoreCardProps {
  scores: Scores
  mode: GameMode
  cpuMark: Mark | null
  difficulty: Difficulty
  lastResult: Mark | 'draw' | null
}

/** Points tally: one row per side plus draws. */
export function ScoreCard({ scores, mode, cpuMark, difficulty, lastResult }: ScoreCardProps) {
  const labelFor = (mark: Mark) => {
    if (mode === 'pvp') return `Player ${mark}`
    return cpuMark === mark ? `CPU · ${DIFFICULTY_LABEL[difficulty]}` : `You (${mark})`
  }

  const row = (mark: Mark) => {
    const wins = scores[mark]
    const active = lastResult === mark
    return (
      <div className={`score-row${active ? ' score-row--live' : ''}`} key={mark}>
        <span className="score-mark" data-mark={mark}>
          {mark}
        </span>
        <span className="score-label">{labelFor(mark)}</span>
        <span className="score-value">{wins}</span>
      </div>
    )
  }

  return (
    <section className="panel panel--scores" aria-label="Match score">
      <header className="panel-head">
        <h2>Score</h2>
        <span className="panel-hint">Rounds won</span>
      </header>
      <div className="score-list">
        {row('X')}
        {row('O')}
        <div className={`score-row score-row--draw${lastResult === 'draw' ? ' score-row--live' : ''}`}>
          <span className="score-mark score-mark--draw">·</span>
          <span className="score-label">Draws</span>
          <span className="score-value">{scores.draws}</span>
        </div>
      </div>
    </section>
  )
}
