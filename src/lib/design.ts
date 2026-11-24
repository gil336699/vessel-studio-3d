// A design: the settings, the model, where roots were placed, the attractors and the veins grown so far. Plain data,
// so undo, project files and the worker all share it.
import type { MeshData, Vec3 } from './mesh'
import { meshBounds, vertexNormals } from './mesh'
import { buildModel, type ModelId } from './models'
import { defaultRootRule, scatterKey, type Mode, type RootRule, type Settings } from './settings'
import type { Attractors } from '../veins/domain'
import type { EngineState, StopReason } from '../veins/engine'
import type { RootRequest } from '../worker/runner'

// The model veins grow in or on. key changes whenever the mesh does, so the worker knows when to rebuild.
export type ModelDoc = { source: { kind: 'built-in'; id: ModelId } | { kind: 'file'; name: string }; mesh: MeshData; key: string }

export type Growth = {
  step: number; rng: number; idle: number; done: StopReason | null
  x: Float64Array; y: Float64Array; z: Float64Array; n: Float64Array
  parent: Int32Array; sys: Int32Array; fixed: Int32Array
  joins: Int32Array; links: Int32Array; used: Uint8Array
}

export type Design = {
  settings: Settings
  model: ModelDoc
  // Where roots were asked for, in order: the worker places each one, so a reset or a new clearance places them again.
  roots: RootRequest[]
  attractors: Attractors | null
  // The attractor settings the attractors were placed for.
  placedFor: string
  growth: Growth | null
}

let keys = 0
export function modelDoc(source: ModelDoc['source'], mesh: MeshData): ModelDoc {
  return { source, mesh, key: `${source.kind === 'built-in' ? source.id : source.name}#${++keys}` }
}

export const builtInModel = (id: ModelId): ModelDoc => modelDoc({ kind: 'built-in', id }, buildModel(id))

export function engineState(g: Growth | null): EngineState | null {
  if (!g) return null
  return { step: g.step, rng: g.rng, idle: g.idle, done: g.done, x: g.x, y: g.y, z: g.z, n: g.n, parent: g.parent, sys: g.sys, fixed: g.fixed, joins: g.joins, links: g.links, used: g.used }
}

export const hasGrown = (d: Design) => Boolean(d.growth && d.growth.step > 0)

// The attractors to send with a load: the design's own, if they were placed for these settings.
export const attractorsFor = (d: Design) => (d.attractors && d.placedFor === scatterKey(d.settings) ? d.attractors : null)

// The design to grow again from the roots, with new settings or a new model. Attractors placed for another model never
// carry over, even when the attractor settings are the same: a new model, or the same one at a new size, is somewhere
// else, and veins would grow toward points that aren't in it.
export function regrown(d: Design, settings: Settings, model: ModelDoc): Design {
  const same = model === d.model
  return { ...d, settings, model, growth: null, attractors: same ? d.attractors : null, placedFor: same ? d.placedFor : '' }
}

// The point of the skin nearest `target`, with its normal.
export function skinPoint(mesh: MeshData, target: Vec3, normals = vertexNormals(mesh)): { point: Vec3; normal: Vec3 } {
  const P = mesh.positions
  let best = Infinity, at = 0
  for (let i = 0; i < P.length; i += 3) {
    const d = (P[i] - target[0]) ** 2 + (P[i + 1] - target[1]) ** 2 + (P[i + 2] - target[2]) ** 2
    if (d < best) { best = d; at = i }
  }
  return { point: [P[at], P[at + 1], P[at + 2]], normal: [normals[at], normals[at + 1], normals[at + 2]] }
}

// The first roots for a model, by rule: one spot for each system, a little apart when they share one.
export function rootRequests(mesh: MeshData, rule: RootRule, mode: Mode, systems: number, spread = 5): RootRequest[] {
  const { lo, hi } = meshBounds(mesh.positions)
  const c: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
  const normals = vertexNormals(mesh)
  const n = Math.max(1, systems)
  if (rule === 'rim' && mode === 'surface') return [{ kind: 'rim', count: 6, systems: n }]
  const spots: Vec3[] = []
  for (let t = 0; t < n; t++) {
    const off = (t - (n - 1) / 2) * spread
    switch (rule) {
      case 'ends': spots.push(t === 0 ? [lo[0], c[1], c[2]] : t === 1 ? [hi[0], c[1], c[2]] : [c[0], c[1], lo[2]]); break
      case 'hilum': spots.push([c[0] + off, 16, 0]); break
      case 'top': spots.push([c[0] + off, c[1], hi[2]]); break
      default: spots.push([c[0] + off, c[1], lo[2]])
    }
  }
  return spots.map((target, t) => ({ kind: 'skin', ...skinPoint(mesh, target, normals), system: t, near: true }))
}

// A model's first roots: a built-in model's own spots, or for a model you opened, wherever the worker finds it suits
// best, as the skin of an unknown model may be thin or near a rim anywhere.
export function defaultRequests(d: Pick<Design, 'model' | 'settings'>): RootRequest[] {
  const n = Math.max(1, d.settings.systems)
  if (d.model.source.kind !== 'built-in') return Array.from({ length: n }, (_, t) => ({ kind: 'auto', system: t, systems: n }))
  return rootRequests(d.model.mesh, defaultRootRule(d.model.source.id, d.settings.mode), d.settings.mode, n)
}

export const roundTo = (v: number, digits = 2) => Number(v.toFixed(digits))

// The longest side of a mesh, mm.
export function longestSide(mesh: MeshData): number {
  const { lo, hi } = meshBounds(mesh.positions)
  return Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
}

// A copy of a mesh scaled about its box's middle so its longest side is `size` mm.
export function scaleMesh(mesh: MeshData, size: number): MeshData {
  const { lo, hi } = meshBounds(mesh.positions)
  const now = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1
  const k = size / now
  const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]]
  const P = new Float32Array(mesh.positions.length)
  for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) P[i + a] = c[a] + (mesh.positions[i + a] - c[a]) * k
  return { positions: P, indices: mesh.indices }
}
