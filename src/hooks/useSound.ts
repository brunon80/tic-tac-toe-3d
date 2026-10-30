import { useCallback, useEffect, useMemo, useRef } from 'react'

export interface SoundApi {
  enabled: boolean
  move: (mark: 'X' | 'O') => void
  win: (mark: 'X' | 'O') => void
  draw: () => void
  invalid: () => void
  resume: () => void
}

type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle'

interface ToneOptions {
  freq: number
  type: OscillatorType
  gain: number
  duration: number
  delay?: number
  slideTo?: number
}

/** Tiny WebAudio sound kit: no samples, just short shaped tones. */
export function useSound(enabled: boolean): SoundApi {
  const contextRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)

  const ensure = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    if (!contextRef.current) {
      const context = new Ctor()
      const master = context.createGain()
      master.gain.value = 0.18
      master.connect(context.destination)
      contextRef.current = context
      masterRef.current = master
    }
    const context = contextRef.current
    if (context.state === 'suspended') void context.resume()
    return context
  }, [])

  useEffect(() => {
    const resume = () => {
      ensure()
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
    }
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
    return () => {
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
      void contextRef.current?.close()
      contextRef.current = null
      masterRef.current = null
    }
  }, [ensure])

  const tone = useCallback(
    (options: ToneOptions) => {
      if (!enabled) return
      const context = ensure()
      const master = masterRef.current
      if (!context || !master) return
      const start = context.currentTime + (options.delay ?? 0)
      const osc = context.createOscillator()
      const gain = context.createGain()
      osc.type = options.type
      osc.frequency.setValueAtTime(options.freq, start)
      if (options.slideTo) osc.frequency.exponentialRampToValueAtTime(options.slideTo, start + options.duration)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(options.gain, start + 0.014)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration)
      osc.connect(gain)
      gain.connect(master)
      osc.start(start)
      osc.stop(start + options.duration + 0.03)
    },
    [ensure, enabled],
  )

  const move = useCallback(
    (mark: 'X' | 'O') => {
      tone({ freq: mark === 'X' ? 460 : 360, type: 'triangle', gain: 0.55, duration: 0.16, slideTo: mark === 'X' ? 300 : 250 })
    },
    [tone],
  )

  const win = useCallback(
    (mark: 'X' | 'O') => {
      const root = mark === 'X' ? 392 : 330
      const notes = [1, 1.25, 1.5, 2]
      notes.forEach((multiple, index) => {
        tone({ freq: root * multiple, type: index === 0 ? 'triangle' : 'sine', gain: 0.5, duration: 0.4, delay: index * 0.09 })
      })
    },
    [tone],
  )

  const draw = useCallback(() => {
    tone({ freq: 300, type: 'sine', gain: 0.42, duration: 0.34, slideTo: 210 })
    tone({ freq: 452, type: 'sine', gain: 0.3, duration: 0.34, delay: 0.09, slideTo: 330 })
  }, [tone])

  const invalid = useCallback(() => {
    tone({ freq: 180, type: 'square', gain: 0.24, duration: 0.1 })
  }, [tone])

  return useMemo(
    () => ({ enabled, move, win, draw, invalid, resume: () => void ensure()?.resume() }),
    [ensure, enabled, move, win, draw, invalid],
  )
}
