import { describe, expect, it } from 'vitest'
import { lens, sphere, vase } from '../lib/models'
import { Engine, type EngineState, type GrowthParams, type Root } from './engine'
import { buildSdf, InsideDomain, scatterInside } from './inside'
import { PointTree } from './kdtree'
import { separateWidths, systemGap, trimDeadEnds, veinWidths } from './network'
import { Rng } from './random'
import { scatterSurface, SurfaceDomain } from './surface'

const base: GrowthParams = {
  segment: 1, kill: 2, attraction: 0, topology: 'open', inertia: 0.25, wiggle: 0.1, pull: 0, pullMode: 'up', crowd: 0.45,
  clearance: 0.8, minLoop: 8, maxPoints: 200_000, seed: 3,
}

// A small ball, its distance grid and attractors, shared by the inside tests.
const ball = sphere(15, 3)
const { sdf } = buildSdf(ball, 70)
const inside = new InsideDomain(sdf)

function grow(e: Engine, cap = 2000) {
  for (let s = 0; s < cap && e.stepOnce() && !e.done; s++) { /* grow */ }
  return e
}

function fingerprint(e: Engine) {
  let h = 0
  for (let i = 0; i < e.points; i++) h = (h * 31 + Math.round(e.x[i] * 1e6) + 7 * Math.round(e.y[i] * 1e6) + 13 * Math.round(e.z[i] * 1e6) + e.parent[i]) % 2147483647
  return { points: e.points, step: e.step, live: e.live, joins: e.joins.length, links: e.links.length, h }
}

describe('PointTree', () => {
  it('finds the nearest point, and the lower index on a tie, as a full search does', () => {
    const rng = new Rng(9)
    const n = 500, xs = new Float64Array(n), ys = new Float64Array(n), zs = new Float64Array(n)
    // Coordinates on a coarse lattice, so equal distances happen.
    for (let i = 0; i < n; i++) { xs[i] = Math.floor(rng.next() * 8); ys[i] = Math.floor(rng.next() * 8); zs[i] = Math.floor(rng.next() * 8) }
    const ids = Array.from({ length: n }, (_, i) => i)
    const tree = new PointTree(xs, ys, zs, ids)
    for (let q = 0; q < 300; q++) {
      const qx = rng.next() * 8, qy = Math.floor(rng.next() * 8) + 0.5, qz = Math.floor(rng.next() * 8)
      let best = Infinity, id = -1
      for (let i = 0; i < n; i++) { const d = (xs[i] - qx) ** 2 + (ys[i] - qy) ** 2 + (zs[i] - qz) ** 2; if (d < best) { best = d; id = i } }
      tree.nearest(qx, qy, qz, Infinity, -1)
      expect(tree.bestD2).toBe(best)
      expect(tree.bestId).toBe(id)
    }
  })
})

describe('Inside', () => {
  const placed = scatterInside(inside, { count: 1500, placement: 'even', seed: 2, clearance: base.clearance, shell: 3 })
  const root = inside.rootFromSkin([0, 0, -15], [0, 0, -1], base.clearance, base.segment)!

  it('places the exact count of attractors, all clear of the wall', () => {
    expect(placed.p.length / 3).toBe(1500)
    for (let i = 0; i < placed.p.length; i += 3) expect(-inside.at(placed.p[i], placed.p[i + 1], placed.p[i + 2])).toBeGreaterThan(base.clearance)
  })

  it('keeps every vein point inside and at least the edge clearance from the wall', () => {
    const e = grow(new Engine(inside, { p: placed.p, n: null }, base, { roots: [root] }))
    expect(e.points).toBeGreaterThan(500)
    const fixed = new Set(e.fixedPoints())
    for (let i = 0; i < e.points; i++) if (!fixed.has(i)) expect(-inside.at(e.x[i], e.y[i], e.z[i])).toBeGreaterThanOrEqual(base.clearance - 1e-9)
    // Segments too, sampled along their length: none cuts the wall.
    for (let v = 0; v < e.points; v++) {
      const p = e.parent[v]
      if (p < 0 || fixed.has(p)) continue
      for (let t = 0.25; t < 1; t += 0.25) expect(-inside.at(e.x[p] + (e.x[v] - e.x[p]) * t, e.y[p] + (e.y[v] - e.y[p]) * t, e.z[p] + (e.z[v] - e.z[p]) * t)).toBeGreaterThan(base.clearance - 0.05)
    }
  })

  it('carries on bit for bit after a save half way through', () => {
    const whole = grow(new Engine(inside, { p: placed.p, n: null }, base, { roots: [root] }))
    const first = new Engine(inside, { p: placed.p, n: null }, base, { roots: [root] })
    for (let s = 0; s < 25; s++) first.stepOnce()
    const saved: EngineState = JSON.parse(JSON.stringify({ ...first.snapshot(), x: [...first.x], y: [...first.y], z: [...first.z], n: [...first.normals()], parent: [...first.parent], sys: [...first.sys], joins: [...first.joins], links: [...first.links], used: [...first.used] }))
    const resumed = grow(new Engine(inside, { p: placed.p, n: null }, base, { state: saved }))
    expect(fingerprint(resumed)).toEqual(fingerprint(whole))
  })
})

