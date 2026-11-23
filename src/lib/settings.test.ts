import { describe, expect, it } from 'vitest'
import { applyPreset, DEFAULTS, growthParams, PRESETS, sanitizeSettings } from './settings'

describe('settings', () => {
  it('drop unknown keys, fill missing ones and bring numbers into range', () => {
    const s = sanitizeSettings({ count: 1e9, segment: -1, mode: 'sideways', colorA: 'red', wat: 1, systems: 2.6 })
    expect(s.count).toBe(60_000)
    expect(s.segment).toBe(0.1)
    expect(s.mode).toBe(DEFAULTS.mode)
    expect(s.colorA).toBe(DEFAULTS.colorA)
    expect(s.systems).toBe(3)
    expect('wat' in s).toBe(false)
  })

  it('presets scale their lengths with the model and suit its mode', () => {
    const small = applyPreset(DEFAULTS, 'organ', 50), big = applyPreset(DEFAULTS, 'organ', 200)
    expect(big.segment / small.segment).toBeCloseTo(4, 6)
    for (const p of PRESETS) {
      const s = applyPreset(DEFAULTS, p.id, 100)
      expect(s.modelLook).toBe(s.mode === 'surface' ? 'solid' : 'glass')
    }
  })

  it('Join never grows loops, which would close the network on its own', () => {
    const p = growthParams({ ...DEFAULTS, loops: true, systems: 2, coupling: 'join' })
    expect(p.topology).toBe('open')
    expect(growthParams({ ...DEFAULTS, loops: true }).topology).toBe('closed')
  })
})
