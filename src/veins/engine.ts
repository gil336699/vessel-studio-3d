// The growth engine: space colonization in 3D (Runions, Lane and Prusinkiewicz 2007), one step at a time,
// deterministic, with its whole state saveable so a reopened design carries on exactly where it stopped. It is a
// port of Vessel Studio 1.4.0's 2D engine (src/veins/engine.ts) to three dimensions, with the shape's rules moved
// into a domain: Inside (through a closed model) or Surface (across a model's skin).
//
// Each step, in this order:
// 1. Pair. Every live attractor pulls on its nearest vein point, if that is nearer than the attraction distance (no
//    limit by default) and the domain says it can see the attractor. An attractor within the kill distance of a vein
//    point that sees it is used up first. With loops, an attractor pulls every vein point in its relative
//    neighbourhood instead, and stays until all of them have arrived; then they join there.
// 2. Grow. Every vein point that was pulled adds one point, a segment length away, toward the average of its pulls,
//    optionally blended with its last heading (Keep heading), a seeded wobble (Wiggle) and a steady Pull. The domain
//    places the point and may refuse it: inside, when it leaves the volume or comes nearer the wall than the edge
//    clearance; on the surface, when it can't stay on the skin or comes nearer an open rim than the clearance. A point
//    that would land on another vein is refused too (Keep veins apart).
// 3. The step's new points go in together, so the result never depends on the order points are visited. A refused
//    step still counts for the attractors it would have reached: another vein, or the wall, already fills that space.
//
// Two or three systems can grow together, each from its own roots:
// - Interweave: each system has its own attractors spread through the whole space, so every system fills it, and a
//   step that would bring one system's tube nearer another's than the gap is refused (Hohl et al. 2025 keep their
//   supplying and draining trees apart by the sum of the two radii plus a tolerance). Repel also steers veins away.
// - Join: two systems, an inlet tree and an outlet tree, share the attractors, and each tree's free tips pull the other
//   tree too (never its own), so the tips meet and join into one network that flow can pass through: the mutual tree
//   attraction of Kinstlinger et al. 2020 (Nature Biomedical Engineering 4, 916–932), designed with Nervous System.
//
// The nearest vein point of every attractor, in each tree it feeds, is cached and updated with each step's new points
// only, through a small k-d tree. Vein points never move or vanish, so that is exact, and ties go to the older point,
// as a full search would. Whether a vein point sees an attractor is cached for its nearest point, as sight lines inside
// cost a march through the distance grid.
//
// This is a picture-making model, not a physiological one: veins grow toward free space, not toward tissue that needs
// blood, and widths follow Murray's law from the tips, not flow.
import type { Attractors, Domain } from './domain'
import { PointTree } from './kdtree'
import { PointGrid } from './grid'
import { Rng } from './random'

export type Vec3 = [number, number, number]
export type Topology = 'open' | 'closed'
export type PullMode = 'up' | 'down' | 'out' | 'in'
export type Coupling = 'interweave' | 'join'

export type GrowthParams = {
  segment: number // mm between a vein point and the next
  kill: number // mm: an attractor this close to a vein is used up
  attraction: number // mm: how far a vein point senses attractors; 0 means no limit
  topology: Topology
  inertia: number // 0–0.95: how much of its last heading a vein keeps
  headingEndsOnly?: boolean // Keep heading for vein ends only, so a side branch starts toward its own attractors
  wiggle: number // 0–1.5: seeded wobble added to each step's heading
  pull: number // 0–1: steady pull added to each step's heading
  pullMode: PullMode
  crowd: number // 0–0.9 of a segment: a new point this close to another vein point is refused; 0 turns it off
  clearance: number // mm: veins stay this far from the walls (inside) or the open rims (surface)
  minLoop: number // loops: veins this many segments apart along the tree don't join, so no tiny bulbs
  maxPoints: number // a cap on vein points, to keep the browser responsive
  seed: number // for Wiggle
  // Systems growing together; 1 when missing.
  systems?: number
  coupling?: Coupling
  gap?: number // interweave: mm between the tube surfaces of different systems, widths included
  repel?: number // interweave: 0–1, how strongly veins steer away from other systems
  tipPull?: number // join: 0–1, how strongly a tree's free tips pull the other tree
  // Tube widths, for the gap between systems: the tip's width, the widest, and Murray's exponent (Even when rule is even).
  widths?: { rule: 'murray' | 'even'; tip: number; max: number; exponent: number }
}

export type StopReason = 'reached' | 'stalled' | 'out-of-reach' | 'cap' | 'empty'

// Where a vein starts. `normal` is the surface normal there (surface roots). `entry`, inside, is the point on the
// model's skin the vessel enters through: it is drawn and exported, but never grows. `system` is which system it
// starts, 0 when missing.
export type Root = { at: Vec3; normal?: Vec3; entry?: Vec3; system?: number }

