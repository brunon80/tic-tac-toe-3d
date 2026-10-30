import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

import {
  EASE,
  AnimationRunner,
  Tween,
  approach,
  clamp01,
  integrateSpring,
  springState,
  SNAPPY_SPRING,
  type SpringState,
} from './anim'
import type { ThemeTargets } from './theme'
import type { BoardDesign } from '../game/settings'

export const PITCH = 1.18
export const TILE_SIZE = 1.0
export const TILE_THICKNESS = 0.16
export const BOARD_HALF = 1.93
export const PIECE_TOP = 1.0
export const BEAM_Y = 0.66
export const BEAM_SPAN = 0.42

const ARM_LENGTH = 0.86
const ARM_THICKNESS = 0.2
const ARM_DEPTH = 0.15
const RING_RADIUS = 0.4
const RING_TUBE = 0.115
const FALL_HEIGHT = 0.45

export function cellCenterX(index: number): number {
  return ((index % 3) - 1) * PITCH
}

export function cellCenterZ(index: number): number {
  return (1 - Math.floor(index / 3)) * PITCH
}

export interface VisualState {
  hoverIndex: number
  activeIndex: number | null
  ghostMark: 'X' | 'O' | null
  highlight: readonly number[]
  dimmed: boolean
  emissive: number
  metalness: number
  roughness: number
}

interface PieceVisual {
  index: number
  mark: 'X' | 'O'
  group: THREE.Group
  spring: SpringState
  phase: number
}

/**
 * The 3D board in four switchable architectures: classic slate, carved slab, floating
 * plates and a neon lattice. Pieces, the winning beam and hover targets survive a swap.
 * Theme materials are recoloured from the eased `ThemeTargets` every frame.
 */
export class BoardGroup {
  readonly group = new THREE.Group()
  readonly tiles: THREE.Mesh[] = []

  private design: BoardDesign = 'classic'
  private staticMeshes: THREE.Mesh[] = []
  private readonly designGeometries: Partial<Record<BoardDesign, THREE.BufferGeometry[]>> = {}
  private latticeMaterial: THREE.MeshStandardMaterial | null = null
  private padMaterial: THREE.MeshBasicMaterial | null = null

  private readonly tileGroups: THREE.Group[] = []
  private readonly tileMaterials: THREE.MeshStandardMaterial[] = []
  private readonly slotMaterials: THREE.MeshBasicMaterial[] = []
  private readonly frameMaterial: THREE.MeshStandardMaterial
  private readonly previewMaterial: THREE.MeshStandardMaterial
  private readonly beamCoreMaterial: THREE.MeshBasicMaterial
  private readonly beamGlowMaterial: THREE.MeshBasicMaterial
  private readonly shadowMaterial: THREE.MeshBasicMaterial
  private readonly skyMaterial: THREE.MeshBasicMaterial
  private readonly ambient = new THREE.AmbientLight('#ffffff', 0.7)
  private readonly key = new THREE.DirectionalLight('#ffffff', 2.2)
  private readonly fill = new THREE.DirectionalLight('#ffffff', 0.8)
  private readonly warmRim = new THREE.PointLight('#8b5cf6', 3.2, 16)
  private readonly coolRim = new THREE.PointLight('#22d3ee', 2.4, 16)

  private readonly pieces: (PieceVisual | null)[] = Array.from({ length: 9 }, () => null)

