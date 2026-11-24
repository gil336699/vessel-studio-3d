// Tests for problems the independent review and the QA rounds found. Each fails without its fix.
import { describe, expect, it } from 'vitest'
import { weld, type MeshData } from '../lib/mesh'
import { lens, sphere, vase } from '../lib/models'
import { parseStl, StlError } from '../lib/stl'
import { Engine, type GrowthParams } from './engine'
import { PointGrid } from './grid'
import { buildSdf, InsideDomain, scatterInside } from './inside'
import { scatterSurface, SurfaceDomain } from './surface'

const params: GrowthParams = { segment: 1, kill: 2, attraction: 0, topology: 'open', inertia: 0.25, wiggle: 0.1, pull: 0, pullMode: 'up', crowd: 0.45, clearance: 0, minLoop: 8, maxPoints: 100_000, seed: 1 }

const flip = (m: MeshData): MeshData => {
  const I = m.indices.slice()
  for (let f = 0; f < I.length; f += 3) { const t = I[f + 1]; I[f + 1] = I[f + 2]; I[f + 2] = t }
  return { positions: m.positions, indices: I }
}

// A closed box of small triangles, `a` mm on a side, centred on the origin, welded at its edges as reading an STL does.
function box(a = 40, n = 8): MeshData {
  const P: number[] = [], I: number[] = []
  const faces: number[][][] = [
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]], [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  ]
  for (const [nrm, u, v] of faces) {
    const base = P.length / 3
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const s = (i / n - 0.5) * a, t = (j / n - 0.5) * a
      P.push(nrm[0] * a / 2 + u[0] * s + v[0] * t, nrm[1] * a / 2 + u[1] * s + v[1] * t, nrm[2] * a / 2 + u[2] * s + v[2] * t)
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const q = base + j * (n + 1) + i; I.push(q, q + 1, q + n + 2, q, q + n + 2, q + n + 1) }
  }
  return weld(I.flatMap(q => [P[q * 3], P[q * 3 + 1], P[q * 3 + 2]]))
}