// Everything a step depends on, as plain arrays, for project files and the worker.
export type EngineState = {
  step: number
  rng: number
  x: ArrayLike<number>
  y: ArrayLike<number>
  z: ArrayLike<number>
  n?: ArrayLike<number> // surface normals, three for each point; missing or zeros inside
  parent: ArrayLike<number>
  sys?: ArrayLike<number> // the system each point belongs to; all 0 when missing
  fixed?: ArrayLike<number> // indices of entry points, which never grow
  joins: ArrayLike<number> // pairs of vein points joined by a loop, [a0, b0, a1, b1, …]
  links?: ArrayLike<number> // join: pairs of vein points where the two trees met, [a0, b0, …]
  used: ArrayLike<number> // 1 for each attractor that is used up
  done: StopReason | null
  idle?: number // steps since an attractor was last used
}

// What changed in a step, for the page's mirror.
export type StepChange = { grew: number; joined: number; linked: number; used: number[] }

// An attractor that every tree grows toward (Join).
export const SHARED = 255
const LIVE = 0, USED = 1
// Loops: at most this many nearest vein points are tested for the relative neighbourhood of a source, and a source
// farther than RN_FAR segments from every vein pulls only its nearest point.
const RN_CANDIDATES = 48
const RN_FAR = 10
// Growth that uses no attractor for longer than it takes to cross the whole model, plus this many steps, is stuck.
const IDLE_SPARE = 50
// Join: a tip pulls the other tree from this many kill distances away, and the trees join within one kill distance.
const TIP_REACH = 3

class Grow {
  data: Float64Array | Int32Array
  length = 0
  constructor(private kind: 'f' | 'i', capacity = 1024) { this.data = kind === 'f' ? new Float64Array(capacity) : new Int32Array(capacity) }
  push(v: number) {
    if (this.length === this.data.length) {
      const next = this.kind === 'f' ? new Float64Array(this.data.length * 2) : new Int32Array(this.data.length * 2)
      next.set(this.data); this.data = next
    }
    this.data[this.length++] = v
  }
  view() { return this.data.subarray(0, this.length) }
}

export class Engine {
  params: GrowthParams
  readonly domain: Domain
  readonly ax: Float64Array
  readonly ay: Float64Array
  readonly az: Float64Array
  private anx: Float64Array
  private any: Float64Array
  private anz: Float64Array
  // The system each attractor feeds, or SHARED.
  readonly asys: Uint8Array
  // 0 live, 1 used up.
  readonly used: Uint8Array
  // How many trees there are, and for every attractor and tree, the nearest vein point, its squared distance, and
  // whether that point sees it: entry s * T + t.
  private T: number
  private best: Float64Array
  private owner: Int32Array
  private sightOf: Int32Array
  private sight: Uint8Array
  private xs = new Grow('f')
  private ys = new Grow('f')
  private zs = new Grow('f')
  private nxs = new Grow('f')
  private nys = new Grow('f')
  private nzs = new Grow('f')
  private parents = new Grow('i')
  private depths = new Grow('i')
  private roots = new Grow('i') // the root each vein point grew from
  private kids = new Grow('i') // children of each vein point
  private ends = new Grow('i') // vein ends each point feeds, for widths
  private sysOf = new Grow('i') // the system each point belongs to
  private fixedFlag = new Grow('i') // 1 for entry points
  private linked = new Grow('i') // 1 for points where the two trees met (Join)
  private joinList = new Grow('i')
  private linkList = new Grow('i')
  private grid: PointGrid
  private rng: Rng
  step = 0
  done: StopReason | null = null
  idle = 0
  live: number
  // Scratch, reused every step.
  private pullX = new Float64Array(0)
  private pullY = new Float64Array(0)
  private pullZ = new Float64Array(0)
  private pullN = new Float64Array(0)
  private head = new Int32Array(0)
  private out = new Float64Array(6)

