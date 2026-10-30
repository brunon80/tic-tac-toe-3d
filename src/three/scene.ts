import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import type { Board, GameStatus, Mark } from '../game/types'
import type { CameraMode } from './cameraRig'
import type { BoardDesign } from '../game/settings'
import type { ThemePalette } from '../theme/palette'
import { BoardGroup, type VisualState } from './board'
import { CameraRig } from './cameraRig'
import { ThemeTargets } from './theme'

export interface SceneSettings {
  camera: CameraMode
  boardDesign: BoardDesign
  reducedMotion: boolean
  bloom: boolean
  guides: boolean
}

export interface SceneOptions {
  canvas: HTMLCanvasElement
  onCellTap: (index: number) => void
  onHover?: (index: number | null) => void
}

type CanvasHandlerName =
  | 'pointermove'
  | 'pointerdown'
  | 'pointerup'
  | 'pointerleave'
  | 'pointercancel'
  | 'contextmenu'

interface TapState {
  x: number
  y: number
  time: number
  cell: number
  pointerId: number
  touch: boolean
}

const TAP_MOVE_LIMIT = 14
const TAP_TIME_LIMIT = 800
// a finger tap slides a little more than a mouse click, so taps need more room
const TOUCH_MOVE_LIMIT = 30
const TOUCH_TIME_LIMIT = 1000

export class SceneController {
  readonly board = new BoardGroup()

  private readonly canvas: HTMLCanvasElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene: THREE.Scene
  private readonly rig: CameraRig
  private readonly targets = new ThemeTargets()
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2(-10, -10)

  private composer: EffectComposer | null = null
  private bloomPass: UnrealBloomPass | null = null
  private environment: THREE.Texture | null = null

  private status: GameStatus = { kind: 'playing' }
  private turn: Mark = 'X'
  private playable = false
  private hoverIndex = -1
  private activeIndex: number | null = null
  private winLineKey = ''

  private settings: SceneSettings = {
    camera: 'orbit',
    boardDesign: 'classic',
    reducedMotion: false,
    bloom: true,
    guides: true,
  }

  private tap: TapState | null = null
  private frame = 0
  private lastTime = 0
  private elapsed = 0
  private running = false
  private disposed = false

  private readonly handlers: { name: CanvasHandlerName; listener: EventListener }[] = []

  constructor(private readonly options: SceneOptions) {
    this.canvas = options.canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1

    this.scene = new THREE.Scene()
    this.scene.add(this.board.group)
    this.rig = new CameraRig(this.canvas)

    this.buildEnvironment()

    this.addCanvasHandler('pointermove', (event) => this.onPointerMove(event as PointerEvent))
    this.addCanvasHandler('pointerdown', (event) => this.onPointerDown(event as PointerEvent))
    this.addCanvasHandler('pointerup', (event) => this.onPointerUp(event as PointerEvent))
    this.addCanvasHandler('pointerleave', () => this.clearHover())
    // a cancelled pointer (browser took the gesture) must never register as a tap
    this.addCanvasHandler('pointercancel', () => {
      this.tap = null
    })
    // long-press on touch opens the browser context menu: the board should not
    this.addCanvasHandler('contextmenu', (event) => event.preventDefault())

    this.stage = this.canvas.parentElement
    this.resize()
  }

