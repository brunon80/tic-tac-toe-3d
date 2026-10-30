export type Mark = 'X' | 'O'

export type CellValue = Mark | null

/** Flat list of 9 cells, row-major: index = row * 3 + col. */
export type Board = CellValue[]

export type Difficulty = 'easy' | 'medium' | 'hard' | 'unbeatable'

/** 'pvp' = two humans on one device, 'cpu' = human vs computer. */
export type GameMode = 'pvp' | 'cpu'

/** Which mark the computer controls in 'cpu' mode. */
export type CpuSide = 'X' | 'O' | 'random'

export type GameStatus =
  | { kind: 'playing' }
  | { kind: 'win'; mark: Mark; line: readonly number[] }
  | { kind: 'draw' }

export interface Scores {
  X: number
  O: number
  draws: number
}

export const BOARD_SIZE = 3
export const CELL_COUNT = 9
export const MAX_PLIES = CELL_COUNT

export function other(mark: Mark): Mark {
  return mark === 'X' ? 'O' : 'X'
}

export function emptyBoard(): Board {
  return new Array<CellValue>(CELL_COUNT).fill(null)
}

export function boardFrom(moves: readonly number[], startingMark: Mark = 'X'): Board {
  const board = emptyBoard()
  let mark = startingMark
  for (const index of moves) {
    board[index] = mark
    mark = other(mark)
  }
  return board
}

export function cellRow(index: number): number {
  return Math.floor(index / BOARD_SIZE)
}

export function cellCol(index: number): number {
  return index % BOARD_SIZE
}

export function cellIndex(row: number, col: number): number {
  return row * BOARD_SIZE + col
}

export function isEmpty(cell: CellValue): cell is null {
  return cell === null
}

export function emptyCells(board: Board): number[] {
  const cells: number[] = []
  for (let i = 0; i < board.length; i += 1) if (isEmpty(board[i])) cells.push(i)
  return cells
}

export function isOpen(board: Board, index: number): boolean {
  return index >= 0 && index < board.length && isEmpty(board[index])
}

export function isFull(board: Board): boolean {
  return emptyCells(board).length === 0
}

export function playedMoves(board: Board): number[] {
  const moves: number[] = []
  board.forEach((cell, i) => {
    if (!isEmpty(cell)) moves.push(i)
  })
  return moves
}

export function marksOf(board: Board, mark: Mark): number[] {
  const result: number[] = []
  board.forEach((cell, i) => {
    if (cell === mark) result.push(i)
  })
  return result
}

export function boardKey(board: Board): string {
  let key = ''
  for (const cell of board) key += cell === null ? '.' : cell
  return key
}
