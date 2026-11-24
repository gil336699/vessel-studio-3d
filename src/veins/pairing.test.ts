// 1.1: an attractor pulls the nearest vein point that can see it, not just its nearest one, so veins reach the far side
// of a fold. The first two tests fail with 1.0.0's pairing; the others check that the new caches carry on bit for bit
// after a save and after a new clearance (the second fails if a new clearance doesn't search again).
import { describe, expect, it } from 'vitest'
import { Engine, type EngineState, type GrowthParams } from './engine'
import { InsideDomain, scatterInside, type Sdf } from './inside'
import { scatterSurface, SurfaceDomain } from './surface'
import { vase } from '../lib/models'

const params: GrowthParams = {
  segment: 1, kill: 2, attraction: 0, topology: 'open', inertia: 0.25, wiggle: 0.1, pull: 0, pullMode: 'up', crowd: 0.45,
  clearance: 0.5, minLoop: 8, maxPoints: 100_000, seed: 3,
}

// A U as a distance grid: two arms `w` mm wide, 40 mm long and `t` mm thick, `gap` apart, joined at the bottom by a
// bend. Each box's own signed distance, joined by the smallest; the arms run into the bend so no wall shows where they
// meet. A vein up one arm is nearer the other arm's attractors than any vein in that arm, but across the gap.
function uShape(gap: number, w: number, t: number, v: number): InsideDomain {
  const half = gap / 2
  const boxes = [
    { c: [-(half + w / 2), 18.5, 0], h: [w / 2, 21.5, t / 2] },
    { c: [half + w / 2, 18.5, 0], h: [w / 2, 21.5, t / 2] },
    { c: [0, -3, 0], h: [half + w, 3, t / 2] },
  ]
  const lo: [number, number, number] = [-(half + w + 2), -8, -t / 2 - 2], hi = [half + w + 2, 42, t / 2 + 2]
  const nx = Math.ceil((hi[0] - lo[0]) / v) + 1, ny = Math.ceil((hi[1] - lo[1]) / v) + 1, nz = Math.ceil((hi[2] - lo[2]) / v) + 1
  const F = new Float32Array(nx * ny * nz)
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = [lo[0] + i * v, lo[1] + j * v, lo[2] + k * v]
    let d = Infinity
    for (const { c, h } of boxes) {
      const q = p.map((x, a) => Math.abs(x - c[a]) - h[a])
      d = Math.min(d, Math.hypot(...q.map(x => Math.max(x, 0))) + Math.min(Math.max(...q), 0))
    }
    F[i + nx * (j + ny * k)] = d
  }
  const sdf: Sdf = { nx, ny, nz, origin: lo, v, F }
  return new InsideDomain(sdf)
}

function grow(e: Engine, cap = 3000) {
  for (let s = 0; s < cap && e.stepOnce() && !e.done; s++) { /* grow */ }
  return e
}

const armA = -4, armB = 4