  private buildEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    this.environment = pmrem.fromScene(room, 0.04).texture
    this.scene.environment = this.environment
    this.scene.environmentIntensity = 0.35
    room.dispose()
    pmrem.dispose()
  }

  private addCanvasHandler(name: CanvasHandlerName, handler: (event: Event) => void): void {
    const listener = (event: Event) => {
      if (!this.disposed) handler(event)
    }
    this.canvas.addEventListener(name, listener)
    this.handlers.push({ name, listener })
  }

  private observer: ResizeObserver | null = null
  private stage: HTMLElement | null = null

  /** Watch the board stage so any layout change (panel collapse, fullscreen) resizes the render. */
  private observeStage(): void {
    if (this.observer || !this.stage || typeof ResizeObserver === 'undefined') return
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(this.stage)
  }

  private unobserveStage(): void {
    if (!this.observer) return
    this.observer.disconnect()
    this.observer = null
  }

  private viewportSize(): { width: number; height: number } {
    const stage = this.stage
    if (stage && stage.clientWidth > 1 && stage.clientHeight > 1) {
      return { width: stage.clientWidth, height: stage.clientHeight }
    }
    // the stage is hidden (fullscreen ↔ normal switch): stop observing it and render to the viewport
    if (stage) this.unobserveStage()
    return { width: window.innerWidth, height: window.innerHeight }
  }

  resize(): void {
    const { width, height } = this.viewportSize()
    this.renderer.setSize(width, height, false)
    this.rig.setViewport(width, height)
    if (this.composer) {
      this.composer.setSize(width, height)
      this.bloomPass?.setSize(width, height)
    }
  }

  setPalette(palette: ThemePalette, animate: boolean): void {
    this.targets.setPalette(palette, animate)
    this.renderer.toneMappingExposure = palette.exposure
    this.lastBloom = {
      strength: palette.bloom.strength,
      radius: palette.bloom.radius,
      threshold: palette.bloom.threshold,
    }
    this.applyBloom(animate ? 0 : 1)
    if (!animate) this.board.snapPieces()
  }

  private lastBloom = { strength: 0, radius: 0.6, threshold: 0.2 }

  private applyBloom(instant: number): void {
    if (!this.bloomPass) return
    const strength = instant > 0 ? this.lastBloom.strength : this.targets.bloom.current
    // safety rails: no theme (or future colour shuffle) may push the glow into blown-out territory
    this.bloomPass.strength = Math.min(strength, 0.4)
    this.bloomPass.radius = Math.min(this.lastBloom.radius, 0.45)
    this.bloomPass.threshold = Math.max(this.lastBloom.threshold, 0.42)
  }

  setSettings(settings: SceneSettings): void {
    const previous = this.settings
    this.settings = settings
    this.rig.setOptions({ mode: settings.camera, reducedMotion: settings.reducedMotion })
    if (previous.camera !== settings.camera) this.rig.startIntro()
    if (previous.boardDesign !== settings.boardDesign) this.board.setDesign(settings.boardDesign, this.targets)
    if (settings.reducedMotion) this.board.snapPieces()
    this.updatePost()
    // a settings change goes together with a layout change (side panel / fullscreen)
    this.resize()
    this.observeStage()
    this.updateCursor()
  }

  private updatePost(): void {
    const { width, height } = this.viewportSize()
    if (!this.settings.bloom) {
      this.disposePost()
      return
    }
    if (this.composer) return
    const composer = new EffectComposer(this.renderer)
    composer.addPass(new RenderPass(this.scene, this.rig.camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.55, 0.55, 0.24)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
    composer.setSize(width, height)
    this.composer = composer
    this.bloomPass = bloom
  }

  private disposePost(): void {
    this.composer?.dispose()
    this.composer = null
    this.bloomPass = null
  }

  resetCamera(): void {
    this.rig.resetView()
  }

  /** Diffs the board into the 3D scene: spawns, removes and the winning bar. */
  setBoard(board: Board, status: GameStatus, turn: Mark): void {
    this.status = status
    this.turn = turn

    for (let i = 0; i < board.length; i += 1) {
      const cell = board[i]
      const placed = this.board.pieceMark(i)
      if (cell && placed !== cell) {
        this.board.spawnPiece(i, cell, this.settings.reducedMotion)
        this.activeIndex = i
      } else if (!cell && placed) {
        this.board.removePiece(i)
      }
    }
    if (board.every((cell) => cell === null)) this.activeIndex = null

    const key = status.kind === 'win' ? status.line.join('-') : ''
    if (key !== this.winLineKey) {
      this.winLineKey = key
      this.board.showWinBeam(status.kind === 'win' ? status.line : [], !this.settings.reducedMotion)
    }
    this.render()
  }

  clearBoard(): void {
    this.board.reset()
    this.winLineKey = ''
    this.activeIndex = null
    this.hoverIndex = -1
    this.render()
  }

  setPlayable(playable: boolean): void {
    this.playable = playable
    if (!playable) this.clearHover()
    this.updateCursor()
  }

  private updateCursor(): void {
    // hovering a playable square shows the pointer; otherwise the stylesheet picks grab/grabbing
    this.canvas.style.cursor = this.playable && this.hoverIndex >= 0 ? 'pointer' : ''
  }

  private pickCell(): number {
    if (this.pointer.x < -1 || this.pointer.y < -1) return -1
    this.raycaster.setFromCamera(this.pointer, this.rig.camera)
    const hits = this.raycaster.intersectObjects(this.board.tiles, false)
    for (const hit of hits) {
      const cell = hit.object.userData.cell
      if (typeof cell === 'number') return cell
    }
    return -1
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1
  }

  private onPointerMove(event: PointerEvent): void {
    if (event.pointerType === 'touch') return // touch has no resting hover: no ghost piece, no pointer cursor
    this.updatePointer(event)
    const cell = this.pickCell()
    if (cell !== this.hoverIndex) {
      this.hoverIndex = cell
      this.options.onHover?.(cell >= 0 ? cell : null)
      this.updateCursor()
    }
  }

  private clearHover(): void {
    if (this.hoverIndex === -1) return
    this.hoverIndex = -1
    this.options.onHover?.(null)
    this.updateCursor()
  }

  private onPointerDown(event: PointerEvent): void {
    this.updatePointer(event)
    this.tap = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      cell: this.pickCell(),
      pointerId: event.pointerId,
      touch: event.pointerType === 'touch',
    }
  }

  private onPointerUp(event: PointerEvent): void {
    const tap = this.tap
    this.tap = null
    if (!tap || tap.pointerId !== event.pointerId || tap.cell < 0) return
    const moveLimit = tap.touch ? TOUCH_MOVE_LIMIT : TAP_MOVE_LIMIT
    const timeLimit = tap.touch ? TOUCH_TIME_LIMIT : TAP_TIME_LIMIT
    if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > moveLimit) return
    if (performance.now() - tap.time > timeLimit) return
    this.updatePointer(event)
    if (!this.playable) return
    if (this.pickCell() !== tap.cell) return
    this.options.onCellTap(tap.cell)
  }

  private visualState(): VisualState {
    return {
      hoverIndex: this.playable ? this.hoverIndex : -1,
      activeIndex: this.activeIndex,
      ghostMark:
        this.playable && this.settings.guides && this.status.kind === 'playing' ? this.turn : null,
      highlight: this.status.kind === 'win' ? this.status.line : [],
      dimmed: this.status.kind !== 'playing',
      emissive: this.targets.emissive.current,
      metalness: this.targets.metalness.current,
      roughness: this.targets.roughness.current,
    }
  }

  private render(): void {
    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.rig.camera)
  }

  private readonly loop = (time: number): void => {
    if (this.disposed) return
    this.frame = requestAnimationFrame(this.loop)
    const dt = Math.min(0.05, Math.max(0.001, (time - this.lastTime) / 1000))
    this.lastTime = time
    this.elapsed += dt

    this.targets.tick(dt)
    this.applyBloom(0)
    this.board.update(dt, this.elapsed, this.visualState(), this.targets)
    this.rig.update(dt, this.elapsed)
    this.render()
  }

  startLoop(): void {
    if (this.running || this.disposed) return
    this.running = true
    this.lastTime = performance.now()
    this.frame = requestAnimationFrame(this.loop)
  }

  stopLoop(): void {
    if (!this.running) return
    this.running = false
    cancelAnimationFrame(this.frame)
  }

  dispose(): void {
    this.disposed = true
    this.stopLoop()
    this.observer?.disconnect()
    this.observer = null
    for (const { name, listener } of this.handlers) {
      this.canvas.removeEventListener(name, listener)
    }
    this.handlers.length = 0
    this.disposePost()
    this.environment?.dispose()
    this.environment = null
    this.board.dispose()
    this.rig.dispose()
    this.scene.clear()
    this.renderer.dispose()
  }
}