  constructor(domain: Domain, attractors: Attractors, params: GrowthParams, from: { roots: Root[] } | { state: EngineState }) {
    this.domain = domain
    this.params = { ...params }
    this.T = Math.max(1, Math.min(3, Math.floor(params.systems ?? 1)))
    const k = Math.floor(attractors.p.length / 3)
    this.ax = new Float64Array(k); this.ay = new Float64Array(k); this.az = new Float64Array(k)
    this.anx = new Float64Array(k); this.any = new Float64Array(k); this.anz = new Float64Array(k)
    this.asys = new Uint8Array(k)
    for (let i = 0; i < k; i++) {
      this.ax[i] = attractors.p[i * 3]; this.ay[i] = attractors.p[i * 3 + 1]; this.az[i] = attractors.p[i * 3 + 2]
      if (attractors.n) { this.anx[i] = attractors.n[i * 3]; this.any[i] = attractors.n[i * 3 + 1]; this.anz[i] = attractors.n[i * 3 + 2] }
      // One system: every attractor feeds it. Join shares them all; Interweave keeps each attractor's own system.
      const s = attractors.sys ? attractors.sys[i] : 0
      this.asys[i] = this.T === 1 ? 0 : this.joining ? SHARED : Math.min(this.T - 1, s === SHARED ? 0 : s)
    }
    this.used = new Uint8Array(k)
    this.best = new Float64Array(k * this.T).fill(Infinity)
    this.owner = new Int32Array(k * this.T).fill(-1)
    this.sightOf = new Int32Array(k * this.T).fill(-1)
    this.sight = new Uint8Array(k * this.T)
    this.grid = new PointGrid(Math.max(1e-6, 2.5 * params.segment))
    if ('roots' in from) {
      this.rng = new Rng(params.seed)
      for (const root of from.roots) this.placeRoot(root)
    } else {
      const s = from.state
      this.rng = new Rng(params.seed, s.rng)
      this.step = s.step
      this.done = s.done
      this.idle = s.idle ?? 0
      const fixed = new Set(Array.from(s.fixed ?? []))
      for (let i = 0; i < s.x.length; i++) {
        const n = s.n
        this.addPoint(s.x[i], s.y[i], s.z[i], n ? n[i * 3] : 0, n ? n[i * 3 + 1] : 0, n ? n[i * 3 + 2] : 0, s.parent[i], fixed.has(i), s.sys ? Math.min(this.T - 1, s.sys[i]) : 0)
      }
      for (let i = 0; i < s.joins.length; i++) this.joinList.push(s.joins[i])
      const links = s.links ?? []
      for (let i = 0; i + 1 < links.length; i += 2) this.link(links[i], links[i + 1])
      for (let i = 0; i < k && i < s.used.length; i++) this.used[i] = s.used[i] ? USED : LIVE
    }
    this.live = this.used.reduce((n, u) => n + (u === LIVE ? 1 : 0), 0)
    this.refreshNearest(0)
  }

  private get joining() { return this.T === 2 && this.params.coupling === 'join' }
  private get interweaving() { return this.T > 1 && !this.joining }
  private get idleLimit() { return Math.ceil(this.domain.span / Math.max(1e-9, this.params.segment)) + IDLE_SPARE }

  get systems(): number { return this.T }
  get points(): number { return this.xs.length }
  get x(): Float64Array { return this.xs.view() as Float64Array }
  get y(): Float64Array { return this.ys.view() as Float64Array }
  get z(): Float64Array { return this.zs.view() as Float64Array }
  get parent(): Int32Array { return this.parents.view() as Int32Array }
  get sys(): Int32Array { return this.sysOf.view() as Int32Array }
  get joins(): Int32Array { return this.joinList.view() as Int32Array }
  get links(): Int32Array { return this.linkList.view() as Int32Array }
  get rngState(): number { return this.rng.state }
  // Normals, three per point.
  normals(from = 0): Float64Array {
    const n = this.xs.length, out = new Float64Array((n - from) * 3)
    for (let i = from; i < n; i++) { out[(i - from) * 3] = this.nxs.data[i]; out[(i - from) * 3 + 1] = this.nys.data[i]; out[(i - from) * 3 + 2] = this.nzs.data[i] }
    return out
  }
  fixedPoints(): number[] {
    const out: number[] = []
    for (let i = 0; i < this.xs.length; i++) if (this.fixedFlag.data[i]) out.push(i)
    return out
  }
  // Free tips: vein ends that haven't met the other tree. In Join they are the network's dead ends.
  freeTips(): number {
    let n = 0
    for (let v = 0; v < this.xs.length; v++) if (this.isTip(v)) n++
    return n
  }

  setParams(params: GrowthParams) {
    if (params.segment !== this.params.segment) {
      // The grid's cells follow the segment length; rebuild it for the new one.
      this.grid = new PointGrid(Math.max(1e-6, 2.5 * params.segment))
      for (let i = 0; i < this.xs.length; i++) if (!this.fixedFlag.data[i]) this.grid.add(i, this.xs.data[i], this.ys.data[i], this.zs.data[i])
    }
    // Sight lines inside depend on the clearance: work them out again.
    if (params.clearance !== this.params.clearance) this.sightOf.fill(-1)
    // The number of systems and how they couple are fixed for an engine; they change by starting again.
    this.params = { ...params, systems: this.params.systems, coupling: this.params.coupling }
    // New settings may let growth carry on, unless every attractor is already reached.
    if (this.done && this.done !== 'empty' && this.done !== 'reached') this.done = null
  }

  // A root added while growing starts a new vein of its own.
  addRoot(root: Root) {
    const from = this.xs.length
    this.placeRoot(root)
    this.refreshNearest(from)
    if (this.done) this.done = null
  }

  snapshot(): EngineState {
    return {
      step: this.step, rng: this.rng.state, x: this.x.slice(), y: this.y.slice(), z: this.z.slice(), n: this.normals(),
      parent: this.parent.slice(), sys: this.sys.slice(), fixed: this.fixedPoints(), joins: this.joins.slice(), links: this.links.slice(),
      used: this.used.slice(), done: this.done, idle: this.idle,
    }
  }

