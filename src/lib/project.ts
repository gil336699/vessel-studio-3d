// Project files (.vessel3d.json): the settings, the model, where roots were asked for, the attractors and the veins
// grown so far, at full precision, so a reopened design carries on growing exactly as if it had never stopped. Number
// arrays are stored as base64 of their bytes, to keep files small. A built-in model is stored by name and made again;
// an opened STL is stored in full. Files carry a schema name and version.
import { builtInModel, modelDoc, type Design, type Growth } from './design'
import type { MeshData } from './mesh'
import { MODELS, type ModelId } from './models'
import { sanitizeSettings } from './settings'
import type { RootRequest } from '../worker/runner'

export const SCHEMA = 'vessel-studio-3d'
export const VERSION = 1
export const EXTENSION = '.vessel3d.json'

export class ProjectError extends Error {}

type Packed = { type: 'f64' | 'f32' | 'i32' | 'u32' | 'u8'; data: string }

function pack(a: Float64Array | Float32Array | Int32Array | Uint32Array | Uint8Array): Packed {
  const type = a instanceof Float64Array ? 'f64' : a instanceof Float32Array ? 'f32' : a instanceof Int32Array ? 'i32' : a instanceof Uint32Array ? 'u32' : 'u8'
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { type, data: btoa(text) }
}

function unpack(p: unknown, type: Packed['type'], what: string) {
  const v = p as Packed | null
  if (!v || typeof v !== 'object' || v.type !== type || typeof v.data !== 'string') throw new ProjectError(`This project file is damaged: its ${what} can’t be read.`)
  let text: string
  try { text = atob(v.data) } catch { throw new ProjectError(`This project file is damaged: its ${what} can’t be read.`) }
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i)
  const size = type === 'f64' ? 8 : type === 'u8' ? 1 : 4
  if (bytes.length % size) throw new ProjectError(`This project file is damaged: its ${what} are cut short.`)
  const buffer = bytes.buffer
  const out = type === 'f64' ? new Float64Array(buffer) : type === 'f32' ? new Float32Array(buffer) : type === 'i32' ? new Int32Array(buffer) : type === 'u32' ? new Uint32Array(buffer) : new Uint8Array(buffer)
  if (type === 'f64' || type === 'f32') for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i])) throw new ProjectError(`This project file is damaged: its ${what} hold invalid numbers.`)
  return out
}

export function projectJson(d: Design, app: string): string {
  const g = d.growth
  return JSON.stringify({
    schema: SCHEMA, version: VERSION, app,
    settings: d.settings,
    model: d.model.source.kind === 'built-in' ? { builtIn: d.model.source.id } : { name: d.model.source.name, positions: pack(d.model.mesh.positions), indices: pack(d.model.mesh.indices) },
    roots: d.roots,
    attractors: d.attractors ? { p: pack(d.attractors.p), n: d.attractors.n ? pack(d.attractors.n) : null, sys: d.attractors.sys ? pack(d.attractors.sys) : null } : null,
    placedFor: d.placedFor,
    growth: g ? {
      step: g.step, rng: g.rng, idle: g.idle, done: g.done,
      x: pack(g.x), y: pack(g.y), z: pack(g.z), n: pack(g.n), parent: pack(g.parent), sys: pack(g.sys), fixed: pack(g.fixed),
      joins: pack(g.joins), links: pack(g.links), used: pack(g.used),
    } : null,
  })
}

const DONE = new Set(['reached', 'stalled', 'out-of-reach', 'cap', 'empty'])
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isVec = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(isNum)

function rootList(raw: unknown): RootRequest[] {
  if (!Array.isArray(raw)) throw new ProjectError('This project file is damaged: its roots are missing.')
  return raw.map(r => {
    const q = r as Record<string, unknown>
    const system = isNum(q.system) ? Math.max(0, Math.min(2, Math.round(q.system))) : 0
    if (q.kind === 'skin' && isVec(q.point) && isVec(q.normal)) return { kind: 'skin', point: q.point as [number, number, number], normal: q.normal as [number, number, number], system }
    if (q.kind === 'inside' && isVec(q.point)) return { kind: 'inside', point: q.point as [number, number, number], system }
    if (q.kind === 'rim' && isNum(q.count)) return { kind: 'rim', count: Math.max(1, Math.min(64, Math.round(q.count))), systems: isNum(q.systems) ? Math.max(1, Math.min(3, Math.round(q.systems))) : 1 }
    throw new ProjectError('This project file is damaged: a root can’t be read.')
  })
}