  private readonly tileGeometry = new RoundedBoxGeometry(TILE_SIZE, TILE_THICKNESS, TILE_SIZE, 4, 0.06)
  private readonly armGeometry = new RoundedBoxGeometry(ARM_LENGTH, ARM_THICKNESS, ARM_DEPTH, 3, 0.055)
  private readonly ringGeometry = new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 22, 84)
  private readonly slotGeometry = new THREE.CircleGeometry(0.44, 40)
  private readonly beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true)

  private disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = []

  constructor() {
    this.frameMaterial = this.track(
      new THREE.MeshStandardMaterial({ color: '#241a4d', metalness: 0.45, roughness: 0.55 }),
    )
    this.previewMaterial = this.track(
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        roughness: 0.5,
        metalness: 0.1,
      }),
    )
    this.beamCoreMaterial = this.track(
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95 }),
    )
    this.beamGlowMaterial = this.track(
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    this.shadowMaterial = this.track(
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }),
    )
    this.skyMaterial = this.track(new THREE.MeshBasicMaterial({ depthWrite: false, side: THREE.BackSide }))

    this.slotGeometry.rotateX(-Math.PI / 2)
    this.buildClassic(null)
    this.buildAtmosphere()
    this.buildLights()
  }

  private track<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(item: T): T {
    this.disposables.push(item)
    return item
  }

  /**
   * Swaps the board architecture live. Pieces, beam, previews and lights are untouched:
   * every design keeps its nine hit-target cells with the playable surface at y = 0.
   */
  setDesign(design: BoardDesign, targets: ThemeTargets | null): void {
    if (design === this.design) return
    this.teardownStatic()
    this.design = design
    switch (design) {
      case 'carved':
        this.buildCarved(targets)
        break
      case 'floating':
        this.buildFloating(targets)
        break
      case 'neon':
        this.buildNeon(targets)
        break
      default:
        this.buildClassic(targets)
    }
  }

  private teardownStatic(): void {
    for (const mesh of this.staticMeshes) mesh.removeFromParent()
    this.staticMeshes = []
    for (const group of this.tileGroups) this.group.remove(group)
    for (const material of this.tileMaterials) material.dispose()
    for (const material of this.slotMaterials) material.dispose()
    this.tileMaterials.length = 0
    this.slotMaterials.length = 0
    this.tiles.length = 0
    this.tileGroups.length = 0
    for (const state of this.tileState) {
      state.lift = 0
      state.glow = 0
    }
  }

  private registerStatic(mesh: THREE.Mesh): void {
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.group.add(mesh)
    this.staticMeshes.push(mesh)
  }

  /** Per-design geometries are built once and reused whenever the design comes back. */
  private bundleGeometries(design: BoardDesign, make: () => THREE.BufferGeometry[]): THREE.BufferGeometry[] {
    const cached = this.designGeometries[design]
    if (cached) return cached
    const list = make()
    for (const geometry of list) this.track(geometry)
    this.designGeometries[design] = list
    return list
  }

  private buildCell(
    index: number,
    geometry: THREE.BufferGeometry,
    tileY: number,
    targets: ThemeTargets | null,
    opts: { slot: boolean; tileScale?: number; glass?: boolean; castShadow?: boolean },
  ): void {
    const tileGroup = new THREE.Group()
    tileGroup.position.set(cellCenterX(index), 0, cellCenterZ(index))

    const material = this.track(
      new THREE.MeshStandardMaterial({
        color: targets ? `#${targets.tile.current.getHexString()}` : '#2b2060',
        metalness: opts.glass ? 0.25 : 0.4,
        roughness: opts.glass ? 0.12 : 0.34,
        transparent: opts.glass === true,
        opacity: opts.glass ? 0.42 : 1,
      }),
    )
    const tile = new THREE.Mesh(geometry, material)
    tile.position.y = tileY
    tile.scale.setScalar(opts.tileScale ?? 1)
    tile.castShadow = opts.castShadow ?? true
    tile.receiveShadow = true
    tile.userData.cell = index

    tileGroup.add(tile)
    if (opts.slot) {
      const slotMaterial = this.track(
        new THREE.MeshBasicMaterial({
          color: targets ? `#${targets.gridLine.current.getHexString()}` : '#8b5cf6',
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
        }),
      )
      const slot = new THREE.Mesh(this.slotGeometry, slotMaterial)
      slot.position.y = 0.004
      tileGroup.add(slot)
      this.slotMaterials.push(slotMaterial)
    }

    this.group.add(tileGroup)
    this.tiles.push(tile)
    this.tileGroups.push(tileGroup)
    this.tileMaterials.push(material)
  }

  private buildClassic(targets: ThemeTargets | null): void {
    const [frameGeo] = this.bundleGeometries('classic', () => [
      new RoundedBoxGeometry(BOARD_HALF * 2, 0.5, BOARD_HALF * 2, 5, 0.09),
    ])
    const frame = new THREE.Mesh(frameGeo, this.frameMaterial)
    frame.position.y = -0.31
    frame.receiveShadow = true
    this.group.add(frame)
    this.staticMeshes.push(frame)

    for (let i = 0; i < 9; i += 1) {
      const tileGroup = new THREE.Group()
      tileGroup.position.set(cellCenterX(i), 0, cellCenterZ(i))

      const material = this.track(
        new THREE.MeshStandardMaterial({
          color: targets ? `#${targets.tile.current.getHexString()}` : '#2b2060',
          metalness: 0.4,
          roughness: 0.34,
        }),
      )
      const tile = new THREE.Mesh(this.tileGeometry, material)
      tile.position.y = -TILE_THICKNESS / 2
      tile.castShadow = true
      tile.receiveShadow = true
      tile.userData.cell = i

      const slotMaterial = this.track(
        new THREE.MeshBasicMaterial({
          color: targets ? `#${targets.gridLine.current.getHexString()}` : '#8b5cf6',
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
        }),
      )
      const slot = new THREE.Mesh(this.slotGeometry, slotMaterial)
      slot.position.y = 0.004

      tileGroup.add(tile, slot)
      this.group.add(tileGroup)
      this.tiles.push(tile)
      this.tileGroups.push(tileGroup)
      this.tileMaterials.push(material)
      this.slotMaterials.push(slotMaterial)
    }
  }

  /** A monolith slab with the nine cells cut out as wells, walls proud of the floor. */
  private buildCarved(targets: ThemeTargets | null): void {
    const [baseGeo, wallOuterX, wallInnerX, wallOuterZ, wallInnerZ] = this.bundleGeometries('carved', () => [
      new RoundedBoxGeometry(BOARD_HALF * 2, 0.34, BOARD_HALF * 2, 4, 0.06),
      new THREE.BoxGeometry(3.86, 0.34, 0.18),
      new THREE.BoxGeometry(3.36, 0.34, 0.18),
      new THREE.BoxGeometry(0.18, 0.34, 3.86),
      new THREE.BoxGeometry(0.18, 0.34, 3.36),
    ])

    const base = new THREE.Mesh(baseGeo, this.frameMaterial)
    base.position.y = -0.33
    base.receiveShadow = true
    this.group.add(base)
    this.staticMeshes.push(base)

    for (const offset of [-1.77, -0.59, 0.59, 1.77]) {
      const outer = Math.abs(offset) > 1.5
      const wallX = new THREE.Mesh(outer ? wallOuterX : wallInnerX, this.frameMaterial)
      wallX.position.set(0, 0.01, offset)
      this.registerStatic(wallX)
      const wallZ = new THREE.Mesh(outer ? wallOuterZ : wallInnerZ, this.frameMaterial)
      wallZ.position.set(offset, 0.01, 0)
      this.registerStatic(wallZ)
    }

    for (let i = 0; i < 9; i += 1) {
      this.buildCell(i, this.tileGeometry, -TILE_THICKNESS / 2, targets, { slot: false, tileScale: 0.97 })
    }
  }

  /** Nine rounded plates hovering over a slim pedestal, each with a soft grid-coloured halo. */
  private buildFloating(targets: ThemeTargets | null): void {
    const [pedestalGeo, plateGeo, padGeo] = this.bundleGeometries('floating', () => [
      new RoundedBoxGeometry(3.42, 0.1, 3.42, 5, 0.045),
      new RoundedBoxGeometry(0.96, 0.12, 0.96, 4, 0.05),
      new THREE.PlaneGeometry(1.14, 1.14).rotateX(-Math.PI / 2),
    ])

    const pedestal = new THREE.Mesh(pedestalGeo, this.frameMaterial)
    pedestal.position.y = -0.5
    pedestal.receiveShadow = true
    this.group.add(pedestal)
    this.staticMeshes.push(pedestal)

    if (!this.padMaterial) {
      this.padMaterial = this.track(
        new THREE.MeshBasicMaterial({
          color: '#8b5cf6',
          transparent: true,
          opacity: 0.15,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
    }

    for (let i = 0; i < 9; i += 1) {
      this.buildCell(i, plateGeo, -0.06, targets, { slot: false })
      const pad = new THREE.Mesh(padGeo, this.padMaterial)
      pad.position.y = -0.34
      this.tileGroups[i].add(pad)
    }
  }

  /** Glowing lattice rails holding frosted glass cells; the rails warm to the win colour. */
  private buildNeon(targets: ThemeTargets | null): void {
    const [railOuterX, railInnerX, railOuterZ, railInnerZ, glassGeo] = this.bundleGeometries('neon', () => [
      new THREE.BoxGeometry(3.72, 0.44, 0.1),
      new THREE.BoxGeometry(3.36, 0.44, 0.1),
      new THREE.BoxGeometry(0.1, 0.44, 3.72),
      new THREE.BoxGeometry(0.1, 0.44, 3.36),
      new RoundedBoxGeometry(0.98, 0.06, 0.98, 3, 0.03),
    ])

    if (!this.latticeMaterial) {
      this.latticeMaterial = this.track(
        new THREE.MeshStandardMaterial({
          color: '#1c1540',
          emissive: '#8b5cf6',
          emissiveIntensity: 0.9,
          roughness: 0.3,
          metalness: 0.55,
        }),
      )
    }

    for (const offset of [-1.77, -0.59, 0.59, 1.77]) {
      const outer = Math.abs(offset) > 1.5
      const railX = new THREE.Mesh(outer ? railOuterX : railInnerX, this.latticeMaterial)
      railX.position.set(0, -0.08, offset)
      this.registerStatic(railX)
      const railZ = new THREE.Mesh(outer ? railOuterZ : railInnerZ, this.latticeMaterial)
      railZ.position.set(offset, -0.08, 0)
      this.registerStatic(railZ)
    }

    for (let i = 0; i < 9; i += 1) {
      this.buildCell(i, glassGeo, -0.03, targets, { slot: false, glass: true, castShadow: false })
    }
  }

  private updateStructural(state: VisualState, targets: ThemeTargets): void {
    if (this.latticeMaterial) {
      const lattice = this.latticeMaterial
      lattice.color.copy(targets.frame.current).multiplyScalar(0.4)
      lattice.emissive.copy(targets.gridLine.current)
      if (state.highlight.length > 0) lattice.emissive.lerp(targets.win.current, 0.6)
      lattice.emissiveIntensity = targets.emissive.current * 1.1 + (state.highlight.length > 0 ? 0.15 : 0)
    }
    if (this.padMaterial) {
      this.padMaterial.color.copy(targets.gridLine.current)
    }
  }

  private skyMesh: THREE.Mesh | null = null
  private skyTexture: THREE.CanvasTexture<HTMLCanvasElement> | null = null
  private skyCanvas: HTMLCanvasElement | null = null
  private groundMesh: THREE.Mesh | null = null

  private buildAtmosphere(): void {
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 256
    this.skyCanvas = canvas

    const skyTexture = this.track(new THREE.CanvasTexture(canvas))
    skyTexture.colorSpace = THREE.SRGBColorSpace
    this.skyTexture = skyTexture
    this.skyMaterial.map = skyTexture

    this.skyMesh = new THREE.Mesh(this.track(new THREE.SphereGeometry(30, 40, 24)), this.skyMaterial)
    this.skyMesh.name = 'sky'
    this.group.add(this.skyMesh)

    const groundTexture = this.track(makeRadialTexture())
    groundTexture.colorSpace = THREE.SRGBColorSpace
    this.shadowMaterial.map = groundTexture

    const groundGeo = this.track(new THREE.PlaneGeometry(9, 9))
    groundGeo.rotateX(-Math.PI / 2)
    this.groundMesh = new THREE.Mesh(groundGeo, this.shadowMaterial)
    this.groundMesh.position.y = -0.62
    this.groundMesh.name = 'groundShadow'
    this.group.add(this.groundMesh)
  }

  /** Repaints the sky gradient: top colour is "sky", bottom is the background. */
  private paintSky(top: string, bottom: string): void {
    const canvas = this.skyCanvas
    const texture = this.skyTexture
    if (!canvas || !texture) return
    const context = canvas.getContext('2d')
    if (!context) return
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, top)
    gradient.addColorStop(0.55, bottom)
    gradient.addColorStop(1, bottom)
    context.fillStyle = gradient
    context.fillRect(0, 0, canvas.width, canvas.height)
    texture.needsUpdate = true
  }

  private buildLights(): void {
    this.key.castShadow = true
    this.key.shadow.mapSize.set(1024, 1024)
    this.key.shadow.camera.near = 1
    this.key.shadow.camera.far = 24
    this.key.shadow.camera.left = -3.4
    this.key.shadow.camera.right = 3.4
    this.key.shadow.camera.top = 3.4
    this.key.shadow.camera.bottom = -3.4
    this.key.shadow.bias = -0.0006
    this.key.shadow.radius = 3
    this.key.position.set(2.6, 6.2, 3.2)
    this.key.target.position.set(0, 0.2, 0)

    this.fill.position.set(-4.2, 3.4, -2.4)
    this.fill.target.position.set(0, 0.2, 0)

    this.warmRim.position.set(-2.6, 2.1, -3.4)
    this.coolRim.position.set(3.2, 1.6, 3.4)

    this.group.add(this.ambient, this.key, this.key.target, this.fill, this.fill.target, this.warmRim, this.coolRim)
  }

  private readonly markMaterials: Record<'X' | 'O', THREE.MeshStandardMaterial> =
    createMarkMaterials()

  private readonly pieceMaterials = new Map<number, THREE.MeshStandardMaterial>()

  private buildPieceMesh(mark: 'X' | 'O', material: THREE.Material): THREE.Group {
    const group = new THREE.Group()
    if (mark === 'X') {
      for (const sign of [1, -1]) {
        const arm = new THREE.Mesh(this.armGeometry, material)
        arm.position.y = PIECE_TOP / 2
        arm.rotation.z = (Math.PI / 4) * sign
        arm.castShadow = true
        group.add(arm)
      }
      return group
    }
    const ring = new THREE.Mesh(this.ringGeometry, material)
    ring.position.y = PIECE_TOP / 2
    ring.castShadow = true
    group.add(ring)
    return group
  }

  /** Places a piece and starts its drop-in spring. */
  spawnPiece(index: number, mark: 'X' | 'O', reduced: boolean): void {
    this.removePiece(index)
    const material = this.markMaterials[mark].clone()
    this.pieceMaterials.set(index, material)

    const group = this.buildPieceMesh(mark, material)
    group.position.set(cellCenterX(index), reduced ? 0 : -FALL_HEIGHT, cellCenterZ(index))

    this.group.add(group)
    this.pieces[index] = {
      index,
      mark,
      group,
      spring: springState(reduced ? 1 : 0),
      phase: (index * 1.7) % (Math.PI * 2),
    }
  }

  removePiece(index: number): void {
    const piece = this.pieces[index]
    if (!piece) return
    this.group.remove(piece.group)
    const material = this.pieceMaterials.get(index)
    if (material) {
      material.dispose()
      this.pieceMaterials.delete(index)
    }
    this.pieces[index] = null
  }

  hasPiece(index: number): boolean {
    return this.pieces[index] !== null
  }

  pieceMark(index: number): 'X' | 'O' | null {
    return this.pieces[index]?.mark ?? null
  }

  private readonly tileState = Array.from({ length: 9 }, () => ({ lift: 0, glow: 0 }))
  private readonly animations = new AnimationRunner()

  /** Runs one animation step and applies the eased theme colours. */
  update(dt: number, elapsed: number, state: VisualState, targets: ThemeTargets): void {
    this.animations.tick(dt)
    this.updateAtmosphere(targets)
    this.updateTiles(dt, elapsed, state, targets)
    this.updateStructural(state, targets)
    this.updatePieces(dt, elapsed, state, targets)
    this.updatePreview(state, targets, elapsed)
    this.updateBeam(elapsed, targets)
  }

  private skyTop = ''
  private skyBottom = ''

  private updateAtmosphere(targets: ThemeTargets): void {
    const top = targets.sky.current.getHexString()
    const bottom = targets.background.current.getHexString()
    if (top !== this.skyTop || bottom !== this.skyBottom) {
      this.skyTop = top
      this.skyBottom = bottom
      this.paintSky(`#${top}`, `#${bottom}`)
    }

    this.ambient.intensity = targets.ambient.current
    this.key.intensity = targets.keyLight.current
    this.fill.intensity = targets.ambient.current * 0.9
    this.warmRim.intensity = targets.rimLight.current
    this.coolRim.intensity = targets.rimLight.current * 0.75
    this.warmRim.color.copy(targets.accent.current)
    this.coolRim.color.copy(targets.x.current)
    this.frameMaterial.color.copy(targets.frame.current)
    this.frameMaterial.metalness = targets.metalness.current
    this.frameMaterial.roughness = targets.roughness.current
    this.shadowMaterial.color.copy(targets.shadow.current)
  }

  private updateTiles(dt: number, elapsed: number, state: VisualState, targets: ThemeTargets): void {
    const base = targets.tile.current
    const hover = targets.tileHover.current
    const glow = targets.emissive.current
    const litColor = targets.win.current
    const accent = targets.accent.current

    for (let i = 0; i < 9; i += 1) {
      const material = this.tileMaterials[i]
      const slot: THREE.MeshBasicMaterial | undefined = this.slotMaterials[i]
      const tileGroup = this.tileGroups[i]
      const lit = state.highlight.includes(i)
      const hovered = state.hoverIndex === i && !this.hasPiece(i)

      const liftGoal = hovered || lit ? 0.08 : 0
      const glowGoal = lit ? glow * 0.35 : hovered ? glow * 0.85 : 0
      const previous = this.tileState[i]
      const lift = approach(previous.lift, liftGoal, dt, 11)
      const glowValue = approach(previous.glow, glowGoal, dt, 9)
      this.tileState[i].lift = lift
      this.tileState[i].glow = glowValue

      const pulse = lit ? 1 + 0.04 * Math.sin(elapsed * 2.6 + i * 0.9) : 1
      const bob = this.design === 'floating' ? 0.05 * Math.sin(elapsed * 1.15 + i * 0.75) : 0
      tileGroup.position.y = lift * pulse + bob
      tileGroup.scale.setScalar(lit ? 1 + 0.02 * Math.sin(elapsed * 2.6 + i) : 1)

      material.color.copy(hovered ? hover : base)
      if (state.dimmed && !lit) material.color.multiplyScalar(0.5)
      material.emissive.copy(lit ? litColor : accent)
      if (lit) material.emissive.multiplyScalar(0.6)
      material.emissiveIntensity = glowValue + (this.design === 'neon' ? 0.05 : 0)

      if (slot) {
        slot.color.copy(lit ? litColor : targets.gridLine.current)
        if (lit) slot.color.multiplyScalar(0.6)
        slot.opacity = lit ? 0.45 : hovered ? 0.52 : 0.3
      }
    }
  }

  private updatePieces(dt: number, elapsed: number, state: VisualState, targets: ThemeTargets): void {
    const glow = targets.emissive.current

    for (const piece of this.pieces) {
      if (!piece) continue
      const material = this.pieceMaterials.get(piece.index)
      if (!material) continue

      const value = integrateSpring(piece.spring, 1, dt, SNAPPY_SPRING)
      const group = piece.group
      group.scale.setScalar(Math.max(0.02, value))
      group.position.y = -FALL_HEIGHT * (1 - value)
      group.rotation.y = (1 - clamp01(value)) * 1.4

      const lit = state.highlight.includes(piece.index)
      const active = state.activeIndex === piece.index
      const markColor = piece.mark === 'X' ? targets.x.current : targets.o.current
      const pulse = lit ? 1 + 0.1 * Math.sin(elapsed * 3.4 + piece.phase) : 1

      if (lit) {
        // darker albedo + less metalness: the win moment must not light-blown the bloom
        material.color.copy(targets.win.current).multiplyScalar(0.55)
        material.emissive.copy(targets.win.current).multiplyScalar(0.6)
        material.emissiveIntensity = glow * 0.45 * pulse
      } else if (state.dimmed) {
        material.color.copy(markColor).multiplyScalar(0.4)
        material.emissive.copy(markColor).multiplyScalar(0.12)
        material.emissiveIntensity = glow * 0.18
      } else {
        material.color.copy(markColor)
        material.emissive.copy(markColor)
        material.emissiveIntensity = glow * (active ? 0.55 : 0.3)
      }
      material.metalness = lit ? Math.min(targets.metalness.current * 0.5, 0.3) : targets.metalness.current
      material.roughness = lit ? 1 : targets.roughness.current * 0.8
      group.scale.multiplyScalar(pulse > 1 ? pulse : 1)
    }
  }

  private previewMeshes: Partial<Record<'X' | 'O', THREE.Group>> = {}

  private ensurePreviews(): void {
    for (const mark of ['X', 'O'] as const) {
      if (this.previewMeshes[mark]) continue
      const mesh = this.buildPieceMesh(mark, this.previewMaterial)
      mesh.visible = false
      mesh.name = `preview-${mark}`
      this.previewMeshes[mark] = mesh
      this.group.add(mesh)
    }
  }

  private updatePreview(state: VisualState, targets: ThemeTargets, elapsed: number): void {
    this.ensurePreviews()
    const hovering = state.hoverIndex >= 0 && !this.hasPiece(state.hoverIndex)
    const showGhost = state.ghostMark !== null && hovering && !state.dimmed

    for (const mark of ['X', 'O'] as const) {
      const mesh = this.previewMeshes[mark]
      if (!mesh) continue
      const active = showGhost && state.ghostMark === mark
      mesh.visible = active
      if (!active) continue
      mesh.position.set(cellCenterX(state.hoverIndex), 0, cellCenterZ(state.hoverIndex))
      mesh.scale.setScalar(1 + 0.07 * Math.sin(elapsed * 4.2))
      mesh.rotation.y = elapsed * 0.7

      const color = mark === 'X' ? targets.x.current : targets.o.current
      this.previewMaterial.color.copy(color)
      this.previewMaterial.emissive.copy(color)
      this.previewMaterial.emissiveIntensity = targets.emissive.current * 0.35
      this.previewMaterial.opacity = 0.3 + 0.08 * Math.sin(elapsed * 4.2)
    }
  }

  private beamMeshes: { core: THREE.Mesh; glow: THREE.Mesh } | null = null
  private beamLength = 1
  private beamReveal = 1

  /** Draws the 3D bar that crosses the winning line. */
  showWinBeam(line: readonly number[], animate: boolean): void {
    this.clearBeam()
    if (line.length < 2) return

    const first = new THREE.Vector3(cellCenterX(line[0]), BEAM_Y, cellCenterZ(line[0]))
    const last = new THREE.Vector3(cellCenterX(line[line.length - 1]), BEAM_Y, cellCenterZ(line[line.length - 1]))
    const direction = last.clone().sub(first)
    direction.y = 0
    direction.normalize()

    const start = first.clone().addScaledVector(direction, -BEAM_SPAN)
    const length = first.distanceTo(last) + BEAM_SPAN * 2
    const origin = start.clone().addScaledVector(direction, length / 2)

    const group = new THREE.Group()
    group.position.copy(origin)
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)

    const core = new THREE.Mesh(this.beamGeometry, this.beamCoreMaterial)
    const glow = new THREE.Mesh(this.beamGeometry, this.beamGlowMaterial)
    core.scale.set(0.05, 1, 0.05)
    glow.scale.set(0.17, 1, 0.17)
    group.add(core, glow)
    this.group.add(group)

    this.beamMeshes = { core, glow }
    this.beamLength = length
    this.beamReveal = 0

    if (this.beamTween) this.animations.remove(this.beamTween)
    this.beamTween = new Tween({
      duration: animate ? 0.5 : 0.001,
      delay: animate ? 0.32 : 0,
      ease: EASE.outQuint,
      onUpdate: (t) => {
        this.beamReveal = t
      },
    })
    if (animate) this.animations.add(this.beamTween)
    else this.beamReveal = 1
  }

  private beamTween: Tween | null = null

  private clearBeam(): void {
    if (this.beamMeshes) {
      this.beamMeshes.core.removeFromParent()
      this.beamMeshes.glow.removeFromParent()
      this.beamMeshes = null
    }
    if (this.beamTween) {
      this.animations.remove(this.beamTween)
      this.beamTween = null
    }
  }

  private updateBeam(elapsed: number, targets: ThemeTargets): void {
    if (!this.beamMeshes) return
    const pulse = 1 + 0.12 * Math.sin(elapsed * 2.8)
    const length = this.beamLength * this.beamReveal
    this.beamMeshes.core.scale.set(0.05 * pulse, length, 0.05 * pulse)
    this.beamMeshes.glow.scale.set(0.17 * pulse, length, 0.17 * pulse)
    this.beamCoreMaterial.color.copy(targets.win.current).multiplyScalar(0.55)
    this.beamGlowMaterial.color.copy(targets.win.current).multiplyScalar(0.5)
    this.beamCoreMaterial.opacity = 0.5 * this.beamReveal
    this.beamGlowMaterial.opacity = (0.2 + 0.06 * Math.sin(elapsed * 5)) * this.beamReveal
  }

  /** Clears pieces and the winning bar: used when a round restarts. */
  reset(): void {
    for (let i = 0; i < 9; i += 1) this.removePiece(i)
    this.clearBeam()
    for (const state of this.tileState) {
      state.lift = 0
      state.glow = 0
    }
    for (const mesh of Object.values(this.previewMeshes)) {
      if (mesh) mesh.visible = false
    }
  }

  /** Settles every piece spring at once (used with reduced motion). */
  snapPieces(): void {
    for (const piece of this.pieces) {
      if (!piece) continue
      piece.spring.value = 1
      piece.spring.velocity = 0
    }
  }

  dispose(): void {
    this.animations.clear()
    this.reset()
    for (const material of this.tileMaterials) material.dispose()
    for (const material of this.slotMaterials) material.dispose()
    for (const material of this.pieceMaterials.values()) material.dispose()
    for (const material of Object.values(this.markMaterials)) material.dispose()
    for (const item of this.disposables) item.dispose()
    this.disposables = []
    for (const geometry of [
      this.tileGeometry,
      this.armGeometry,
      this.ringGeometry,
      this.slotGeometry,
      this.beamGeometry,
    ]) {
      geometry.dispose()
    }
    this.group.clear()
  }
}

function createMarkMaterials(): Record<'X' | 'O', THREE.MeshStandardMaterial> {
  return {
    X: new THREE.MeshStandardMaterial({ color: '#22d3ee', roughness: 0.3, metalness: 0.55 }),
    O: new THREE.MeshStandardMaterial({ color: '#f472b6', roughness: 0.34, metalness: 0.45 }),
  }
}

/** Soft radial blob used as the board's contact shadow. */
function makeRadialTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(128, 128, 8, 128, 128, 124)
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)')
    gradient.addColorStop(0.55, 'rgba(0, 0, 0, 0.34)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 256, 256)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}







