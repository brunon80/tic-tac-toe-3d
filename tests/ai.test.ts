import { describe, expect, it } from 'vitest'

import {
  chooseMove,
  DIFFICULTY_HINT,
  DIFFICULTY_LABEL,
  DIFFICULTY_PROFILE,
  rootMoves,
  THINKING_DELAY,
} from '../src/game/ai'
import { applyMove, evaluateStatus, findingMove } from '../src/game/rules'
import { emptyCells, other } from '../src/game/types'
import type { Board, Difficulty, Mark } from '../src/game/types'

/** Reads a board from nine characters, e.g. 'X.O..X...' (X, O, dot = empty). */
function boardWith(spec: string): Board {
  if (spec.length !== 9) throw new Error(`spec must be 9 characters, got ${spec}`)
  const board: Board = new Array(9).fill(null)
  spec.split('').forEach((char, index) => {
    if (char === 'X' || char === 'O') board[index] = char
  })
  return board
}

/** A rng that never triggers a blunder roll and always picks the last candidate. */
function diligentRng(): () => number {
  return () => 0.999
}

/** Small deterministic rng so games can be replayed. */
function seedRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

type Outcome = 'cpu-win' | 'human-win' | 'draw'

interface DuelOptions {
  cpu: Mark
  difficulty: Difficulty
  cpuRng: () => number
  humanRng: () => number
  /** When true the human takes wins and blocks; when false it plays anywhere legal. */
  humanCareful?: boolean
}

function duel(options: DuelOptions): Outcome {
  const board = new Array<Mark | null>(9).fill(null)
  let turn: Mark = 'X'

  while (true) {
    const status = evaluateStatus(board)
    if (status.kind === 'win') return status.mark === options.cpu ? 'cpu-win' : 'human-win'
    if (status.kind === 'draw') return 'draw'

    const move =
      turn === options.cpu
        ? chooseMove(board, options.cpu, options.difficulty, { rng: options.cpuRng }).index
        : carefulMove(board, turn, options.humanRng, options.humanCareful ?? true)

    if (move < 0) return 'draw'
    board[move] = turn
    turn = other(turn)
  }
}

/** Human model: win if possible, block if needed, otherwise play randomly. */
function carefulMove(board: Board, mark: Mark, rng: () => number, careful: boolean): number {
  const cells = emptyCells(board)
  if (!careful) return cells[Math.floor(rng() * cells.length)] ?? -1

  const win = findingMove(board, mark)
  if (win !== null) return win
  const open = emptyCells(board)
  for (const index of open) {
    const next = applyMove(board, index, mark)
    if (evaluateStatus(next).kind === 'win') return index
  }
  const blocked = findingMove(board, other(mark))
  if (blocked !== null) return blocked
  return open[Math.floor(rng() * open.length)] ?? -1
}

describe('rootMoves', () => {
  it('lists every legal square, best score first', () => {
    const moves = rootMoves(new Array<Mark | null>(9).fill(null), 'X', 5)
    expect(moves).toHaveLength(9)
    for (let i = 1; i < moves.length; i += 1) expect(moves[i - 1].score).toBeGreaterThanOrEqual(moves[i].score)
  })

  it('prefers the move that wins immediately', () => {
    const board = boardWith('XX...O...')
    const moves = rootMoves(board, 'X', 5)
    expect(moves[0].index).toBe(2)
    expect(moves[0].score).toBeGreaterThan(0)
  })
})

describe('chooseMove', () => {
  it('takes the win in front of it', () => {
    for (const difficulty of ['medium', 'hard', 'unbeatable'] as Difficulty[]) {
      const choice = chooseMove(boardWith('XX...O...'), 'X', difficulty, { rng: diligentRng() })
      expect(choice.index, `${difficulty}: take the win`).toBe(2)
    }
  })

  it('blocks a line the opponent is about to complete', () => {
    // O already owns 0 and 1, so X must fill 2 or lose next move.
    const board = boardWith('OO..X....')
    for (const difficulty of ['medium', 'hard', 'unbeatable'] as Difficulty[]) {
      const choice = chooseMove(board, 'X', difficulty, { rng: diligentRng() })
      expect(choice.index, `${difficulty}: block the threat`).toBe(2)
    }
  })

  it('blocks the diagonal threat too', () => {
    // O owns 0 and 4; the only square that stops 0-4-8 is 8.
    const board = boardWith('O.X.O....')
    const choice = chooseMove(board, 'X', 'hard', { rng: diligentRng() })
    expect(choice.index).toBe(8)
  })

  it('plays a legal square on easy', () => {
    const board = boardWith('X.O......')
    const choice = chooseMove(board, 'X', 'easy', { rng: seedRng(7) })
    expect(['search', 'random']).toContain(choice.reason)
    expect(emptyCells(board)).toContain(choice.index)
  })

  it('makes easy the most permissive level', () => {
    const blunders = ['easy', 'medium', 'hard', 'unbeatable'].map((level) => DIFFICULTY_PROFILE[level as Difficulty].blunder)
    expect(blunders[0]).toBeGreaterThan(blunders[1])
    expect(blunders[3]).toBe(0)
    expect(DIFFICULTY_PROFILE.easy.blunderPool).toBe('open')
    expect(DIFFICULTY_PROFILE.unbeatable.maxPlies).toBe(9)
  })

  it('returns -1 when nothing is playable', () => {
    const choice = chooseMove(boardWith('XOXXOOOXX'), 'X', 'hard', { rng: diligentRng() })
    expect(choice.index).toBe(-1)
  })
})

describe('difficulty levels', () => {
  it('never loses when set to unbeatable, as either mark', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      for (const cpu of ['X', 'O'] as Mark[]) {
        const outcome = duel({
          cpu,
          difficulty: 'unbeatable',
          cpuRng: seedRng(seed * 3),
          humanRng: seedRng(seed * 7 + 1),
        })
        expect(outcome, `seed ${seed}, cpu ${cpu}`).not.toBe('human-win')
      }
    }
  })

  it('punishes a careless human', () => {
    let wins = 0
    for (let seed = 1; seed <= 8; seed += 1) {
      const outcome = duel({
        cpu: 'X',
        difficulty: 'unbeatable',
        cpuRng: seedRng(seed * 11),
        humanRng: seedRng(seed * 13),
        humanCareful: false,
      })
      if (outcome === 'cpu-win') wins += 1
    }
    expect(wins).toBeGreaterThanOrEqual(6)
  })

  it('searchs deeper on hard and unbeatable than on the shallower levels', () => {
    const plyCap = (level: Difficulty) => DIFFICULTY_PROFILE[level].maxPlies
    expect(plyCap('easy')).toBeLessThan(plyCap('hard'))
    expect(plyCap('hard')).toBeLessThanOrEqual(plyCap('unbeatable'))
    expect(THINKING_DELAY.hard).toBeLessThan(THINKING_DELAY.unbeatable)
  })

  it('keeps the difficulty copy consistent with the labels', () => {
    expect(Object.keys(DIFFICULTY_LABEL)).toHaveLength(4)
    expect(Object.keys(DIFFICULTY_HINT)).toEqual(Object.keys(DIFFICULTY_LABEL))
  })
})