// Reads a project file. Anything unreadable throws a ProjectError with a plain message; the caller keeps the current
// design.
export function parseProject(text: string): Design {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new ProjectError('This file isn’t a Vessel Studio 3D project: it isn’t JSON.') }
  const f = raw as Record<string, unknown> | null
  if (!f || typeof f !== 'object' || f.schema !== SCHEMA) throw new ProjectError('This file isn’t a Vessel Studio 3D project.')
  if (!isNum(f.version) || f.version < 1) throw new ProjectError('This project file has no version, so it can’t be read.')
  if (f.version > VERSION) throw new ProjectError(`This project was saved by a newer Vessel Studio 3D (file version ${f.version}). Reload the page to get the newest version, then open it again.`)
  const settings = sanitizeSettings(f.settings)
  const m = f.model as Record<string, unknown> | null
  let model
  if (m && typeof m.builtIn === 'string') {
    if (!MODELS.some(x => x.id === m.builtIn)) throw new ProjectError('This project uses a built-in model this version doesn’t have.')
    model = builtInModel(m.builtIn as ModelId)
  } else if (m && typeof m.name === 'string') {
    const mesh: MeshData = { positions: unpack(m.positions, 'f32', 'model') as Float32Array<ArrayBuffer>, indices: unpack(m.indices, 'u32', 'model') as Uint32Array<ArrayBuffer> }
    if (mesh.positions.length % 3 || mesh.indices.length % 3 || mesh.indices.some(i => i * 3 >= mesh.positions.length)) throw new ProjectError('This project file is damaged: its model doesn’t hold together.')
    model = modelDoc({ kind: 'file', name: m.name }, mesh)
  } else throw new ProjectError('This project file is damaged: its model is missing.')
  const roots = rootList(f.roots)
  const a = f.attractors as Record<string, unknown> | null
  const attractors = a ? {
    p: unpack(a.p, 'f64', 'attractors') as Float64Array,
    n: a.n ? unpack(a.n, 'f64', 'attractors') as Float64Array : null,
    sys: a.sys ? unpack(a.sys, 'u8', 'attractors') as Uint8Array : null,
  } : null
  if (attractors && attractors.p.length % 3) throw new ProjectError('This project file is damaged: an attractor is missing a coordinate.')
  const k = attractors ? attractors.p.length / 3 : 0
  let growth: Growth | null = null
  const g = f.growth as Record<string, unknown> | null
  if (g) {
    if (!attractors) throw new ProjectError('This project file is damaged: it has veins but no attractors.')
    const x = unpack(g.x, 'f64', 'vein points') as Float64Array, y = unpack(g.y, 'f64', 'vein points') as Float64Array, z = unpack(g.z, 'f64', 'vein points') as Float64Array
    const nn = unpack(g.n, 'f64', 'vein normals') as Float64Array, parent = unpack(g.parent, 'i32', 'vein points') as Int32Array, sys = unpack(g.sys, 'i32', 'vein systems') as Int32Array
    const fixed = unpack(g.fixed, 'i32', 'entry points') as Int32Array, joins = unpack(g.joins, 'i32', 'loop joins') as Int32Array, links = unpack(g.links, 'i32', 'joins between trees') as Int32Array
    const used = unpack(g.used, 'u8', 'used attractors') as Uint8Array
    const n = x.length
    if (y.length !== n || z.length !== n || parent.length !== n || sys.length !== n || nn.length !== n * 3) throw new ProjectError('This project file is damaged: its vein points don’t line up.')
    for (let i = 0; i < n; i++) if (parent[i] < -1 || parent[i] >= i) throw new ProjectError('This project file is damaged: a vein point grows from one that comes after it.')
    for (const list of [joins, links]) if (list.length % 2 || list.some(j => j < 0 || j >= n)) throw new ProjectError('This project file is damaged: a join links a vein point that isn’t there.')
    if (fixed.some(i => i < 0 || i >= n)) throw new ProjectError('This project file is damaged: an entry point isn’t there.')
    if (used.length !== k) throw new ProjectError('This project file is damaged: its attractors don’t match its veins.')
    if (!isNum(g.step) || !isNum(g.rng)) throw new ProjectError('This project file is damaged: its growth step is missing.')
    growth = {
      step: Math.max(0, Math.round(g.step)), rng: g.rng >>> 0, idle: isNum(g.idle) ? Math.max(0, Math.round(g.idle)) : 0,
      done: typeof g.done === 'string' && DONE.has(g.done) ? g.done as Growth['done'] : null,
      x, y, z, n: nn, parent, sys, fixed, joins, links, used,
    }
  }
  return { settings, model, roots, attractors, placedFor: typeof f.placedFor === 'string' ? f.placedFor : '', growth }
}
