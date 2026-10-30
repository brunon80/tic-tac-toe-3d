import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { EASE, clamp01 } from './anim'

const HOME_POSITION = new THREE.Vector3(0, 4.25, 5.05)
const HOME_TARGET = new THREE.Vector3(0, 0.42, 0)
const MIN_DISTANCE = 4.2
const MAX_DISTANCE = 10.5
const MIN_POLAR = 0.5
const MAX_POLAR = 1.34
const AZIMUTH_LIMIT = 0.95

export type CameraMode = 'orbit' | 'locked'

interface Spherical {
  radius: number
  phi: number
  theta: number
}

function homeSpherical(): Spherical {
  return {
    radius: HOME_POSITION.distanceTo(HOME_TARGET),
    phi: Math.acos(clamp01(HOME_POSITION.y / HOME_POSITION.distanceTo(HOME_TARGET))),
    theta: Math.atan2(HOME_POSITION.x, HOME_POSITION.z),
  }
}

export interface CameraOptions {
  mode: CameraMode
  reducedMotion: boolean
}

/** Perspective camera, its framing limits and the intro/idle camera motion. */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls

  private readonly home: Spherical
  private mode: CameraMode = 'orbit'
  private reducedMotion = false
  private introDuration = 1.15
  private introElapsed = 0
  private interacting = false

  private readonly onInteractionStart = (): void => {
    this.interacting = true
  }

  private readonly onInteractionEnd = (): void => {
    this.interacting = false
  }

  constructor(canvas: HTMLCanvasElement) {
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 140)
    this.camera.position.copy(HOME_POSITION)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.target.copy(HOME_TARGET)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.075
    this.controls.enablePan = false
    this.controls.rotateSpeed = 0.55
    this.controls.zoomSpeed = 0.7
    this.controls.minDistance = MIN_DISTANCE
    this.controls.maxDistance = MAX_DISTANCE
    this.controls.minPolarAngle = MIN_POLAR
    this.controls.maxPolarAngle = MAX_POLAR
    this.controls.minAzimuthAngle = -AZIMUTH_LIMIT
    this.controls.maxAzimuthAngle = AZIMUTH_LIMIT

    this.home = homeSpherical()
    this.applyHome()
    this.controls.addEventListener('start', this.onInteractionStart)
    this.controls.addEventListener('end', this.onInteractionEnd)
  }

  private applyHome(): void {
    this.camera.position.copy(HOME_POSITION)
    this.controls.target.copy(HOME_TARGET)
    this.camera.lookAt(HOME_TARGET)
  }

  setViewport(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height)
    this.camera.updateProjectionMatrix()
  }

  setOptions(options: CameraOptions): void {
    this.mode = options.mode
    this.reducedMotion = options.reducedMotion
    this.controls.enableRotate = this.mode === 'orbit'
    this.controls.enableZoom = this.mode === 'orbit'
    this.introDuration = this.reducedMotion ? 0.001 : 1.15
    this.introElapsed = 0
  }

  /** Plays the intro again (called on mount and when the camera mode changes). */
  startIntro(duration = this.reducedMotion ? 0.001 : 0.9): void {
    this.introElapsed = 0
    this.introDuration = duration
  }

  resetView(): void {
    this.startIntro()
    this.controls.reset()
    this.applyHome()
  }

  private place(spherical: Spherical): void {
    this.camera.position
      .setFromSpherical(new THREE.Spherical(spherical.radius, spherical.phi, spherical.theta))
      .add(this.controls.target)
    this.camera.lookAt(this.controls.target)
  }

  update(dt: number, elapsed: number): void {
    if (this.introDuration > 0) {
      this.introElapsed += dt
      const t = clamp01(this.introElapsed / this.introDuration)
      const e = EASE.outCubic(t)
      this.place({
        radius: this.home.radius + (1 - e) * 5.2,
        phi: this.home.phi - (1 - e) * 0.5,
        theta: this.home.theta + Math.sin((1 - t) * Math.PI) * 0.22,
      })
      if (t >= 1) this.introDuration = 0
    }

    if (this.mode === 'orbit' && !this.reducedMotion && this.introDuration <= 0 && !this.interacting) {
      this.controls.rotateLeft(Math.sin(elapsed * 0.45) * 0.055 * dt)
    }

    this.controls.update(dt)
  }

  dispose(): void {
    this.controls.removeEventListener('start', this.onInteractionStart)
    this.controls.removeEventListener('end', this.onInteractionEnd)
    this.controls.dispose()
  }
}
