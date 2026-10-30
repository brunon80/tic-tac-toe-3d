import type { Board, GameStatus, Mark } from './types'
import { isEmpty, isFull } from './types'

export const WIN_LINES: readonly (readonly number[])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

/** The winning line as it already exists on the board, or null when there is none. */
export function findWin(board: Board): { mark: Mark; line: readonly number[] } | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line
    const first = board[a]
    if (first === null) continue
    if (board[b] === first && board[c] === first) return { mark: first, line }
  }
  return null
}

export function evaluateStatus(board: Board): GameStatus {
  const win = findWin(board)
  if (win) return { kind: 'win', mark: win.mark, line: win.line }
  if (isFull(board)) return { kind: 'draw' }
  return { kind: 'playing' }
}

/** Applies a move and returns a new board (does not mutate the input). */
export function applyMove(board: Board, index: number, mark: Mark): Board {
  const next = board.slice()
  next[index] = mark
  return next
}

/** True when `mark` completes a line by playing `index`. */
export function winsWith(board: Board, index: number, mark: Mark): readonly number[] | null {
  if (!isEmpty(board[index])) return null
  const next = applyMove(board, index, mark)
  const win = findWin(next)
  return win && win.mark === mark ? win.line : null
}

/** The cell that would complete a line for `mark` in one move, or null. */
export function findingMove(board: Board, mark: Mark): number | null {
  for (const line of WIN_LINES) {
    const marks = line.map((i) => board[i])
    const owned = marks.filter((m) => m === mark).length
    const open = marks.filter((m) => m === null).length
    if (owned === 2 && open === 1) {
      const index = line[marks.indexOf(null)]
      if (isEmpty(board[index])) return index
    }
  }
  return null
}

/** Lines a move at `index` would add for `mark` (used for fork detection). */
export function threatsCreated(board: Board, index: number, mark: Mark): number {
  let count = 0
  for (const line of WIN_LINES) {
    if (!line.includes(index)) continue
    const others = line.filter((i) => i !== index)
    if (others.every((i) => board[i] === mark)) count += 1
  }
  return count
}

export function describeStatus(status: GameStatus): string {
  switch (status.kind) {
    case 'win':
      return `${status.mark} wins`
    case 'draw':
      return 'Draw'
    default:
      return 'In play'
  }
}
