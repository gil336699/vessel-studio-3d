import { describe, expect, it } from 'vitest'
import { sphere } from '../lib/models'
import { rootRequests } from '../lib/design'
import { DEFAULTS, growthParams, scatterSpec } from '../lib/settings'
import { Engine } from '../veins/engine'
import { buildSdf, InsideDomain } from '../veins/inside'
import { SurfaceDomain } from '../veins/surface'
import { createRunner, placeAttractors, type Frame, type FromRunner } from './runner'

describe('growth runner', () => {
  it('sends frames that rebuild exactly the veins an engine grows on its own', async () => {
    const mesh = sphere(15, 3)
    const settings = { ...DEFAULTS, model: 'sphere' as const, count: 600, clearance: 0.8 }
    const params = growthParams(settings)
    const messages: FromRunner[] = []
    let time = 0
    const runner = createRunner(m => messages.push(m), () => (time += 1))
    const request = { kind: 'skin' as const, point: [0, 0, -15] as [number, number, number], normal: [0, 0, -1] as [number, number, number], system: 0 }
    runner.handle({ kind: 'load', load: { gen: 1, meshKey: 'ball', mesh, mode: 'inside', scatter: scatterSpec(settings), attractors: null, params, state: null, requests: [request] } })
    expect(messages.some(m => m.kind === 'ready')).toBe(true)
    runner.handle({ kind: 'play', run: 1, steps: null, perBatch: 40 })
    // Ack every frame, as the page does once it is drawn, until the run stops.
    for (let guard = 0; guard < 10_000 && !messages.some(m => m.kind === 'stopped'); guard++) {
      runner.handle({ kind: 'ack' })
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    const frames = messages.filter((m): m is { kind: 'frame' | 'stopped'; frame: Frame } & FromRunner => m.kind === 'frame' || m.kind === 'stopped').map(m => m.frame)
    const x: number[] = [], parent: number[] = []
    for (const f of frames) { expect(f.from).toBe(x.length); x.push(...f.x); parent.push(...f.parent) }
    // The same growth, straight from an engine.
    const dom = new InsideDomain(buildSdf(mesh).sdf)
    const { attractors } = placeAttractors(dom, scatterSpec(settings))
    const root = dom.rootFromSkin(request.point, request.normal, params.clearance, params.segment)!
    const e = new Engine(dom, attractors, params, { roots: [{ ...root, system: 0 }] })
    for (let s = 0; s < 5000 && e.stepOnce() && !e.done; s++) { /* grow */ }
    expect(x).toEqual(Array.from(e.x))
    expect(parent).toEqual(Array.from(e.parent))
  })

  it('sends the counts the page doesn’t keep after loading saved veins, as Undo, Redo and opening a project do', () => {
    // Found by the independent review of 1.1.1: after a load with saved veins the worker sent no frame, so the page lost
    // how many attractors were on a part with no root, and the status fell back to the plain message.
    const ball = sphere(10, 3), far = sphere(10, 3)
    const P = Float32Array.from(far.positions, (v, i) => (i % 3 === 0 ? v + 40 : v))
    const n = ball.positions.length / 3
    const mesh = { positions: Float32Array.from([...ball.positions, ...P]), indices: Uint32Array.from([...ball.indices, ...Array.from(far.indices, q => q + n)]) }
    const settings = { ...DEFAULTS, model: 'sphere' as const, mode: 'surface' as const, count: 600, clearance: 0 }
    const params = growthParams(settings)
    const dom = new SurfaceDomain(mesh)
    const { attractors } = placeAttractors(dom, scatterSpec(settings))
    const e = new Engine(dom, attractors, params, { roots: [dom.root([0, 0, 10], 0)!] })
    for (let s = 0; s < 2000 && e.stepOnce() && !e.done; s++) { /* grow */ }
    expect(e.rootless()).toBeGreaterThan(100)
    const messages: FromRunner[] = []
    const runner = createRunner(m => messages.push(m), () => 0)
    runner.handle({ kind: 'load', load: { gen: 1, meshKey: 'two balls', mesh, mode: 'surface', scatter: scatterSpec(settings), attractors, params, state: e.snapshot(), requests: [] } })
    const frame = messages.find(m => m.kind === 'frame') as Extract<FromRunner, { kind: 'frame' }> | undefined
    expect(frame?.frame.rootless).toBe(e.rootless())
    expect(frame?.frame.x.length).toBe(0)
  })

  it('moves a model’s own root off the underside it stands on, but refuses a click there', () => {
    // Found in 1.1.1's QA: the sphere's own spot On the surface is its bottom, which 1.1.1 keeps veins off, so the app
    // refused the root it had placed itself and the model started with none.
    const mesh = sphere(15, 3)
    const settings = { ...DEFAULTS, model: 'sphere' as const, mode: 'surface' as const, count: 400, clearance: 0.5 }
    const messages: FromRunner[] = []
    const runner = createRunner(m => messages.push(m), () => 0)
    const own = rootRequests(mesh, 'bottom', 'surface', 1)
    runner.handle({ kind: 'load', load: { gen: 1, meshKey: 'ball', mesh, mode: 'surface', scatter: scatterSpec(settings), attractors: null, params: growthParams(settings), state: null, requests: own } })
    const placed = messages.find(m => m.kind === 'roots') as Extract<FromRunner, { kind: 'roots' }>
    expect(placed.refused).toBeNull()
    expect(placed.added.length).toBe(1)
    // Beside the underside, not on it: the bottom 0.75 mm of the 30 mm ball (2.5 % of its size) is where it stands.
    expect(placed.added[0].at[2]).toBeGreaterThan(-15 + 0.75 - 1e-6)
    // The same spot clicked with the Roots tool is refused, with the reason.
    const click = own.map(r => (r.kind === 'skin' ? { kind: 'skin' as const, point: r.point, normal: r.normal, system: r.system } : r))
    runner.handle({ kind: 'root', gen: 1, requests: click })
    const clicked = messages.filter(m => m.kind === 'roots').at(-1) as Extract<FromRunner, { kind: 'roots' }>
    expect(clicked.added.length).toBe(0)
    expect(clicked.refused).toMatch(/too close above the bed/)
  })
})
