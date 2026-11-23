import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Engine } from '../veins/engine'
import { buildSdf, InsideDomain } from '../veins/inside'
import { builtInModel, defaultRequests, engineState, modelDoc, type Design } from './design'
import { sphere } from './models'
import { parseProject, ProjectError, projectJson, SCHEMA } from './project'
import { DEFAULTS, growthParams } from './settings'

function design(): Design {
  const model = builtInModel('lens')
  const settings = { ...DEFAULTS, model: 'lens' as const, systems: 2, coupling: 'join' as const }
  const base: Design = { settings, model, roots: [], attractors: null, placedFor: '', growth: null }
  base.roots = defaultRequests(base)
  base.attractors = { p: Float64Array.from([1.25, -2.5, 3.125, 0.1, 0.2, 0.3]), n: null, sys: Uint8Array.from([255, 255]) }
  base.growth = {
    step: 7, rng: 123456789, idle: 2, done: null,
    x: Float64Array.from([0.1, 1 / 3, Math.PI]), y: Float64Array.from([0, -1e-9, 2]), z: Float64Array.from([5, 6, 7]), n: new Float64Array(9),
    parent: Int32Array.from([-1, 0, 1]), sys: Int32Array.from([0, 0, 1]), fixed: Int32Array.from([0]),
    joins: new Int32Array(0), links: Int32Array.from([2, 1]), used: Uint8Array.from([1, 0]),
  }
  return base
}

describe('project files', () => {
  it('reopen with every number exactly as saved', () => {
    const d = design()
    const back = parseProject(projectJson(d, 'test'))
    expect(back.settings).toEqual(d.settings)
    expect(back.roots).toEqual(d.roots)
    expect(Array.from(back.attractors!.p)).toEqual(Array.from(d.attractors!.p))
    expect(Array.from(back.attractors!.sys!)).toEqual([255, 255])
    for (const key of ['x', 'y', 'z', 'n', 'parent', 'sys', 'fixed', 'links', 'used'] as const) expect(Array.from(back.growth![key])).toEqual(Array.from(d.growth![key]))
    expect(back.growth!.rng).toBe(123456789)
    // A built-in model is made again by name, the same shape.
    expect(back.model.source).toEqual({ kind: 'built-in', id: 'lens' })
    expect(Array.from(back.model.mesh.positions)).toEqual(Array.from(d.model.mesh.positions))
  })

  it('keep an opened STL in full', () => {
    const d = { ...design(), model: modelDoc({ kind: 'file', name: 'ball.stl' }, sphere(12, 2)) }
    const back = parseProject(projectJson(d, 'test'))
    expect(back.model.source).toEqual({ kind: 'file', name: 'ball.stl' })
    expect(Array.from(back.model.mesh.indices)).toEqual(Array.from(d.model.mesh.indices))
  })

  it('refuse damaged or foreign files with a plain message', () => {
    const good = JSON.parse(projectJson(design(), 'test'))
    expect(() => parseProject('not json')).toThrow(ProjectError)
    expect(() => parseProject(JSON.stringify({ ...good, schema: 'vessel-studio' }))).toThrow(/isn’t a Vessel Studio 3D project/)
    expect(() => parseProject(JSON.stringify({ ...good, version: 99 }))).toThrow(/newer/)
    expect(() => parseProject(JSON.stringify({ ...good, growth: { ...good.growth, parent: { type: 'i32', data: btoa('\x05\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00') } } }))).toThrow(/grows from one that comes after it/)
    expect(() => parseProject(JSON.stringify({ ...good, schema: SCHEMA, roots: [{ kind: 'skin', point: [0, 0] }] }))).toThrow(/root/)
  })
})

describe('project files with mismatched arrays', () => {
  it('refuse attractor systems that don’t line up with the attractors', () => {
    const good = JSON.parse(projectJson(design(), 'test'))
    good.attractors.sys = { type: 'u8', data: btoa('\x00') }
    expect(() => parseProject(JSON.stringify(good))).toThrow(/systems don’t line up/)
  })
})

describe('project files saved by earlier versions', () => {
  it('open and carry on growing: a kidney saved by the app at step 25, before 1.0.0', () => {
    const text = readFileSync(new URL('../../test-fixtures/kidney-step-25.vessel3d.json', import.meta.url), 'utf8')
    const d = parseProject(text)
    expect(d.model.source).toEqual({ kind: 'built-in', id: 'bean' })
    expect(d.roots).toHaveLength(1)
    expect(d.attractors!.p.length / 3).toBe(3000)
    const g = d.growth!
    expect(g.step).toBe(25)
    expect(g.x.length).toBe(1017)
    expect(g.used.filter(u => u === 0).length).toBe(2696)
    // The saved state still drives the engine.
    const engine = new Engine(new InsideDomain(buildSdf(d.model.mesh).sdf), d.attractors!, growthParams(d.settings), { state: engineState(g)! })
    const change = engine.stepOnce()
    expect(change && change.grew).toBeGreaterThan(0)
  })
})
