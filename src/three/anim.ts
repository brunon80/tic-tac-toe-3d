export interface Animatable {
  update?: (dt: number) => void
  tick?: (dt: number) => void
}

export const EASE = {
  linear: (t: number): number => t,
  outCubic: (t: number): number => 1 - (1 - t) ** 3,
  outQuint: (t: number): number => 1 - (1 - t) ** 5,
  inOutCubic: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  /** Overshoots slightly, then settles — used for piece "pops". */
  outBack: (t: number): number => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
  },
} as const

export type EaseFn = (t: number) => number

export interface TweenOptions {
  duration: number
  delay?: number
  ease?: EaseFn
  onUpdate: (t: number, dt: number) => void
  onStart?: () => void
  onDone?: () => void
}

/** A time-based tween that removes itself once finished. */
export class Tween implements Animatable {
  private elapsed = 0
  private started = false
  private done = false

  private readonly duration: number
  private readonly delay: number
  private readonly ease: EaseFn

  constructor(private readonly options: TweenOptions) {
    this.duration = Math.max(0.0001, options.duration)
    this.delay = Math.max(0, options.delay ?? 0)
    this.ease = options.ease ?? EASE.outCubic
  }

  get finished(): boolean {
    return this.done
  }

  /** Returns true once the tween has finished (used to prune the runner). */
  update(dt: number): void {
    if (this.done) return
    const step = Math.min(dt, this.duration + this.delay - this.elapsed)
    this.elapsed += dt
    if (!this.started && this.elapsed >= this.delay) {
      this.started = true
      this.options.onStart?.()
    }
    if (!this.started) return

    const raw = clamp01((this.elapsed - this.delay) / this.duration)
    this.options.onUpdate(this.ease(raw), Math.max(0, step))
    if (raw >= 1) {
      this.done = true
      this.options.onDone?.()
    }
  }
}

/** A small set of animatable jobs: add, remove and tick them all each frame. */
export class AnimationRunner {
  private jobs: Animatable[] = []

  add(job: Animatable): void {
    if (!this.jobs.includes(job)) this.jobs.push(job)
  }

  remove(job: Animatable): void {
    const index = this.jobs.indexOf(job)
    if (index >= 0) this.jobs.splice(index, 1)
  }

  has(job: Animatable): boolean {
    return this.jobs.includes(job)
  }

  clear(): void {
    this.jobs = []
  }

  get size(): number {
    return this.jobs.length
  }

  tick(dt: number): void {
    if (this.jobs.length === 0) return
    const snapshot = [...this.jobs]
    for (const job of snapshot) {
      if (job.update) job.update(dt)
      else if (job.tick) job.tick(dt)
      if (job instanceof Tween && job.finished) this.remove(job)
    }
  }
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** Critically-damped approach: frame-rate independent, never overshoots. */
export function approach(current: number, goal: number, dt: number, speed = 9): number {
  return current + (goal - current) * (1 - Math.exp(-speed * dt))
}

export interface Motion4 {
  x: number
  y: number
  z: number
  scale: number
}

export interface SpringState {
  value: number
  velocity: number
}

export interface SpringOptions {
  stiffness: number
  damping: number
  precision: number
}

export const SOFT_SPRING: SpringOptions = { stiffness: 90, damping: 12, precision: 0.002 }
export const SNAPPY_SPRING: SpringOptions = { stiffness: 190, damping: 16, precision: 0.0015 }

/**
 * Semi-implicit Euler spring integration.
 * Returns the new value and, when `out` is given, writes the state into it.
 */
export function integrateSpring(
  state: SpringState,
  goal: number,
  dt: number,
  options: SpringOptions = SOFT_SPRING,
): number {
  const step = Math.min(dt, 1 / 45)
  const a = -options.stiffness * (state.value - goal) - options.damping * state.velocity
  state.velocity += a * step
  state.value += state.velocity * step
  if (Math.abs(state.value - goal) < options.precision && Math.abs(state.velocity) < options.precision) {
    state.value = goal
    state.velocity = 0
  }
  return state.value
}

export function springState(value: number): SpringState {
  return { value, velocity: 0 }
}