describe('review fixes', () => {
  it('places attractors in a tiny model, as from an STL saved in metres, without asking for billions of cells', () => {
    // A 2 mm ball with a 0.975 mm clearance leaves room for a handful of grid points, so the attractors' spacing comes
    // out a thousandth of the model: a grid of cells that fine would need hundreds of millions of them.
    const dom = new InsideDomain(buildSdf(sphere(1, 3), 120).sdf)
    const t0 = performance.now()
    const placed = scatterInside(dom, { count: 20_000, placement: 'even', seed: 1, clearance: 0.975, shell: 2 })
    expect(performance.now() - t0).toBeLessThan(3000)
    expect(placed.short).toBe(true)
  })

  it('finds the way in from a click on a model whose triangles face inward', () => {
    const dom = new InsideDomain(buildSdf(flip(sphere(15, 3)), 80).sdf)
    // On a flipped sphere the face normal at the bottom points up, into the ball.
    expect(dom.rootFromSkin([0, 0, -15], [0, 0, 1], 0.8, 1)).not.toBeNull()
  })

  it('counts the sealed hollow inside a hollow ball as outside', () => {
    const outer = sphere(20, 3), inner = flip(sphere(14, 3))
    const shell: MeshData = {
      positions: Float32Array.from([...outer.positions, ...inner.positions]),
      indices: Uint32Array.from([...outer.indices, ...Array.from(inner.indices, i => i + outer.positions.length / 3)]),
    }
    const dom = new InsideDomain(buildSdf(shell, 80).sdf)
    expect(dom.at(0, 0, 0)).toBeGreaterThan(0)
    expect(dom.at(17, 0, 0)).toBeLessThan(0)
  })

  it('finds points in the grid far from the file’s zero point', () => {
    const grid = new PointGrid(0.25, [-8300, 0, 0])
    const xs = [-8300], ys = [0], zs = [0]
    grid.add(0, xs[0], ys[0], zs[0])
    const found: number[] = []
    grid.near(-8300.1, 0, 0, 4, xs, ys, zs, id => { found.push(id) })
    expect(found).toEqual([0])
  })

  it('waits afresh for progress when a root is added after growth stalled', () => {
    const dom = new InsideDomain(buildSdf(sphere(15, 3), 60).sdf)
    const placed = scatterInside(dom, { count: 300, placement: 'even', seed: 1, clearance: 0.8, shell: 2 })
    const e = new Engine(dom, { p: placed.p, n: null }, { ...params, clearance: 0.8 }, { roots: [{ at: [0, 0, 0] }] })
    e.idle = 9999; e.done = 'stalled'
    e.addRoot({ at: [5, 0, 0] })
    expect(e.done).toBeNull()
    expect(e.idle).toBe(0)
  })

  it('reads a text STL in capitals, and refuses one with a corner that isn’t a number', () => {
    const tri = (v: string) => `SOLID T\nFACET NORMAL 0 0 1\nOUTER LOOP\nVERTEX 0 0 0\nVERTEX 1 0 0\nVERTEX ${v}\nENDLOOP\nENDFACET\nENDSOLID T\n`
    expect(parseStl(new TextEncoder().encode(tri('0 1 0')).buffer as ArrayBuffer).indices.length).toBe(3)
    expect(() => parseStl(new TextEncoder().encode(tri('0 nan 0')).buffer as ArrayBuffer)).toThrow(StlError)
  })

  it('starts a root for a model you opened where it fits: deep inside, or far from the rims', () => {
    const dom = new InsideDomain(buildSdf(lens(20, 10, 3, 3), 120).sdf)
    const at = dom.deepest(0, 1, 0.5)!
    expect(-dom.at(...at)).toBeGreaterThan(0.5)
    // A vase upside down, mouth on the floor: its lowest points are on the rim, where a root can't go.
    const v = vase()
    for (let i = 2; i < v.positions.length; i += 3) v.positions[i] = -v.positions[i]
    const sheet = new SurfaceDomain({ positions: v.positions, indices: flip(v).indices })
    const root = sheet.autoRoot(0, 1, 1)!
    expect(sheet.rimDistance(...root.at, 200)).toBeGreaterThan(10)
  })

  it('turns a step over a sharp edge in one go, onto the next face', () => {
    const dom = new SurfaceDomain(box())
    const out = new Float64Array(6)
    // 0.3 mm from the top face's edge at x = 20, heading straight over it, a 1 mm step.
    expect(dom.step(19.7, 0, 20, 0, 0, 1, 1, 0, 0, 1, 0, out)).toBe(true)
    expect(out[2]).toBeLessThan(19.5)
    expect(out[0]).toBeCloseTo(20, 3)
  })

  it('keeps surface veins on the piece of the model they start on, as a pot off its saucer', () => {
    // Found in 1.1's QA: on the springpot, veins that reached the pot's foot stepped across the 1 mm gap onto its saucer,
    // a separate piece with no root (1,332 vein points), which a print would join to the pot. Here a 40 mm box sits 1 mm
    // above a wider plate 1 mm thick.
    const cube = box(), plate = box(60, 12)
    const P = Float32Array.from(plate.positions, (x, i) => (i % 3 === 2 ? x / 60 - 21.5 : x))
    const n = cube.positions.length / 3
    const both: MeshData = { positions: Float32Array.from([...cube.positions, ...P]), indices: Uint32Array.from([...cube.indices, ...Array.from(plate.indices, q => q + n)]) }
    const dom = new SurfaceDomain(both)
    expect(dom.regions).toBe(2)
    // The box's side just above the plate leaves no room for a vein's tube (1.5 mm, 2.5 % of the 60 mm model); higher up
    // it does. Found by slicing: roots on the springpot's side above its saucer's floor couldn't be supported.
    expect(dom.onUnderside(20, 5, -19.8)).toBe(true)
    expect(dom.onUnderside(20, 5, -15)).toBe(false)
    const placed = scatterSurface(dom, { count: 1500, placement: 'even', seed: 2, clearance: 0 })
    const e = new Engine(dom, placed, params, { roots: [dom.root([0, 0, 20], 0)!] })
    for (let s = 0; s < 3000 && e.stepOnce() && !e.done; s++) { /* grow */ }
    expect(e.points).toBeGreaterThan(300)
    // Down the box's sides and over its bottom, but never onto the plate, whose attractors are all left.
    expect(Math.min(...e.z)).toBeGreaterThan(-20.5)
    let plateUsed = 0, onPlate = 0
    for (let a = 0; a < e.used.length; a++) if (placed.p[a * 3 + 2] < -20.5) { onPlate++; if (e.used[a]) plateUsed++ }
    expect(plateUsed).toBe(0)
    // The status can say they need a root of their own.
    expect(onPlate).toBeGreaterThan(300)
    expect(e.rootless()).toBe(onPlate)
  })

  it('finds the underside of a model whose triangles face inward, a box with a stray triangle, and one with a hole', () => {
    // Found by the independent review of 1.1.1: the rule read each triangle's normal as outward, so on a box wound
    // inward its bottom got veins and its top was kept clear; and a single open edge anywhere turned the rule off.
    const outward = box()
    const n = outward.positions.length / 3
    const stray: MeshData = { positions: Float32Array.from([...outward.positions, 60, 0, 0, 61, 0, 0, 60, 1, 0]), indices: Uint32Array.from([...outward.indices, n, n + 1, n + 2]) }
    const holed: MeshData = { positions: outward.positions, indices: outward.indices.slice(3) }
    for (const [name, mesh] of [['inward', flip(outward)], ['stray triangle', stray], ['hole', holed]] as const) {
      const dom = new SurfaceDomain(mesh)
      expect([name, dom.onUnderside(5, 5, -20)]).toEqual([name, true])
      expect([name, dom.onUnderside(5, 5, 20)]).toEqual([name, false])
    }
    // An open sheet still has no underside: the vase is open at its mouth.
    const sheet = new SurfaceDomain(vase())
    expect(sheet.underside.some(u => u === 1)).toBe(false)
  })

  it('keeps surface veins the edge clearance above the bed on a closed model, so their tubes don’t reach below it', () => {
    // Found by the independent review of 1.1.1: veins ran along the bottom edges of a box's sides, and their tubes
    // reached 0.4 mm below the bed, lifting the model as veins on its bottom did.
    const dom = new SurfaceDomain(box())
    const clear = { ...params, clearance: 1 }
    const placed = scatterSurface(dom, { count: 1200, placement: 'even', seed: 1, clearance: 1 })
    for (let a = 0; a < placed.p.length / 3; a++) expect(placed.p[a * 3 + 2]).toBeGreaterThanOrEqual(-19)
    const e = new Engine(dom, placed, clear, { roots: [dom.root([0, 0, 20], 1)!] })
    for (let s = 0; s < 3000 && e.stepOnce() && !e.done; s++) { /* grow */ }
    expect(e.points).toBeGreaterThan(300)
    expect(Math.min(...e.z)).toBeGreaterThanOrEqual(-19)
    expect(dom.root([20, 5, -19.5], 1)).toBeNull()
    expect(dom.nearBed(20, 5, -19.5, 1)).toBe(true)
  })

  it('grows surface veins round a box’s sharp edges, down its sides, and off the bottom it stands on', () => {
    const dom = new SurfaceDomain(box())
    const placed = scatterSurface(dom, { count: 1200, placement: 'even', seed: 1, clearance: 0 })
    const e = new Engine(dom, placed, params, { roots: [dom.root([0, 0, 20], 0)!] })
    for (let s = 0; s < 3000 && e.stepOnce() && !e.done; s++) { /* grow */ }
    let low = 0
    for (let i = 0; i < e.points; i++) if (e.z[i] < -15) low++
    expect(low).toBeGreaterThan(50)
    expect(e.live).toBeLessThan(60)
    // Found by slicing 1.1's exports: roots grown over a pot's bottom left it resting on veins, and in the gap above its
    // saucer the slicer couldn't support them. The box's bottom gets no attractors, no veins and no roots.
    // On the bottom face: at its height and inside its edges (points on a side's bottom edge are on the side).
    const onBottom = (x: number, y: number, z: number) => z < -19.99 && Math.abs(x) < 19.9 && Math.abs(y) < 19.9
    let veinsOnBottom = 0, attractorsOnBottom = 0
    for (let i = 0; i < e.points; i++) if (onBottom(e.x[i], e.y[i], e.z[i])) veinsOnBottom++
    for (let a = 0; a < placed.p.length / 3; a++) if (onBottom(placed.p[a * 3], placed.p[a * 3 + 1], placed.p[a * 3 + 2])) attractorsOnBottom++
    expect(veinsOnBottom).toBe(0)
    expect(attractorsOnBottom).toBe(0)
    expect(dom.root([5, 5, -20], 0)).toBeNull()
    expect(dom.onUnderside(5, 5, -20)).toBe(true)
    // Its sides are open down to the room a vein's tube needs above the bed: 1 mm, 2.5 % of the 40 mm box.
    expect(dom.onUnderside(20, 5, -18.5)).toBe(false)
    expect(dom.onUnderside(20, 5, -19.5)).toBe(true)
  })
})
