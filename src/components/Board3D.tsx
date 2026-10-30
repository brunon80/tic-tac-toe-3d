import { useEffect, useRef, useState } from 'react'

import type { Board, GameStatus, Mark } from '../game/types'
import type { BoardDesign, CameraMode } from '../game/settings'
import type { ThemePalette } from '../theme/palette'
import { SceneController } from '../three/scene'

export interface Board3DProps {
  board: Board
  status: GameStatus
  turn: Mark
  playable: boolean
  palette: ThemePalette
  camera: CameraMode
  boardDesign: BoardDesign
  reducedMotion: boolean
  bloom: boolean
  guides: boolean
  onCellTap: (index: number) => void
  onHover?: (index: number | null) => void
  /** Increment this to send the camera back to its start pose. */
  resetCameraSignal?: number
  /** Extra UI drawn on top of the canvas (turn badge, result banner, hints). */
  overlay?: React.ReactNode
}

function webglSupported(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** Mounts the three.js scene and keeps it in sync with React state. */
export function Board3D(props: Board3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const controllerRef = useRef<SceneController | null>(null)
  const [supported, setSupported] = useState<boolean>(webglSupported)
  const [error, setError] = useState<string | null>(null)

  const tapRef = useRef(props.onCellTap)
  tapRef.current = props.onCellTap
  const hoverRef = useRef(props.onHover)
  hoverRef.current = props.onHover

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !supported) return
    let controller: SceneController
    try {
      controller = new SceneController({
        canvas,
        onCellTap: (index) => tapRef.current(index),
        onHover: (index) => hoverRef.current?.(index),
      })
    } catch (cause) {
      setSupported(false)
      setError(cause instanceof Error ? cause.message : 'WebGL is unavailable')
      return
    }
    controllerRef.current = controller
    controller.resize()
    controller.startLoop()

    const onVisibility = () => {
      if (document.hidden) controller.stopLoop()
      else controller.startLoop()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      controller.dispose()
      controllerRef.current = null
    }
  }, [supported])

  const firstPalette = useRef(true)
  useEffect(() => {
    controllerRef.current?.setPalette(props.palette, !firstPalette.current)
    firstPalette.current = false
  }, [props.palette])

  useEffect(() => {
    controllerRef.current?.setSettings({
      camera: props.camera,
      boardDesign: props.boardDesign,
      reducedMotion: props.reducedMotion,
      bloom: props.bloom,
      guides: props.guides,
    })
  }, [props.camera, props.boardDesign, props.reducedMotion, props.bloom, props.guides])

  useEffect(() => {
    controllerRef.current?.setBoard(props.board, props.status, props.turn)
  }, [props.board, props.status, props.turn])

  useEffect(() => {
    controllerRef.current?.setPlayable(props.playable)
  }, [props.playable])

  useEffect(() => {
    if (props.resetCameraSignal === undefined) return
    controllerRef.current?.resetCamera()
  }, [props.resetCameraSignal])

  return (
    <div className="board-stage">
      <canvas
        ref={canvasRef}
        className="board-canvas"
        data-camera={props.camera}
        aria-label="Tic tac toe board"
        role="presentation"
      />
      {props.overlay}
      {!supported && (
        <div className="board-fallback" role="status">
          <strong>3D board unavailable</strong>
          <p>
            {error ?? 'This browser could not start WebGL.'} Try another browser, or enable hardware
            acceleration in your browser settings.
          </p>
        </div>
      )}
    </div>
  )
}
