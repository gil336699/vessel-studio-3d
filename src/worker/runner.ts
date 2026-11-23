// Owns the growing veins inside the worker. It builds the model's domain once (a distance grid inside, a BVH on the
// surface), places the attractors, and steps in batches, sending the page one frame at a time, only after the page has
// drawn the last one, so drawing never falls behind and a slow step never freezes the page (the pattern of Vessel
// Studio's and Line Growth's runners). Frames carry only what changed: new vein points, joins and links, and the
// attractors used up since the last frame. The page keeps the rest.
import type { MeshData, Vec3 } from '../lib/mesh'
import type { Mode, ScatterSpec } from '../lib/settings'
import type { Attractors, Domain } from '../veins/domain'
import { Engine, SHARED, type EngineState, type GrowthParams, type Root, type StopReason } from '../veins/engine'
import { buildSdf, InsideDomain, InsideError, scatterInside, type InsidePlacement } from '../veins/inside'
import { scatterSurface, SurfaceDomain, type SurfacePlacement } from '../veins/surface'

// A root to place: a click on the skin, a point inside, roots spread along the open rim, or one wherever the model
// suits best (auto): its deepest point inside, or on the surface the point farthest from its rims, or its top.
export type RootRequest =
  | { kind: 'skin'; point: Vec3; normal: Vec3; system: number }
  | { kind: 'inside'; point: Vec3; system: number }
  | { kind: 'rim'; count: number; systems: number }
  | { kind: 'auto'; system: number; systems: number }

export type DomainInfo = { mode: Mode; volume: number; area: number; rims: number; openings: number; span: number; voxel: number; ms: number }

export type Load = {
  gen: number
  // The model: sent with its key the first time, then the key alone.
  meshKey: string
  mesh: MeshData | null
  mode: Mode
  scatter: ScatterSpec
  // Exact attractors from a project; otherwise they are placed from `scatter`.
  attractors: Attractors | null
  params: GrowthParams
  // The veins so far, from undo or a project; null starts again from the roots.
  state: EngineState | null
  // Where the roots go when starting again: the worker places each one for this model, mode and clearance.
  requests: RootRequest[]
}

export type Frame = {
  gen: number
  step: number; rng: number; idle: number; done: StopReason | null
  // Vein points from index `from` on; join and link pairs from pair `joinFrom` and `linkFrom` on.
  from: number; x: Float64Array; y: Float64Array; z: Float64Array; n: Float64Array; parent: Int32Array; sys: Int32Array; fixed: Int32Array
  joinFrom: number; joins: Int32Array
  linkFrom: number; links: Int32Array
  used: Int32Array // attractors used up since the last frame
  live: number; freeTips: number
  stepsPerSecond: number
}

export type ToRunner =
  | { kind: 'load'; load: Load }
  | { kind: 'params'; params: GrowthParams }
  | { kind: 'root'; gen: number; requests: RootRequest[] }
  // steps: null grows until stopped; a number runs that many steps, as Step does.
  | { kind: 'play'; run: number; steps: number | null; perBatch: number }
  | { kind: 'speed'; perBatch: number }
  | { kind: 'stop' }
  // The page drew the last frame and can take another.
  | { kind: 'ack' }

export type FromRunner =
  | { kind: 'progress'; gen: number; text: string }
  | { kind: 'ready'; gen: number; attractors: Attractors; info: DomainInfo; short: boolean; placedFor: string }
  | { kind: 'failed'; gen: number; message: string }
  // live: a click while the veins are loaded, rather than the roots placed when starting again.
  | { kind: 'roots'; gen: number; added: Root[]; refused: string | null; live: boolean }
  | { kind: 'frame'; frame: Frame }
  | { kind: 'stopped'; run: number; frame: Frame }
  | { kind: 'error'; message: string }