  private placeRoot(root: Root) {
    const [nx, ny, nz] = root.normal ?? [0, 0, 0]
    const system = Math.max(0, Math.min(this.T - 1, Math.floor(root.system ?? 0)))
    let parent = -1
    if (root.entry) parent = this.addPoint(root.entry[0], root.entry[1], root.entry[2], 0, 0, 0, -1, true, system)
    this.addPoint(root.at[0], root.at[1], root.at[2], nx, ny, nz, parent, false, system)
  }

  private addPoint(x: number, y: number, z: number, nx: number, ny: number, nz: number, parent: number, fixed: boolean, system: number) {
    const id = this.xs.length
    this.xs.push(x); this.ys.push(y); this.zs.push(z)
    this.nxs.push(nx); this.nys.push(ny); this.nzs.push(nz)
    this.parents.push(parent)
    this.depths.push(parent >= 0 ? this.depths.data[parent] + 1 : 0)
    // An entry point's vein counts as rooted at the point inside it, for the Pull away from the root.
    this.roots.push(parent >= 0 && !this.fixedFlag.data[parent] ? this.roots.data[parent] : id)
    this.kids.push(0)
    this.ends.push(1)
    this.sysOf.push(system)
    this.fixedFlag.push(fixed ? 1 : 0)
    this.linked.push(0)
    if (parent >= 0) {
      // A first child takes over its parent's end; any other adds one for every point back to the root.
      if (this.kids.data[parent] > 0) for (let a = parent; a >= 0; a = this.parents.data[a]) this.ends.data[a]++
      this.kids.data[parent]++
    }
    if (!fixed) this.grid.add(id, x, y, z)
    return id
  }

  private link(a: number, b: number) {
    this.linkList.push(a); this.linkList.push(b)
    this.linked.data[a] = 1; this.linked.data[b] = 1
  }

  private isTip(v: number) { return this.kids.data[v] === 0 && !this.fixedFlag.data[v] && !this.linked.data[v] && this.parents.data[v] >= 0 }

  // The tube's radius at a point, as Murray's law makes it from the ends the point feeds now.
  private radius(v: number): number {
    const w = this.params.widths
    if (!w) return 0
    if (w.rule === 'even') return w.tip / 2
    return Math.min(Math.max(w.tip, w.max), w.tip * this.ends.data[v] ** (1 / Math.max(1, w.exponent))) / 2
  }

  // Does attractor s feed tree t?
  private feeds(s: number, t: number) { const a = this.asys[s]; return a === SHARED || a === t }

  // Bring each attractor's nearest vein point in each tree it feeds up to date with the points from index `from` on.
  // Entry points never grow, so they never count as anyone's nearest point.
  private refreshNearest(from: number) {
    const T = this.T
    for (let t = 0; t < T; t++) {
      const ids: number[] = []
      for (let i = from; i < this.xs.length; i++) if (!this.fixedFlag.data[i] && this.sysOf.data[i] === t) ids.push(i)
      if (!ids.length) continue
      const tree = new PointTree(this.xs.data, this.ys.data, this.zs.data, ids)
      for (let s = 0; s < this.ax.length; s++) {
        if (this.used[s] !== LIVE || !this.feeds(s, t)) continue
        const e = s * T + t
        tree.nearest(this.ax[s], this.ay[s], this.az[s], this.best[e], this.owner[e])
        this.best[e] = tree.bestD2; this.owner[e] = tree.bestId
      }
    }
  }

  private seesFresh(v: number, s: number): boolean {
    const X = this.xs.data, Y = this.ys.data, Z = this.zs.data
    return this.domain.sees(X[v], Y[v], Z[v], this.nxs.data[v], this.nys.data[v], this.nzs.data[v],
      this.ax[s], this.ay[s], this.az[s], this.anx[s], this.any[s], this.anz[s], Math.max(0, this.params.clearance))
  }

  // Whether attractor s's nearest vein point in tree t sees it, worked out once for each new nearest point.
  private seesNearest(s: number, t: number): boolean {
    const e = s * this.T + t, v = this.owner[e]
    if (this.sightOf[e] !== v) { this.sightOf[e] = v; this.sight[e] = this.seesFresh(v, s) ? 1 : 0 }
    return this.sight[e] === 1
  }

  // The steady pull for a vein point, as a unit vector, or zeros. Up is +Z, as in CAD apps and slicers.
  private pullOf(v: number): Vec3 {
    switch (this.params.pullMode) {
      case 'up': return [0, 0, 1]
      case 'down': return [0, 0, -1]
      case 'out': case 'in': {
        const X = this.xs.data, Y = this.ys.data, Z = this.zs.data
        const [cx, cy, cz] = this.params.pullMode === 'out' ? [X[this.roots.data[v]], Y[this.roots.data[v]], Z[this.roots.data[v]]] : this.domain.centre
        const sign = this.params.pullMode === 'out' ? 1 : -1
        const dx = X[v] - cx, dy = Y[v] - cy, dz = Z[v] - cz, L = Math.hypot(dx, dy, dz)
        return L > 0 ? [(sign * dx) / L, (sign * dy) / L, (sign * dz) / L] : [0, 0, 0]
      }
    }
  }

