import { describe, expect, it } from 'vitest'
import { DEFAULTS } from './settings'
import { LINK, veinView } from './view'

describe('veinView', () => {
  // Two trees: A is 0 → 1 → 2 (a dead end at 2) and 1 → 3, B is 4 → 5; 3 and 5 met.
  const net = {
    x: [0, 1, 2, 1, 5, 4], y: [0, 0, 0, 1, 1, 1], z: [0, 0, 0, 0, 0, 0],
    parent: [-1, 0, 1, 1, -1, 4], sys: [0, 0, 0, 0, 1, 1], joins: [], links: [3, 5], points: 6,
  }

  it('Join with Trim dead ends leaves out the end that never met the other tree', () => {
    const s = { ...DEFAULTS, systems: 2, coupling: 'join' as const, trim: true }
    const v = veinView(net, s)
    expect(v.keep && Array.from(v.keep)).toEqual([1, 1, 0, 1, 1, 1])
    // Segments 0-1, 1-3, 4-5, and the link 3-5.
    expect(v.count).toBe(4)
    expect(v.system[v.count - 1]).toBe(LINK)
    const untrimmed = veinView(net, { ...s, trim: false })
    expect(untrimmed.count).toBe(5)
  })

  it('makes a link as wide as the narrower end it joins', () => {
    const s = { ...DEFAULTS, systems: 2, coupling: 'join' as const, trim: false, tipWidth: 0.5 }
    const v = veinView(net, s)
    const o = (v.count - 1) * 8
    expect(v.segs[o + 6]).toBeCloseTo(0.25, 9)
    expect(v.segs[o + 7]).toBeCloseTo(0.25, 9)
  })
})

describe('veinView before the trees meet', () => {
  it('shows every vein in Join while no tree has met the other yet', () => {
    const net = { x: [0, 1, 2], y: [0, 0, 0], z: [0, 0, 0], parent: [-1, 0, 1], sys: [0, 0, 0], joins: [], links: [], points: 3 }
    const v = veinView(net, { ...DEFAULTS, systems: 2, coupling: 'join' as const, trim: true })
    expect(v.count).toBe(2)
  })
})