describe('pairing with the nearest vein that sees an attractor', () => {
  // Arms 6 mm wide and thick, 2 mm apart: their middles are 8 mm apart.
  const dom = uShape(2, 6, 6, 0.35)

  it('pulls a vein on the attractor’s own side when the nearest vein is across a wall', () => {
    // One attractor at the top of arm B. Its nearest vein point is the root at the top of arm A, 8 mm away but across
    // the gap; the root in arm B, 9 mm below it, sees it. With 1.0.0 nothing grew and the attractor was left.
    const s = [armB, 36, 0]
    const e = grow(new Engine(dom, { p: Float64Array.from(s), n: null }, params, { roots: [{ at: [armA, 36, 0] }, { at: [armB, 27, 0] }] }))
    expect(e.done).toBe('reached')
    expect(e.live).toBe(0)
    // Arm B's vein grew up to it.
    expect(Math.max(...Array.from(e.y).filter((_, i) => e.x[i] > 0))).toBeGreaterThan(36 - params.kill - 1e-9)
  })

  it('fills both arms of a U with a thin gap from one root', () => {
    // A gap of 0.4 mm, narrower than the kill distance: veins up arm A are the nearest to many attractors in arm B. With
    // 1.0.0, 37 of 1,200 were left there; every thin-gap U tried (gaps of 0.4 and 0.6 mm, arms 5 and 7 mm, 1,200 and 2,400
    // attractors) left 6 to 55, and 1.1 none.
    const thin = uShape(0.4, 5, 5, 0.25)
    const narrow = { ...params, clearance: 0.2 }
    const placed = scatterInside(thin, { count: 1200, placement: 'even', seed: 2, clearance: narrow.clearance, shell: 3 })
    const e = grow(new Engine(thin, { p: placed.p, n: null }, narrow, { roots: [{ at: [-2.7, 38, 0] }] }))
    expect(e.live).toBeLessThanOrEqual(2)
  })

  it('carries on bit for bit after a save half way through', () => {
    const placed = scatterInside(dom, { count: 900, placement: 'even', seed: 5, clearance: params.clearance, shell: 3 })
    const start = () => new Engine(dom, { p: placed.p, n: null }, params, { roots: [{ at: [armA, 38, 0] }] })
    const whole = grow(start())
    const first = start()
    for (let s = 0; s < 30; s++) first.stepOnce()
    const saved: EngineState = JSON.parse(JSON.stringify({ ...first.snapshot(), x: [...first.x], y: [...first.y], z: [...first.z], n: [...first.normals()], parent: [...first.parent], sys: [...first.sys], joins: [...first.joins], links: [...first.links], used: [...first.used] }))
    const resumed = grow(new Engine(dom, { p: placed.p, n: null }, params, { state: saved }))
    expect(resumed.points).toBe(whole.points)
    expect(Array.from(resumed.x)).toEqual(Array.from(whole.x))
    expect(Array.from(resumed.used)).toEqual(Array.from(whole.used))
  })

  it('carries on bit for bit with loops, and after the clearance changes', () => {
    // Loops search the neighbourhood among the points that see a source, from the same caches.
    const sheet = new SurfaceDomain(vase())
    const placed = scatterSurface(sheet, { count: 1500, placement: 'even', seed: 4, clearance: 1 })
    const loops: GrowthParams = { ...params, clearance: 1, topology: 'closed', kill: 1.6 }
    const roots = sheet.rimRoots(4, 2)
    const whole = grow(new Engine(sheet, placed, loops, { roots }))
    const first = new Engine(sheet, placed, loops, { roots })
    for (let s = 0; s < 40; s++) first.stepOnce()
    const resumed = grow(new Engine(sheet, placed, loops, { state: first.snapshot() }))
    expect(resumed.joins.length).toBeGreaterThan(20)
    expect(Array.from(resumed.joins)).toEqual(Array.from(whole.joins))
    expect(Array.from(resumed.x)).toEqual(Array.from(whole.x))
    // A new clearance works out what sees what again, as reopening with it would.
    const inside = scatterInside(dom, { count: 900, placement: 'even', seed: 6, clearance: 0.5, shell: 3 })
    const a = new Engine(dom, { p: inside.p, n: null }, params, { roots: [{ at: [armA, 38, 0] }] })
    for (let s = 0; s < 25; s++) a.stepOnce()
    a.setParams({ ...params, clearance: 0.8 })
    const b = new Engine(dom, { p: inside.p, n: null }, { ...params, clearance: 0.8 }, { state: a.snapshot() })
    grow(a); grow(b)
    expect(Array.from(b.x)).toEqual(Array.from(a.x))
    expect(Array.from(b.used)).toEqual(Array.from(a.used))
  })

  it('carries on bit for bit after the attraction or kill distance changes, as reopening with it would', () => {
    // Both decide how far the vein that sees an attractor may be: an attraction distance shorter than the kill distance
    // still lets a vein within the kill distance use an attractor up.
    const inside = scatterInside(dom, { count: 900, placement: 'even', seed: 8, clearance: 0.5, shell: 3 })
    for (const patch of [{ attraction: 6 }, { attraction: 1.5 }, { kill: 3 }, { attraction: 6, kill: 1.2 }]) {
      const a = new Engine(dom, { p: inside.p, n: null }, params, { roots: [{ at: [armA, 38, 0] }, { at: [armB, 30, 0] }] })
      for (let s = 0; s < 20; s++) a.stepOnce()
      a.setParams({ ...params, ...patch })
      const b = new Engine(dom, { p: inside.p, n: null }, { ...params, ...patch }, { state: a.snapshot() })
      grow(a); grow(b)
      expect(b.points).toBeGreaterThan(40)
      expect(Array.from(b.x)).toEqual(Array.from(a.x))
      expect(Array.from(b.used)).toEqual(Array.from(a.used))
    }
    // On the surface with no attraction distance, the kill distance changes nothing the caches hold, so they aren't
    // searched again: the result must still be what reopening with it gives.
    const sheet = new SurfaceDomain(vase())
    const placed = scatterSurface(sheet, { count: 1500, placement: 'even', seed: 4, clearance: 1 })
    const onSkin = { ...params, clearance: 1 }
    const a = new Engine(sheet, placed, onSkin, { roots: sheet.rimRoots(4, 2) })
    for (let s = 0; s < 30; s++) a.stepOnce()
    a.setParams({ ...onSkin, kill: 1.2 })
    const b = new Engine(sheet, placed, { ...onSkin, kill: 1.2 }, { state: a.snapshot() })
    grow(a); grow(b)
    expect(Array.from(b.x)).toEqual(Array.from(a.x))
    expect(Array.from(b.used)).toEqual(Array.from(a.used))
  })
})