  // Segments between two vein points along the tree, or Infinity when that's more than `limit` or they grew from
  // different roots.
  private treeGap(a: number, b: number, limit: number): number {
    const parent = this.parents.data, depth = this.depths.data
    let steps = 0
    while (depth[a] > depth[b]) { a = parent[a]; if (++steps > limit) return Infinity }
    while (depth[b] > depth[a]) { b = parent[b]; if (++steps > limit) return Infinity }
    while (a !== b) {
      a = parent[a]; b = parent[b]; steps += 2
      if (a < 0 || b < 0 || steps > limit) return Infinity
    }
    return steps
  }

  // Grow one step. Returns what changed, or null once growth has stopped.
  stepOnce(): StepChange | null {
    if (this.done) return null
    const P = this.params, T = this.T
    const n = this.xs.length
    let growing = 0
    for (let i = 0; i < n; i++) if (!this.fixedFlag.data[i]) { growing++; break }
    if (!growing) { this.done = 'empty'; return null }
    if (this.pullN.length < n) {
      const size = Math.max(n, this.pullN.length * 2)
      this.pullX = new Float64Array(size); this.pullY = new Float64Array(size); this.pullZ = new Float64Array(size)
      this.pullN = new Float64Array(size); this.head = new Int32Array(size).fill(-1)
    }
    const X = this.xs.data, Y = this.ys.data, Z = this.zs.data, SYS = this.sysOf.data
    const pullX = this.pullX, pullY = this.pullY, pullZ = this.pullZ, pullN = this.pullN, head = this.head
    const touched: number[] = []
    const usedNow: number[] = []
    const resolved: { s: number; arrived: number[] }[] = []
    const limit = P.attraction > 0 ? P.attraction : Infinity
    let inReach = 0
    // Which attractors pull each point this step, as linked lists.
    const pairS: number[] = [], pairNext: number[] = []
    const pulls = (v: number, s: number, d: number) => {
      if (pullN[v] === 0) touched.push(v)
      pullX[v] += (this.ax[s] - X[v]) / d
      pullY[v] += (this.ay[s] - Y[v]) / d
      pullZ[v] += (this.az[s] - Z[v]) / d
      pullN[v]++
      pairS.push(s); pairNext.push(head[v]); head[v] = pairS.length - 1
    }
    const closed = P.topology === 'closed' && !this.joining
    for (let s = 0; s < this.ax.length; s++) {
      if (this.used[s] !== LIVE) continue
      if (this.asys[s] === SHARED) {
        // Join: a shared attractor pulls the nearest point of the nearer tree, as one field of attractors would, so each
        // tree takes the space nearest it and the two meet between (ties go to the first tree).
        let t = 0
        for (let u = 1; u < T; u++) if (this.best[s * T + u] < this.best[s * T + t]) t = u
        const e = s * T + t, d = Math.sqrt(this.best[e])
        if (d < P.kill) { if (this.seesNearest(s, t)) { this.used[s] = USED; usedNow.push(s) } else inReach++; continue }
        if (!(d < limit)) continue
        inReach++
        if (this.seesNearest(s, t)) pulls(this.owner[e], s, d)
        continue
      }
      const t = this.asys[s], e = s * T + t
      const d = Math.sqrt(this.best[e])
      if (!closed) {
        const v = this.owner[e]
        // Used up by a vein that reaches it; one just across a wall can't (it can't see it), but it is in reach, so
        // growth that stops with only these left has stalled, not run out of reach.
        if (d < P.kill) { if (this.seesNearest(s, t)) { this.used[s] = USED; usedNow.push(s) } else inReach++; continue }
        if (!(d < limit)) continue
        inReach++
        if (!this.seesNearest(s, t)) continue
        pulls(v, s, d)
      } else {
        if (!(d < limit)) continue
        inReach++
        // Far from every vein, the nearest point is the one that matters, and finding the whole neighbourhood would
        // search a wide empty space; loops only form once veins come near.
        if (d > Math.max(RN_FAR * P.segment, 2 * P.kill)) {
          if (this.seesNearest(s, t)) pulls(this.owner[e], s, d)
          continue
        }
        const rn = this.neighbourhood(s, d)
        if (!rn.length) continue
        const away = rn.filter(([, dv]) => !(dv < P.kill))
        if (!away.length) { resolved.push({ s, arrived: rn.map(([v]) => v) }); continue }
        for (const [v, dv] of away) pulls(v, s, dv)
      }
    }

    // Join: each free tip pulls the nearest point of the other tree that sees it, and the two join once within the kill
    // distance. Tips are taken in order, so the result never depends on timing.
    let linkedNow = 0
    if (this.joining) {
      const reach = TIP_REACH * P.kill, w = Math.max(0, Math.min(1, P.tipPull ?? 0.6))
      const clear = Math.max(0, P.clearance)
      for (let v = 0; v < n; v++) {
        if (!this.isTip(v)) continue
        const other = 1 - SYS[v]
        let u = -1, best = reach * reach
        this.grid.near(X[v], Y[v], Z[v], reach, X, Y, Z, (id, d2) => {
          if (SYS[id] === other && (d2 < best || (d2 === best && id < u))) { best = d2; u = id }
        })
        if (u < 0) continue
        const d = Math.sqrt(best)
        const ok = this.domain.joins(X[u], Y[u], Z[u], this.nxs.data[u], this.nys.data[u], this.nzs.data[u],
          X[v], Y[v], Z[v], this.nxs.data[v], this.nys.data[v], this.nzs.data[v], clear)
        if (!ok) continue
        if (d < P.kill) { this.link(v, u); linkedNow++; continue }
        if (!(w > 0) || this.linked.data[u]) continue
        if (pullN[u] === 0) touched.push(u)
        pullX[u] += (w * (X[v] - X[u])) / d
        pullY[u] += (w * (Y[v] - Y[u])) / d
        pullZ[u] += (w * (Z[v] - Z[u])) / d
        pullN[u] += w
      }
    }
    touched.sort((a, b) => a - b)

    // Grow the pulled points, all from the positions before this step.
    const D = P.segment, crowd2 = (P.crowd * D) ** 2, clear = Math.max(0, P.clearance)
    const gap = this.interweaving ? Math.max(0, P.gap ?? 0) : 0
    const repel = this.interweaving ? Math.max(0, Math.min(1, P.repel ?? 0)) : 0
    // The widest tube anywhere, to bound how far the gap test must look.
    const widest = this.params.widths ? Math.max(this.params.widths.tip, this.params.widths.max) / 2 : 0
    const newX: number[] = [], newY: number[] = [], newZ: number[] = [], newN: number[] = [], newParent: number[] = []
    // A refused step uses up the attractors it would have come close to: a vein or the wall already fills that space.
    const covered = (P.kill + P.crowd * D) ** 2
    const refuse = (list: number, px: number, py: number, pz: number) => {
      if (closed) return
      for (let k = list; k >= 0; k = pairNext[k]) {
        const s = pairS[k]
        if (this.used[s] !== LIVE) continue
        const dx = this.ax[s] - px, dy = this.ay[s] - py, dz = this.az[s] - pz
        if (dx * dx + dy * dy + dz * dz < covered) { this.used[s] = USED; usedNow.push(s) }
      }
    }
    const out = this.out
    for (const v of touched) {
      const count = pullN[v], list = head[v]
      const tx = pullX[v] / count, ty = pullY[v] / count, tz = pullZ[v] / count
      pullX[v] = 0; pullY[v] = 0; pullZ[v] = 0; pullN[v] = 0; head[v] = -1
      let vx = tx, vy = ty, vz = tz
      if (P.inertia > 0 && (P.headingEndsOnly === false || this.kids.data[v] === 0)) {
        const p = this.parents.data[v]
        let hx = 0, hy = 0, hz = 0
        if (p >= 0) {
          const dx = X[v] - X[p], dy = Y[v] - Y[p], dz = Z[v] - Z[p], mag = Math.hypot(dx, dy, dz) || 1
          hx = dx / mag; hy = dy / mag; hz = dz / mag
        }
        vx = tx * (1 - P.inertia) + hx * P.inertia
        vy = ty * (1 - P.inertia) + hy * P.inertia
        vz = tz * (1 - P.inertia) + hz * P.inertia
      }
      if (P.wiggle > 0) {
        vx += (this.rng.next() - 0.5) * P.wiggle
        vy += (this.rng.next() - 0.5) * P.wiggle
        vz += (this.rng.next() - 0.5) * P.wiggle
      }
      if (P.pull > 0) { const [gx, gy, gz] = this.pullOf(v); vx += gx * P.pull; vy += gy * P.pull; vz += gz * P.pull }
      const own = SYS[v]
      if (repel > 0) {
        // Steer away from other systems' veins nearby. The push points away from them and is as strong as Repel when one
        // is close, never stronger, so the veins still follow their own attractors.
        const R = gap + 2 * widest + 2 * D
        let rx = 0, ry = 0, rz = 0, closest = 0
        this.grid.near(X[v], Y[v], Z[v], R, X, Y, Z, (id, d2) => {
          if (SYS[id] === own || d2 <= 0) return
          const d = Math.sqrt(d2), f = 1 - d / R
          if (f > closest) closest = f
          rx += ((X[v] - X[id]) / d) * f; ry += ((Y[v] - Y[id]) / d) * f; rz += ((Z[v] - Z[id]) / d) * f
        })
        const L = Math.hypot(rx, ry, rz)
        if (L > 0) { const k = (repel * closest) / L; vx += rx * k; vy += ry * k; vz += rz * k }
      }
      const mag = Math.hypot(vx, vy, vz)
      if (!(mag > 1e-12)) continue
      let hx = vx / mag, hy = vy / mag, hz = vz / mag
      // A step that another system's tube blocks turns away from it and tries again, three times at most, so veins pass
      // round each other's vessels. It uses up no attractors: they can still be reached the long way round.
      const tries = this.interweaving ? 4 : 1
      for (let attempt = 0; attempt < tries; attempt++) {
        if (!this.domain.step(X[v], Y[v], Z[v], this.nxs.data[v], this.nys.data[v], this.nzs.data[v], hx, hy, hz, D, clear, out)) {
          if (attempt === 0) refuse(list, X[v] + hx * D, Y[v] + hy * D, Z[v] + hz * D)
          break
        }
        const px = out[0], py = out[1], pz = out[2]
        if (crowd2 > 0) {
          let crowded = false
          this.grid.near(px, py, pz, P.crowd * D, X, Y, Z, id => { if (id !== v && SYS[id] === own) { crowded = true; return true } })
          if (!crowded) for (let i = 0; i < newX.length; i++) {
            if (SYS[newParent[i]] !== own) continue
            const dx = newX[i] - px, dy = newY[i] - py, dz = newZ[i] - pz
            if (dx * dx + dy * dy + dz * dz < crowd2) { crowded = true; break }
          }
          if (crowded) { if (attempt === 0) refuse(list, px, py, pz); break }
        }
        // The new tube, as wide as a tip, must keep the gap from every other system's tube as wide as it is now.
        let blocker = -1, bx = 0, by = 0, bz = 0
        if (this.interweaving) {
          const mine = this.params.widths ? this.params.widths.tip / 2 : 0
          this.grid.near(px, py, pz, gap + mine + widest, X, Y, Z, (id, d2) => {
            if (SYS[id] === own) return
            const need = gap + mine + this.radius(id)
            if (d2 < need * need) { blocker = id; bx = X[id]; by = Y[id]; bz = Z[id]; return true }
          })
          if (blocker < 0) for (let i = 0; i < newX.length; i++) {
            if (SYS[newParent[i]] === own) continue
            const dx = newX[i] - px, dy = newY[i] - py, dz = newZ[i] - pz, need = gap + 2 * mine
            if (dx * dx + dy * dy + dz * dz < need * need) { blocker = i; bx = newX[i]; by = newY[i]; bz = newZ[i]; break }
          }
        }
        if (blocker < 0) { newX.push(px); newY.push(py); newZ.push(pz); newN.push(out[3], out[4], out[5]); newParent.push(v); break }
        // Turn away from the blocking vein, more on each try.
        const ox = px - bx, oy = py - by, oz = pz - bz, oL = Math.hypot(ox, oy, oz) || 1, k = 0.75 * 2 ** attempt
        hx += (ox / oL) * k; hy += (oy / oL) * k; hz += (oz / oL) * k
        const hL = Math.hypot(hx, hy, hz) || 1
        hx /= hL; hy /= hL; hz /= hL
      }
    }
    const from = this.xs.length
    for (let i = 0; i < newX.length; i++) this.addPoint(newX[i], newY[i], newZ[i], newN[i * 3], newN[i * 3 + 1], newN[i * 3 + 2], newParent[i], false, SYS[newParent[i]])

    // Loops: each resolved source becomes a junction joined to every vein that arrived, unless two arrivals are close
    // along the tree, which would close a tiny bulb.
    let joined = 0
    for (const { s, arrived: all } of resolved) {
      this.used[s] = USED; usedNow.push(s)
      joined += this.junction(s, all)
    }
    this.refreshNearest(from)
    const grew = this.xs.length - from
    this.step++
    this.idle = usedNow.length > 0 || linkedNow > 0 ? 0 : this.idle + 1

    // Join keeps going while tips still find the other tree, after the last attractor is used.
    const tipsBusy = this.joining && (linkedNow > 0 || grew > 0) && this.live - usedNow.length === 0
    let stop: StopReason | null = null
    if (this.live - usedNow.length === 0 && !tipsBusy) stop = 'reached'
    else if (this.xs.length >= P.maxPoints) stop = 'cap'
    else if ((grew === 0 && usedNow.length === 0 && linkedNow === 0) || this.idle >= this.idleLimit) {
      if (closed) for (const settled of this.settleLoops()) usedNow.push(settled)
      stop = this.live - usedNow.length === 0 ? 'reached' : inReach === 0 ? 'out-of-reach' : 'stalled'
    }
    // Join: when growth stops, loose tips join the other tree if it is within reach and the join keeps the rules.
    if (stop && this.joining) linkedNow += this.settleLinks()
    this.done = stop
    this.live -= usedNow.length
    return { grew, joined, linked: linkedNow, used: usedNow }
  }

