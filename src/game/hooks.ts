import { useCallback, useMemo, useReducer } from 'react'

import { evaluateStatus } from './rules'
import { applyMove } from './rules'
import { boardFrom, emptyBoard, isOpen, other } from './types'
import type { Board, GameStatus, Mark } from './types'

export interface GameState {
  board: Board
  history: number[]
  startingMark: Mark
  turn: Mark
  status: GameStatus
}

export type GameAction =
  | { type: 'play'; index: number }
  | { type: 'undo'; plies: number }
  | { type: 'newRound'; startingMark: Mark }

function initialRound(startingMark: Mark = 'X'): GameState {
  return {
    board: emptyBoard(),
    history: [],
    startingMark,
    turn: startingMark,
    status: { kind: 'playing' },
  }
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'play': {
      if (state.status.kind !== 'playing') return state
      if (!isOpen(state.board, action.index)) return state
      const board = applyMove(state.board, action.index, state.turn)
      const history = [...state.history, action.index]
      return {
        ...state,
        board,
        history,
        turn: other(state.turn),
        status: evaluateStatus(board),
      }
    }
    case 'undo': {
      const plies = Math.min(Math.max(1, action.plies), state.history.length)
      if (plies <= 0) return state
      const history = state.history.slice(0, state.history.length - plies)
      const board = boardFrom(history, state.startingMark)
      const turn = history.length % 2 === 0 ? state.startingMark : other(state.startingMark)
      return { ...initialRound(state.startingMark), history, board, turn }
    }
    case 'newRound':
      return initialRound(action.startingMark)
    default:
      return state
  }
}

export interface TicTacToe {
  board: Board
  history: number[]
  turn: Mark
  startingMark: Mark
  status: GameStatus
  playable: boolean
  lastMove: number | null
  plies: number
  canPlay: (index: number) => boolean
  play: (index: number) => void
  undo: (plies?: number) => void
  newRound: (startingMark: Mark) => void
  winLine: readonly number[] | null
}

export function useTicTacToe(initialStart: Mark = 'X'): TicTacToe {
  const [state, dispatch] = useReducer(gameReducer, initialStart, initialRound)

  const play = useCallback((index: number) => dispatch({ type: 'play', index }), [])
  const undo = useCallback((plies = 1) => dispatch({ type: 'undo', plies }), [])
  const newRound = useCallback((startingMark: Mark) => dispatch({ type: 'newRound', startingMark }), [])

  const playable = state.status.kind === 'playing'
  const canPlay = useCallback(
    (index: number) => playable && isOpen(state.board, index),
    [playable, state.board],
  )

  const winLine = useMemo(
    () => (state.status.kind === 'win' ? state.status.line : null),
    [state.status],
  )

  return {
    board: state.board,
    history: state.history,
    turn: state.turn,
    startingMark: state.startingMark,
    status: state.status,
    playable,
    lastMove: state.history.length > 0 ? state.history[state.history.length - 1] : null,
    plies: state.history.length,
    canPlay,
    play,
    undo,
    newRound,
    winLine,
  }
}
