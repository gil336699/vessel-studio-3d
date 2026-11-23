import { describe, expect, it } from 'vitest'
import { sphere } from '../lib/models'
import { DEFAULTS, growthParams, scatterSpec } from '../lib/settings'
import { Engine } from '../veins/engine'
import { buildSdf, InsideDomain } from '../veins/inside'
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
})