  // Join, at the end: each loose tip within two kill distances of the other tree joins its nearest point there, if the
  // straight join keeps the domain's rules, so near misses still connect. Returns the number of joins.
  private settleLinks(): number {
    const P = this.params, reach = 2 * P.kill, clear = Math.max(0, P.clearance)
    const X = this.xs.data, Y = this.ys.data, Z = this.zs.data, SYS = this.sysOf.data
    let made = 0
    for (let v = 0; v < this.xs.length; v++) {
      if (!this.isTip(v)) continue
      const other = 1 - SYS[v]
      let u = -1, best = reach * reach
      this.grid.near(X[v], Y[v], Z[v], reach, X, Y, Z, (id, d2) => { if (SYS[id] === other && (d2 < best || (d2 === best && id < u))) { best = d2; u = id } })
      if (u < 0) continue
      if (!this.domain.joins(X[u], Y[u], Z[u], this.nxs.data[u], this.nys.data[u], this.nzs.data[u], X[v], Y[v], Z[v], this.nxs.data[v], this.nys.data[v], this.nzs.data[v], clear)) continue
      this.link(v, u)
      made++
    }
    return made
  }

  // A junction at source s, joined to the veins that arrived there and whose joins keep the domain's rules. Returns the
  // number of joins made.
  private junction(s: number, all: number[]): number {
    const P = this.params
    const arrived = this.clearArrivals(s, all)
    if (arrived.length < 2) return 0
    const first = arrived[0]
    const others = arrived.slice(1).filter(v => this.treeGap(v, first, P.minLoop) > P.minLoop)
    if (!others.length) return 0
    const j = this.addPoint(this.ax[s], this.ay[s], this.az[s], this.anx[s], this.any[s], this.anz[s], first, false, this.sysOf.data[first])
    for (const v of others) { this.joinList.push(v); this.joinList.push(j) }
    return others.length
  }

