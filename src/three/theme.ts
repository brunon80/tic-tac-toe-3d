import * as THREE from 'three'

import type { ThemePalette } from '../theme/palette'
import type { Animatable } from './anim'

/** A colour that eases towards a goal colour. */
export class ColorChannel {
  readonly current: THREE.Color
  private readonly goal: THREE.Color

  constructor(hex: string) {
    this.current = new THREE.Color(hex)
    this.goal = this.current.clone()
  }

  snap(hex: string): void {
    this.current.set(hex)
    this.goal.set(hex)
  }

  setGoal(hex: string): void {
    this.goal.set(hex)
  }

  tick(dt: number, speed = 7): void {
    lerpColorToward(this.current, this.goal, dt, speed)
  }

  cloneInto(target: THREE.Color): THREE.Color {
    return target.copy(this.current)
  }
}

/** A number that eases towards a goal value. */
export class NumberChannel {
  current: number
  private goal: number

  constructor(value: number) {
    this.current = value
    this.goal = value
  }

  snap(value: number): void {
    this.current = value
    this.goal = value
  }

  setGoal(value: number): void {
    this.goal = value
  }

  tick(dt: number, speed = 7): void {
    this.current = lerpToward(this.current, this.goal, dt, speed)
  }
}

export function lerpColorToward(
  color: THREE.Color,
  goal: THREE.Color,
  dt: number,
  speed = 7,
  ease = true,
): void {
  const t = ease ? 1 - Math.exp(-speed * dt) : clamp01(speed * dt)
  color.lerp(goal, t)
}

export function lerpToward(current: number, goal: number, dt: number, speed = 7, ease = true): number {
  const t = ease ? 1 - Math.exp(-speed * dt) : clamp01(speed * dt)
  return current + (goal - current) * t
}

export function dampScale(current: number, dt: number, speed = 9): number {
  return current * Math.exp(-speed * dt)
}

/**
 * Every value the theme controls. The scene reads `current` each frame, so a
 * theme change animates smoothly instead of snapping.
 */
export class ThemeTargets {
  readonly background = new ColorChannel('#07030f')
  readonly sky = new ColorChannel('#1a1140')
  readonly frame = new ColorChannel('#241a4d')
  readonly tile = new ColorChannel('#2b2060')
  readonly tileHover = new ColorChannel('#443189')
  readonly gridLine = new ColorChannel('#8b5cf6')
  readonly x = new ColorChannel('#22d3ee')
  readonly o = new ColorChannel('#f472b6')
  readonly win = new ColorChannel('#a3e635')
  readonly accent = new ColorChannel('#8b5cf6')
  readonly shadow = new ColorChannel('#04010a')

  readonly exposure = new NumberChannel(1.05)
  readonly emissive = new NumberChannel(0.5)
  readonly metalness = new NumberChannel(0.4)
  readonly roughness = new NumberChannel(0.34)
  readonly ambient = new NumberChannel(0.7)
  readonly keyLight = new NumberChannel(2.2)
  readonly rimLight = new NumberChannel(3.2)
  readonly bloom = new NumberChannel(0.8)

  private readonly channels: Animatable[] = [
    this.background,
    this.sky,
    this.frame,
    this.tile,
    this.tileHover,
    this.gridLine,
    this.x,
    this.o,
    this.win,
    this.accent,
    this.shadow,
    this.exposure,
    this.emissive,
    this.metalness,
    this.roughness,
    this.ambient,
    this.keyLight,
    this.rimLight,
    this.bloom,
  ]

  setPalette(palette: ThemePalette, animate: boolean): void {
    const pairs: [ColorChannel, string][] = [
      [this.background, palette.background[1]],
      [this.sky, palette.background[0]],
      [this.frame, palette.boardFrame],
      [this.tile, palette.tile],
      [this.tileHover, palette.tileHover],
      [this.gridLine, palette.gridLine],
      [this.x, palette.x],
      [this.o, palette.o],
      [this.win, palette.win],
      [this.accent, palette.accent],
      [this.shadow, palette.shadow],
    ]
    for (const [channel, hex] of pairs) {
      if (animate) channel.setGoal(hex)
      else channel.snap(hex)
    }

    const numbers: [NumberChannel, number][] = [
      [this.exposure, palette.exposure],
      [this.emissive, palette.emissive],
      [this.metalness, palette.metalness],
      [this.roughness, palette.roughness],
      [this.ambient, palette.ambientIntensity],
      [this.keyLight, palette.keyIntensity],
      [this.rimLight, palette.rimIntensity],
      [this.bloom, palette.bloom.strength],
    ]
    for (const [channel, value] of numbers) {
      if (animate) channel.setGoal(value)
      else channel.snap(value)
    }
  }

  /** Applies an extra look change (for example turning bloom off). */
  tune(patch: Partial<Record<'bloom' | 'emissive', number>>): void {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      if (key === 'bloom') this.bloom.setGoal(value)
      else this.emissive.setGoal(value)
    }
  }

  tick(dt: number): void {
    for (const channel of this.channels) channel.tick?.(dt)
  }
}

export type { Animatable }

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
