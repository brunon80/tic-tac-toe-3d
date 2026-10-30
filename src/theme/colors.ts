export interface Rgb {
  r: number
  g: number
  b: number
  a: number
}

export function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)
}

export function normalizeHex(value: string): string {
  if (!isHexColor(value)) return '#000000'
  let hex = value.slice(1)
  if (hex.length === 3 || hex.length === 4) hex = hex.split('').map((c) => c + c).join('')
  return `#${hex.slice(0, 6).toLowerCase()}`
}

export function hexToRgb(hex: string): Rgb {
  const full = normalizeHex(hex)
  return {
    r: Number.parseInt(full.slice(1, 3), 16),
    g: Number.parseInt(full.slice(3, 5), 16),
    b: Number.parseInt(full.slice(5, 7), 16),
    a: 1,
  }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** Perceived brightness, 0..1 (sRGB relative luminance). */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const linear = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

export function isLight(hex: string): boolean {
  return luminance(hex) > 0.45
}

export function mix(from: string, to: string, amount: number): string {
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  const t = Math.max(0, Math.min(1, amount))
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: 1,
  })
}

export function lighten(hex: string, amount: number): string {
  return mix(hex, '#ffffff', amount)
}

export function darken(hex: string, amount: number): string {
  return mix(hex, '#000000', amount)
}

/** A colour guaranteed to be readable on `background`. */
export function readableOn(background: string): string {
  return isLight(background) ? '#10151f' : '#f7f9fc'
}

export function rgbaString(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`
}

/** Random pleasant accent for the "shuffle colours" button. */
export function randomAccent(rng: () => number = Math.random): string {
  const hue = Math.floor(rng() * 360)
  const saturation = 70 + Math.floor(rng() * 25)
  const lightness = 52 + Math.floor(rng() * 18)
  return hslToHex(hue, saturation, lightness)
}

export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100
  const l = lightness / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hh = ((hue % 360) + 360) % 360
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x]
  return rgbToHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a: 1 })
}