type Run = { id: number; remaining: number | null; perBatch: number; timer?: ReturnType<typeof setTimeout> }
const BATCH_MS = 16 // one batch per display frame at most
const DEADLINE_MS = 30 // a batch stops early after this, so Stop and edits never wait long
// Browsers slow a hidden page's timers, even a worker's, to a few a second. A batch then catches up on the steps it
// missed, for up to half the time since the last batch and never more than this.
const CATCH_UP_MS = 120

// Attractors for a scatter spec in a domain. Two or three interwoven systems get their own attractors each, spread
// through the whole space: every system's points are drawn from one even spread, in turn.
export function placeAttractors(domain: Domain, spec: ScatterSpec): { attractors: Attractors; short: boolean } {
  const interweave = spec.systems > 1 && !(spec.systems === 2 && spec.coupling === 'join')
  const total = interweave ? spec.count * spec.systems : spec.count
  const placed = domain instanceof InsideDomain
    ? { ...scatterInside(domain, { count: total, placement: spec.placement as InsidePlacement, seed: spec.seed, clearance: spec.clearance, shell: spec.shell }), n: null }
    : scatterSurface(domain as SurfaceDomain, { count: total, placement: spec.placement as SurfacePlacement, seed: spec.seed, clearance: spec.clearance })
  const k = placed.p.length / 3
  const sys = new Uint8Array(k)
  for (let i = 0; i < k; i++) sys[i] = interweave ? i % spec.systems : spec.systems > 1 ? SHARED : 0
  return { attractors: { p: placed.p, n: placed.n, sys }, short: placed.short }
}

