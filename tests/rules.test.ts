import { describe, expect, it } from 'vitest'

import {
  applyMove,
  describeStatus,
  evaluateStatus,
  findingMove,
  findWin,
  threatsCreated,
  WIN_LINES,
  winsWith,
} from '../src/game/rules'
import { boardFrom, cellCol, cellIndex, cellRow, emptyBoard, other } from '../src/game/types'
import type { Board, Mark } from '../src/game/types'

/** Reads a board from nine characters, e.g. 'X.O..X...' (X, O, dot = empty). */
function boardWith(spec: string): Board {
  if (spec.length !== 9) throw new Error(`spec must be 9 characters, got ${spec}`)
  const board = emptyBoard()
  spec.split('').forEach((char, index) => {
    if (char === 'X' || char === 'O') board[index] = char
  })
  return board
}

/** Marks a board from a list of cell indices, alternating from `startingMark`. */
function boardFromMoves(cells: readonly number[], startingMark: Mark = 'X'): Board {
  return boardFrom(cells, startingMark)
}

describe('board helpers', () => {
  it('starts empty', () => {
    const board = emptyBoard()
    expect(board).toHaveLength(9)
    expect(board.every((cell) => cell === null)).toBe(true)
  })

  it('maps indices to coordinates and back', () => {
    expect(cellRow(7)).toBe(2)
    expect(cellCol(7)).toBe(1)
    expect(cellIndex(2, 1)).toBe(7)
    for (let index = 0; index < 9; index += 1) {
      expect(cellIndex(cellRow(index), cellCol(index))).toBe(index)
    }
  })

  it('builds an alternating board from a move list', () => {
    const board = boardFromMoves([0, 1, 2])
    expect(board[0]).toBe('X')
    expect(board[1]).toBe('O')
    expect(board[2]).toBe('X')

    const oStart = boardFromMoves([4], 'O')
    expect(oStart[4]).toBe('O')
  })

  it('flips marks', () => {
    expect(other('X')).toBe('O')
    expect(other('O')).toBe('X')
  })
})

describe('win detection', () => {
  it('knows all eight winning lines', () => {
    expect(WIN_LINES).toHaveLength(8)
    expect(WIN_LINES).toContainEqual([0, 1, 2])
    expect(WIN_LINES).toContainEqual([0, 4, 8])
    expect(WIN_LINES).toContainEqual([6, 7, 8])
  })

  it('finds a row win', () => {
    const win = findWin(boardFromMoves([0, 3, 1, 4, 2]))
    expect(win?.mark).toBe('X')
    expect(win?.line).toEqual([0, 1, 2])
  })

  it('finds a column win', () => {
    const win = findWin(boardFromMoves([0, 1, 3, 5, 6]))
    expect(win?.mark).toBe('X')
    expect(win?.line).toEqual([0, 3, 6])
  })

  it('finds a diagonal win', () => {
    const win = findWin(boardWith('X.O.X.O.X'))
    expect(win?.mark).toBe('X')
    expect(win?.line).toEqual([0, 4, 8])
  })

  it('returns null when there is no winner', () => {
    expect(findWin(emptyBoard())).toBeNull()
    expect(findWin(boardWith('X.O..X...'))).toBeNull()
  })

  it('checks a hypothetical winning move', () => {
    const board = boardWith('XX.....O.')
    expect(winsWith(board, 2, 'X')).toEqual([0, 1, 2])
    expect(winsWith(board, 2, 'O')).toBeNull()
    // occupied squares can never win
    expect(winsWith(board, 0, 'X')).toBeNull()
  })

  it('applies a move without touching the original board', () => {
    const board = emptyBoard()
    const next = applyMove(board, 4, 'X')
    expect(board[4]).toBeNull()
    expect(next[4]).toBe('X')
  })
})

describe('game status', () => {
  it('is playing while the board is unfinished', () => {
    expect(evaluateStatus(boardWith('X.O..X...')).kind).toBe('playing')
  })

  it('is a win once a line is complete', () => {
    const status = evaluateStatus(boardWith('XXX.O...O'))
    expect(status.kind).toBe('win')
    if (status.kind === 'win') {
      expect(status.mark).toBe('X')
      expect(status.line).toEqual([0, 1, 2])
    }
  })

  it('is a draw when the board fills with no line', () => {
    // 0X 1O 2X / 3X 4O 5O / 6O 7X 8X - a full board with no three in a row.
    const status = evaluateStatus(boardWith('XOXXOOOXX'))
    expect(status.kind).toBe('draw')
  })

  it('describes itself for the status line', () => {
    expect(describeStatus(evaluateStatus(emptyBoard()))).toBe('In play')
    expect(describeStatus(evaluateStatus(boardWith('XXX.O...O')))).toBe('X wins')
    expect(describeStatus(evaluateStatus(boardWith('XOXXOOOXX')))).toBe('Draw')
  })
})

describe('tactics', () => {
  it('finds the square that completes a line', () => {
    expect(findingMove(boardWith('XX.......'), 'X')).toBe(2)
    expect(findingMove(boardWith('X.O.X...O'), 'O')).toBe(5)
  })

  it('returns null when nothing is winnable in one move', () => {
    expect(findingMove(boardWith('X.O......'), 'X')).toBeNull()
  })

  it('counts the threats a move would create', () => {
    const board = boardWith('X.X...X.X')
    // taking the centre forks: it would complete both 0-4-8 and 2-4-6
    expect(threatsCreated(board, 4, 'X')).toBe(2)
    // a square that only joins half a line creates a single threat
    expect(threatsCreated(board, 1, 'X')).toBe(1)
    expect(threatsCreated(emptyBoard(), 4, 'X')).toBe(0)
  })
})
