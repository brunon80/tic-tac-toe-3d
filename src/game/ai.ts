import { applyMove, findWin, findingMove } from './rules'
import type { Board, Difficulty, Mark } from './types'
import { MAX_PLIES, emptyCells, isFull, other } from './types'

export type MoveReason = 'random' | 'search' | 'tactic'

export interface RankedMove {
  index: number
  score: number
}

export interface MoveChoice {
  index: number
  reason: MoveReason
  depth: number
}

export interface MoveOptions {
  rng?: () => number
}

export interface DifficultyProfile {
  /** Plies the search looks ahead. 9 means the whole game tree. */
  maxPlies: number
  /** Chance of playing something other than the best move. */
  blunder: number
  /** 'open' wanders into any legal square, 'tier' stays close to the best move. */
  blunderPool: 'open' | 'tier'
}

const WIN_SCORE = 1_000_000

/** Center first, then corners, then edges: better pruning and more natural looking play. */
const MOVE_ORDER = [4, 0, 2, 8, 6, 1, 3, 5, 7]

interface SearchState {
  maxPlies: number
  nodes: number
}

function legalMoveOrder(board: Board): number[] {
  return MOVE_ORDER.filter((index) => board[index] === null)
}

/**
 * Negamax with alpha-beta pruning. The value is from the point of view of `turn`, the player to
 * move: a finished position is checked before the depth cap, so a win is never confused with the
 * horizon.
 */
function search(
  board: Board,
  turn: Mark,
  alpha: number,
  beta: number,
  ply: number,
  state: SearchState,
): number {
  state.nodes += 1

  const win = findWin(board)
  if (win) return win.mark === turn ? WIN_SCORE - ply : ply - WIN_SCORE
  if (isFull(board)) return 0
  // Depth limit: a search that has not reached a result yet calls the position even.
  if (ply >= state.maxPlies) return 0

  let best = -Infinity
  for (const index of legalMoveOrder(board)) {
    const score = -search(applyMove(board, index, turn), other(turn), -beta, -alpha, ply + 1, state)
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

/**
 * Every legal square scored from the AI's point of view, best first. Each reply gets a full window
 * so the numbers are comparable: pruning still happens inside the subtrees, but a reply that loses
 * is never made to look like a draw the way a narrow root window would report it.
 */
export function rootMoves(board: Board, aiMark: Mark, maxPlies: number): RankedMove[] {
  const state: SearchState = { maxPlies, nodes: 0 }
  const ranked: RankedMove[] = []

  for (const index of legalMoveOrder(board)) {
    const score = -search(applyMove(board, index, aiMark), other(aiMark), -Infinity, Infinity, 1, state)
    ranked.push({ index, score })
  }

  ranked.sort((a, b) => b.score - a.score)
  return ranked
}

function pickRandom(indices: readonly number[], rng: () => number): number {
  const choice = indices[Math.floor(rng() * indices.length)]
  return choice ?? indices[0] ?? 4
}

export const DIFFICULTY_PROFILE: Record<Difficulty, DifficultyProfile> = {
  // Looks one move ahead but plays mostly at random: anyone patient enough to take the centre wins.
  easy: { maxPlies: 2, blunder: 0.75, blunderPool: 'open' },
  // Takes the win in front of it, blocks the obvious, and still wanders off now and then.
  medium: { maxPlies: 2, blunder: 0.28, blunderPool: 'tier' },
  // Five plies deep, and a blunder only ever picks a move that is a notch behind the best.
  hard: { maxPlies: 5, blunder: 0.1, blunderPool: 'tier' },
  // The whole tree, no mistakes: your best result is a draw.
  unbeatable: { maxPlies: MAX_PLIES, blunder: 0, blunderPool: 'tier' },
}

/**
 * Chooses a move for `aiMark`. Legal squares only; returns index -1 when the board is full.
 * Wins and forced blocks are played on purpose, so the blunder roll cannot throw away a game that
 * is already decided in front of the CPU.
 */
export function chooseMove(
  board: Board,
  aiMark: Mark,
  difficulty: Difficulty,
  options: MoveOptions = {},
): MoveChoice {
  const rng = options.rng ?? Math.random
  const open = emptyCells(board)
  if (open.length === 0) return { index: -1, reason: 'random', depth: 0 }

  const profile = DIFFICULTY_PROFILE[difficulty]
  const human = other(aiMark)
  if (profile.blunder >= 1) return { index: pickRandom(open, rng), reason: 'random', depth: 0 }

  const ranked = rootMoves(board, aiMark, profile.maxPlies)
  if (ranked.length === 0) return { index: pickRandom(open, rng), reason: 'random', depth: 0 }

  const bestScore = ranked[0].score

  // A win on the spot: never give it away.
  if (bestScore >= WIN_SCORE - profile.maxPlies) {
    return { index: ranked[0].index, reason: 'tactic', depth: 1 }
  }

  // Everything loses: block the threat the search cannot dodge.
  if (bestScore <= -(WIN_SCORE - profile.maxPlies)) {
    const block = findingMove(board, human)
    if (block !== null) return { index: block, reason: 'tactic', depth: profile.maxPlies }
  }

  const tierOne = ranked.filter((move) => move.score >= bestScore - 1)
  const tierTwo = ranked.filter((move) => move.score >= bestScore - 2)

  if (profile.blunder > 0 && rng() < profile.blunder) {
    if (profile.blunderPool === 'open') {
      return { index: pickRandom(open, rng), reason: 'search', depth: profile.maxPlies }
    }
    const pool = tierTwo.length > 1 && rng() < 0.4 ? tierTwo : tierOne
    return { index: pickRandom(pool.map((move) => move.index), rng), reason: 'search', depth: profile.maxPlies }
  }

  return { index: pickRandom(tierOne.map((move) => move.index), rng), reason: 'search', depth: profile.maxPlies }
}

/** How long the CPU pauses before answering, in milliseconds. */
export const THINKING_DELAY: Record<Difficulty, number> = {
  easy: 260,
  medium: 430,
  hard: 650,
  unbeatable: 780,
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  unbeatable: 'Unbeatable',
}

export const DIFFICULTY_HINT: Record<Difficulty, string> = {
  easy: 'Plays mostly at random. Take the centre and it hands you the win.',
  medium: 'Takes the win in front of it and blocks the obvious threats.',
  hard: 'Searches five plies deep. It only slips once in a while.',
  unbeatable: 'Searches the whole tree. Your best result is a draw.',
}