  // Stuck with loops: a source that veins did reach joins them there and is used up. One no vein reached stays, so the
  // page can say it's out of reach. Only the kill distance round each source is searched, so this stays quick.
  private settleLoops(): number[] {
    const P = this.params, out: number[] = []
    const from = this.xs.length
    for (let s = 0; s < this.ax.length; s++) {
      if (this.used[s] !== LIVE) continue
      const t = this.asys[s]
      if (!(Math.sqrt(this.best[s * this.T + t]) < P.kill)) continue
      const found = this.neighbourhood(s, 0, P.kill).map(([v]) => v)
      if (!found.length) continue
      this.used[s] = USED; out.push(s)
      this.junction(s, found)
    }
    if (this.xs.length > from) this.refreshNearest(from)
    return out
  }

  // The veins that arrived at source s whose straight join to it keeps the domain's rules.
  private clearArrivals(s: number, arrived: number[]): number[] {
    const clear = Math.max(0, this.params.clearance)
    const X = this.xs.data, Y = this.ys.data, Z = this.zs.data
    return arrived.filter(v => this.domain.joins(X[v], Y[v], Z[v], this.nxs.data[v], this.nys.data[v], this.nzs.data[v],
      this.ax[s], this.ay[s], this.az[s], this.anx[s], this.any[s], this.anz[s], clear))
  }