export function createRunner(post: (message: FromRunner, transfer: Transferable[]) => void, now: () => number = () => performance.now()) {
  let engine: Engine | null = null
  let domain: Domain | null = null
  let domainKey = ''
  let info: DomainInfo | null = null
  let mesh: MeshData | null = null
  let meshKey = ''
  let placed: { key: string; attractors: Attractors; short: boolean } | null = null
  let gen = 0
  let run: Run | null = null
  let lastBatch = 0
  // What the page has: points, join pairs and link pairs up to these counts.
  let sentPoints = 0, sentJoins = 0, sentLinks = 0
  let used: number[] = []
  let dirty = false, inFlight = false
  let rateSteps = 0, rateStart = 0, rate = 0

  function frame(): [Frame, Transferable[]] {
    const e = engine!
    const n = e.points, j = e.joins.length / 2, l = e.links.length / 2
    const fixed = e.fixedPoints().filter(i => i >= sentPoints)
    const out: Frame = {
      gen, step: e.step, rng: e.rngState, idle: e.idle, done: e.done,
      from: sentPoints, x: e.x.slice(sentPoints, n), y: e.y.slice(sentPoints, n), z: e.z.slice(sentPoints, n), n: e.normals(sentPoints),
      parent: e.parent.slice(sentPoints, n), sys: e.sys.slice(sentPoints, n), fixed: Int32Array.from(fixed),
      joinFrom: sentJoins, joins: e.joins.slice(sentJoins * 2, j * 2),
      linkFrom: sentLinks, links: e.links.slice(sentLinks * 2, l * 2),
      used: Int32Array.from(used), live: e.live, freeTips: e.freeTips(), stepsPerSecond: run ? rate : 0,
    }
    sentPoints = n; sentJoins = j; sentLinks = l; used = []
    dirty = false
    inFlight = true
    return [out, [out.x.buffer, out.y.buffer, out.z.buffer, out.n.buffer, out.parent.buffer, out.sys.buffer, out.fixed.buffer, out.joins.buffer, out.links.buffer, out.used.buffer]]
  }
  function flush() {
    if (!engine || !dirty || inFlight) return
    const [out, transfer] = frame()
    post({ kind: 'frame', frame: out }, transfer)
  }
  function end() {
    if (!run) return
    clearTimeout(run.timer)
    const id = run.id
    run = null
    rate = 0
    const [out, transfer] = frame()
    post({ kind: 'stopped', run: id, frame: out }, transfer)
  }

  function batch() {
    const current = run, e = engine
    if (!current || !e) return
    const started = now()
    const since = lastBatch ? Math.min(1000, started - lastBatch) : BATCH_MS
    lastBatch = started
    // Growing runs Speed steps per display frame, catching up when timers fire late; Step runs exactly its count.
    const limit = current.remaining === null ? Math.max(current.perBatch, Math.round((current.perBatch * since) / BATCH_MS)) : Math.min(current.perBatch, current.remaining)
    const deadline = current.remaining === null ? Math.min(CATCH_UP_MS, Math.max(DEADLINE_MS, since / 2)) : DEADLINE_MS
    let steps = 0
    while (steps < limit && (steps === 0 || now() - started < deadline)) {
      const change = e.stepOnce()
      if (!change) break
      for (const s of change.used) used.push(s)
      steps++
      if (e.done) break
    }
    const t = now()
    rateSteps += steps
    if (t - rateStart >= 500) { rate = (rateSteps * 1000) / Math.max(1, t - rateStart); rateSteps = 0; rateStart = t }
    dirty = true
    if (e.done || steps === 0) return end()
    if (current.remaining !== null) {
      current.remaining -= steps
      if (current.remaining <= 0) return end()
    }
    current.timer = setTimeout(guarded(batch), Math.max(0, BATCH_MS - (t - started)))
    flush()
  }

  function fail(error: unknown) {
    if (run) clearTimeout(run.timer)
    run = null
    post({ kind: 'error', message: error instanceof Error ? error.message : String(error) }, [])
  }
  const guarded = (fn: () => void) => () => { try { fn() } catch (error) { fail(error) } }

  // The domain for this model and mode, built once and kept while they stay the same.
  function domainFor(l: Load): Domain {
    const key = `${meshKey}|${l.mode}`
    if (domain && key === domainKey) return domain
    const t0 = now()
    post({ kind: 'progress', gen: l.gen, text: l.mode === 'inside' ? 'Measuring the inside of the model…' : 'Reading the model’s surface…' }, [])
    if (l.mode === 'inside') {
      const { sdf, openings } = buildSdf(mesh!)
      const d = new InsideDomain(sdf)
      info = { mode: 'inside', volume: d.volume, area: 0, rims: 0, openings, span: d.span, voxel: sdf.v, ms: now() - t0 }
      domain = d
    } else {
      const d = new SurfaceDomain(mesh!)
      info = { mode: 'surface', volume: 0, area: d.area, rims: d.rims.length, openings: 0, span: d.span, voxel: 0, ms: now() - t0 }
      domain = d
    }
    domainKey = key
    placed = null
    return domain
  }

  // Roots for requests, as the domain places them; the reason a request was refused, if any was.
  function resolve(requests: RootRequest[], params: GrowthParams): { added: Root[]; refused: string | null } {
    const d = domain
    const added: Root[] = []
    let refused: string | null = null
    if (!d) return { added, refused: 'The model isn’t ready yet.' }
    const clear = Math.max(0, params.clearance)
    const systems = Math.max(1, params.systems ?? 1)
    for (const r of requests) {
      if (d instanceof InsideDomain) {
        if (r.kind === 'skin') {
          const root = d.rootFromSkin(r.point, r.normal, clear, params.segment)
          if (root) added.push({ ...root, system: r.system })
          else refused = 'The model is too thin there for a root clear of its walls. Try a thicker spot, or a smaller edge clearance.'
        } else if (r.kind === 'inside') {
          if (d.contains(r.point, clear)) added.push({ at: r.point, system: r.system })
          else refused = 'That point isn’t inside the model, clear of its walls.'
        } else if (r.kind === 'auto') {
          const at = d.deepest(r.system, r.systems, clear)
          if (at) added.push({ at, system: r.system })
          else refused = 'This model has no room inside, clear of its walls, for a root. Try a smaller edge clearance, or grow On the surface.'
        } else refused = 'Roots along the rim are for growing On the surface.'
      } else if (d instanceof SurfaceDomain) {
        if (r.kind === 'rim') {
          if (!d.open) { refused = 'This model has no open rim, so roots can’t go along one. Click the model to place roots.'; continue }
          d.rimRoots(r.count, Math.max(clear, 0.5 * params.segment)).forEach((root, i) => added.push({ ...root, system: i % systems }))
        } else if (r.kind === 'auto') {
          const root = d.autoRoot(r.system, r.systems, clear)
          if (root) added.push({ ...root, system: r.system })
          else refused = 'No spot on this model is clear of its rims for a root. Try a smaller edge clearance.'
        } else {
          const root = d.root(r.point, clear)
          if (root) added.push({ ...root, system: r.system })
          else refused = 'That spot is nearer the rim than the edge clearance. Try further from the rim, or a smaller clearance.'
        }
      }
    }
    return { added, refused }
  }

  function load(l: Load) {
    if (run) { clearTimeout(run.timer); run = null }
    gen = l.gen
    if (l.mesh) { mesh = l.mesh; meshKey = l.meshKey }
    if (!mesh || meshKey !== l.meshKey) { post({ kind: 'failed', gen, message: 'The model didn’t reach the growth worker. Open it again.' }, []); return }
    let d: Domain
    try { d = domainFor(l) } catch (error) {
      domainKey = ''; domain = null; engine = null
      post({ kind: 'failed', gen, message: error instanceof InsideError ? error.message : `The model can’t be used: ${error instanceof Error ? error.message : String(error)}` }, [])
      return
    }
    const key = `${domainKey}|${JSON.stringify(l.scatter)}`
    if (l.attractors) placed = { key: 'project', attractors: l.attractors, short: false }
    else if (!placed || placed.key !== key) {
      post({ kind: 'progress', gen, text: 'Placing attractors…' }, [])
      placed = { key, ...placeAttractors(d, l.scatter) }
    }
    // Built before it's taken on, so a load that fails leaves the last engine and its frames as they were.
    engine = new Engine(d, placed.attractors, l.params, l.state ? { state: l.state } : { roots: [] })
    // The page already has a saved state; starting again, it has nothing, and the roots come in the first frame.
    sentPoints = engine.points; sentJoins = engine.joins.length / 2; sentLinks = engine.links.length / 2; used = []
    dirty = false; inFlight = false
    const a = placed.attractors
    post({ kind: 'ready', gen, attractors: { p: a.p.slice(), n: a.n ? a.n.slice() : null, sys: a.sys ? a.sys.slice() : null }, info: info!, short: placed.short, placedFor: placed.key }, [])
    if (!l.state) addRoots(l.requests, false)
  }

  function addRoots(requests: RootRequest[], live: boolean) {
    const e = engine
    if (!e) return
    const { added, refused } = resolve(requests, e.params)
    for (const root of added) e.addRoot(root)
    post({ kind: 'roots', gen, added, refused, live }, [])
    if (added.length) { dirty = true; flush() }
  }

  function handle(message: ToRunner) {
    switch (message.kind) {
      case 'load': load(message.load); return
      case 'ack': inFlight = false; flush(); return
    }
    const e = engine
    if (!e) return
    switch (message.kind) {
      case 'params': e.setParams(message.params); dirty = true; flush(); return
      case 'speed': if (run) run.perBatch = Math.max(1, message.perBatch); return
      case 'play':
        if (run) clearTimeout(run.timer)
        run = { id: message.run, remaining: message.steps, perBatch: Math.max(1, message.perBatch) }
        rateSteps = 0; rateStart = now(); rate = 0; lastBatch = 0
        run.timer = setTimeout(guarded(batch), 0)
        return
      case 'stop': end(); return
      case 'root': if (message.gen === gen) addRoots(message.requests, true); return
    }
  }

  return { handle: (message: ToRunner) => guarded(() => handle(message))() }
}