describe('Surface', () => {
  const sheet = vase()
  const dom = new SurfaceDomain(sheet)
  const params = { ...base, clearance: 1 }
  const placed = scatterSurface(dom, { count: 2500, placement: 'even', seed: 4, clearance: params.clearance })
  const roots: Root[] = dom.rimRoots(4, 2)

  it('finds the vase mouth as its one open rim', () => {
    expect(dom.rims.length).toBe(1)
    expect(roots.length).toBe(4)
  })

  it('keeps every vein point on the skin and the clearance from the rim', () => {
    const e = grow(new Engine(dom, placed, params, { roots }))
    expect(e.points).toBeGreaterThan(300)
    const s = new Float64Array(6)
    for (let i = 0; i < e.points; i++) {
      dom.snap(e.x[i], e.y[i], e.z[i], s)
      expect(Math.hypot(s[0] - e.x[i], s[1] - e.y[i], s[2] - e.z[i])).toBeLessThan(1e-4)
    }
    // Roots are placed 2 mm in; every grown point keeps the 1 mm clearance.
    for (let i = roots.length; i < e.points; i++) expect(dom.rimDistance(e.x[i], e.y[i], e.z[i], 5)).toBeGreaterThanOrEqual(params.clearance - 1e-9)
  })

  it('never pairs an attractor with a vein whose skin faces the other way', () => {
    expect(dom.sees(0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0)).toBe(false)
    expect(dom.sees(0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0)).toBe(true)
  })

  it('carries on bit for bit after a save half way through', () => {
    const whole = grow(new Engine(dom, placed, params, { roots }))
    const first = new Engine(dom, placed, params, { roots })
    for (let s = 0; s < 30; s++) first.stepOnce()
    const resumed = grow(new Engine(dom, placed, params, { state: first.snapshot() }))
    expect(fingerprint(resumed)).toEqual(fingerprint(whole))
  })
})

describe('Two systems', () => {
  const shape = lens(30, 13, 12, 3)
  const { sdf: lensSdf } = buildSdf(shape, 80)
  const dom = new InsideDomain(lensSdf)
  const widths = { rule: 'murray' as const, tip: 0.5, max: 3, exponent: 2.5 }
  const inlet = { ...dom.rootFromSkin([-30, 0, 0], [-1, 0, 0], 0.8, 1)!, system: 0 }
  const outlet = { ...dom.rootFromSkin([30, 0, 0], [1, 0, 0], 0.8, 1)!, system: 1 }

  it('Interweave keeps the systems a gap apart, once widths are capped where they pass close', () => {
    const placed = scatterInside(dom, { count: 2400, placement: 'even', seed: 5, clearance: 0.8, shell: 3 })
    const sys = Uint8Array.from({ length: placed.p.length / 3 }, (_, i) => i % 2)
    const params: GrowthParams = { ...base, systems: 2, coupling: 'interweave', gap: 0.4, repel: 0.3, widths }
    const e = grow(new Engine(dom, { p: placed.p, n: null, sys }, params, { roots: [inlet, outlet] }))
    expect([0, 1].map(t => e.sys.filter(s => s === t).length).every(c => c > 200)).toBe(true)
    const murray = veinWidths(e.parent, e.points, widths)
    const capped = separateWidths(e.x, e.y, e.z, e.parent, e.sys, e.points, murray, 0.4)
    expect(capped.closest).toBeGreaterThanOrEqual(0.4 - 1e-6)
    expect(systemGap(e.x, e.y, e.z, e.parent, e.sys, e.points, capped.widths)).toBeGreaterThanOrEqual(0.4 - 1e-6)
    // Without the cap, the Murray widths that grew afterwards bring tubes closer than the gap.
    expect(systemGap(e.x, e.y, e.z, e.parent, e.sys, e.points, murray)).toBeLessThan(0.4)
  })

  it('Join grows an inlet tree and an outlet tree that meet, and trimming leaves only veins that carry flow', () => {
    const placed = scatterInside(dom, { count: 800, placement: 'even', seed: 6, clearance: 0.8, shell: 3 })
    const params: GrowthParams = { ...base, systems: 2, coupling: 'join', tipPull: 0.6, widths }
    const e = grow(new Engine(dom, { p: placed.p, n: null }, params, { roots: [inlet, outlet] }))
    expect(e.links.length / 2).toBeGreaterThan(10)
    const keep = trimDeadEnds(e.parent, e.points, e.links)
    // Every kept vein end is a join between the trees.
    const kids = new Int32Array(e.points)
    for (let v = 0; v < e.points; v++) if (keep[v] && e.parent[v] >= 0) kids[e.parent[v]]++
    const linked = new Set(Array.from(e.links))
    for (let v = 0; v < e.points; v++) if (keep[v] && e.parent[v] >= 0 && kids[v] === 0) expect(linked.has(v)).toBe(true)
    // Links join the two trees, never a tree to itself.
    for (let i = 0; i < e.links.length; i += 2) expect(e.sys[e.links[i]]).not.toBe(e.sys[e.links[i + 1]])
  })

  it('Join carries on bit for bit after a save half way through', () => {
    const placed = scatterInside(dom, { count: 600, placement: 'even', seed: 7, clearance: 0.8, shell: 3 })
    const params: GrowthParams = { ...base, systems: 2, coupling: 'join', tipPull: 0.6, widths }
    const whole = grow(new Engine(dom, { p: placed.p, n: null }, params, { roots: [inlet, outlet] }))
    const first = new Engine(dom, { p: placed.p, n: null }, params, { roots: [inlet, outlet] })
    for (let s = 0; s < 20; s++) first.stepOnce()
    const resumed = grow(new Engine(dom, { p: placed.p, n: null }, params, { state: first.snapshot() }))
    expect(fingerprint(resumed)).toEqual(fingerprint(whole))
  })
})