  // The relative neighbourhood of source s among its own system's vein points that see it: v counts unless some u is
  // nearer the source than v and nearer v than the source is (Runions 2005, Eq. 2). Nearest first. `within` limits the
  // search to that distance instead of one set by the nearest vein point.
  private neighbourhood(s: number, nearest: number, within?: number): [number, number][] {
    const P = this.params, qx = this.ax[s], qy = this.ay[s], qz = this.az[s], t = this.asys[s], T = this.T
    const reach = within ?? Math.min(P.attraction > 0 ? P.attraction : Infinity, 2.5 * nearest + 2 * P.segment)
    const found: [number, number][] = []
    const X = this.xs.data, Y = this.ys.data, Z = this.zs.data, SYS = this.sysOf.data
    this.grid.near(qx, qy, qz, within ?? Math.max(reach, nearest * 1.000001 + 1e-9), X, Y, Z, (id, d2) => {
      if (T === 1 || SYS[id] === t) found.push([id, Math.sqrt(d2)])
    })
    found.sort((a, b) => a[1] - b[1] || a[0] - b[0])
    const out: [number, number][] = []
    for (let i = 0; i < found.length && i < RN_CANDIDATES; i++) {
      const [v, dv] = found[i]
      let open = true
      for (let k = 0; k < i && open; k++) {
        const u = found[k][0]
        if (Math.hypot(X[u] - X[v], Y[u] - Y[v], Z[u] - Z[v]) <= dv) open = false
      }
      if (open && (v === this.owner[s * T + t] ? this.seesNearest(s, t) : this.seesFresh(v, s))) out.push([v, dv])
    }
    return out
  }
}
