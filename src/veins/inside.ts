// The Inside domain: veins grow through the inside of a closed model, as vessels through an organ or a tree through
// its crown (Runions, Lane and Prusinkiewicz 2007 grew trees into a crown envelope this way).
//
// The model becomes a signed distance grid once (lib/voxel.ts): negative inside, in millimetres. A growth step is
// refused when it would leave the volume or come nearer the wall than the edge clearance, tested along the whole
// segment; an attractor pulls only veins with a clear straight line to it. Both tests march through the grid by sphere
// tracing: a point d below the limit has no wall within about d, so the march skips ahead by most of d, and a sight
// line across a wide organ takes a handful of samples instead of hundreds.
import type { MeshData, Vec3 } from '../lib/mesh'
import { sdfVoxel, signedDistance, type Grid } from '../lib/voxel'
import type { Domain } from './domain'
import { Rng } from './random'

export type Sdf = Grid & { F: Float32Array }

// The share of a closed model's bounding box that must be inside before it counts as having an inside at all.
const MIN_INSIDE_SHARE = 0.002

export class InsideError extends Error {}

// The model's signed distance grid, about `per` grid points across its longest side.
export function buildSdf(mesh: MeshData, per = 220): { sdf: Sdf; insideShare: number } {
  const v = sdfVoxel(mesh.positions, per)
  const { grid, F, inside } = signedDistance(mesh.positions, mesh.indices, { v, pad: 3 * v })
  const share = inside / F.length
  return { sdf: { ...grid, F }, insideShare: share }
}

export class InsideDomain implements Domain {
  readonly kind = 'inside'
  readonly span: number
  readonly centre: readonly [number, number, number]
  // The grid points inside, and their box.
  readonly volume: number
  readonly lo: Vec3
  readonly hi: Vec3

  constructor(readonly sdf: Sdf) {
    const { nx, ny, nz, origin, v, F } = sdf
    let count = 0, cx = 0, cy = 0, cz = 0
    const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity]
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!(F[i + nx * (j + ny * k)] < 0)) continue
      const x = origin[0] + i * v, y = origin[1] + j * v, z = origin[2] + k * v
      count++; cx += x; cy += y; cz += z
      if (x < lo[0]) lo[0] = x; if (y < lo[1]) lo[1] = y; if (z < lo[2]) lo[2] = z
      if (x > hi[0]) hi[0] = x; if (y > hi[1]) hi[1] = y; if (z > hi[2]) hi[2] = z
    }
    if (count < Math.max(8, MIN_INSIDE_SHARE * F.length)) throw new InsideError('This model has no inside to grow in. It may be an open sheet, such as a vase without a lid. Use On the surface, or close it in your CAD app.')
    this.volume = count * v ** 3
    this.lo = lo; this.hi = hi
    this.centre = [cx / count, cy / count, cz / count]
    this.span = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
  }

  // The signed distance at a point, mm, by trilinear interpolation. Outside the grid counts as far outside.
  at(x: number, y: number, z: number): number {
    const { nx, ny, nz, origin, v, F } = this.sdf
    const fx = (x - origin[0]) / v, fy = (y - origin[1]) / v, fz = (z - origin[2]) / v
    if (!(fx >= 0 && fy >= 0 && fz >= 0 && fx < nx - 1 && fy < ny - 1 && fz < nz - 1)) return 4 * v
    const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz)
    const tx = fx - i, ty = fy - j, tz = fz - k
    const sx = 1, sy = nx, sz = nx * ny
    const q = i + nx * (j + ny * k)
    const c00 = F[q] + (F[q + sx] - F[q]) * tx
    const c10 = F[q + sy] + (F[q + sy + sx] - F[q + sy]) * tx
    const c01 = F[q + sz] + (F[q + sz + sx] - F[q + sz]) * tx
    const c11 = F[q + sz + sy] + (F[q + sz + sy + sx] - F[q + sz + sy]) * tx
    const c0 = c00 + (c10 - c00) * ty, c1 = c01 + (c11 - c01) * ty
    return c0 + (c1 - c0) * tz
  }

  // The direction the distance grows fastest: outward, unit length.
  gradient(x: number, y: number, z: number): Vec3 {
    const h = this.sdf.v * 0.5
    const gx = this.at(x + h, y, z) - this.at(x - h, y, z)
    const gy = this.at(x, y + h, z) - this.at(x, y - h, z)
    const gz = this.at(x, y, z + h) - this.at(x, y, z - h)
    const L = Math.hypot(gx, gy, gz) || 1
    return [gx / L, gy / L, gz / L]
  }

  // Whether the straight segment from a to b stays at least c inside the wall. Sphere tracing, with half a grid
  // spacing as the smallest step and the grid's own error allowed for in each skip.
  clearPath(ax: number, ay: number, az: number, bx: number, by: number, bz: number, c: number): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz)
    const v = this.sdf.v, minStep = 0.5 * v
    let t = 0
    for (let guard = 0; guard < 100_000; guard++) {
      const f = L > 0 ? t / L : 0
      const room = -this.at(ax + dx * f, ay + dy * f, az + dz * f) - c
      if (!(room > 0)) return false
      if (t >= L) return true
      t = Math.min(L, t + Math.max(minStep, 0.9 * room - 0.5 * v))
    }
    return false
  }

  step(px: number, py: number, pz: number, _pnx: number, _pny: number, _pnz: number,
    hx: number, hy: number, hz: number, length: number, clear: number, out: Float64Array): boolean {
    const qx = px + hx * length, qy = py + hy * length, qz = pz + hz * length
    if (!this.clearPath(px, py, pz, qx, qy, qz, clear)) return false
    out[0] = qx; out[1] = qy; out[2] = qz; out[3] = 0; out[4] = 0; out[5] = 0
    return true
  }

  sees(px: number, py: number, pz: number, _pnx: number, _pny: number, _pnz: number,
    ax: number, ay: number, az: number, _anx: number, _any: number, _anz: number, clear: number): boolean {
    return this.clearPath(px, py, pz, ax, ay, az, clear)
  }

  joins(px: number, py: number, pz: number, _pnx: number, _pny: number, _pnz: number,
    ax: number, ay: number, az: number, _anx: number, _any: number, _anz: number, clear: number): boolean {
    return this.clearPath(px, py, pz, ax, ay, az, clear)
  }

  // A root for a click on the model's skin at `point`, whose outward face normal is `normal`: the vessel enters there
  // and starts growing a little inside, deeper than the clearance. Null when the model is too thin there.
  rootFromSkin(point: Vec3, normal: Vec3, clearance: number, segment: number): { at: Vec3; entry: Vec3 } | null {
    const depth = Math.max(0, clearance) + 0.5 * segment
    const step = Math.max(0.25 * this.sdf.v, 0.05 * segment)
    let [x, y, z] = point
    // Inward along the face normal first, then down the distance grid, until deep enough.
    for (let t = 0, i = 0; i < 4000; i++) {
      const d = -this.at(x, y, z)
      if (d >= depth) return { at: [x, y, z], entry: [...point] }
      const g = d > 0.5 * this.sdf.v ? this.gradient(x, y, z) : normal
      x -= g[0] * step; y -= g[1] * step; z -= g[2] * step
      t += step
      if (t > 4 * depth + 4 * this.sdf.v) break
    }
    return null
  }

  // A root placed inside the model, as is.
  contains(point: Vec3, clearance: number) { return -this.at(point[0], point[1], point[2]) > Math.max(0, clearance) }
}

export type InsidePlacement = 'even' | 'random' | 'wall' | 'shell'

export type InsideScatter = { count: number; placement: InsidePlacement; seed: number; clearance: number; shell: number }

const CANDIDATES = 12

// Where the attractors go inside. The count is exact. Even uses Mitchell's best candidate (blue noise, with an exact
// count), Random is uniform, Wall crowds them near the wall (as Runions 2007, Fig. 7, did near a crown's edge), and
// Shell keeps them in a layer under the wall, for vessels just below a skin. No attractor is nearer the wall than the
// clearance, so veins can reach them all. The same seed always gives the same points.
export function scatterInside(dom: InsideDomain, o: InsideScatter): { p: Float64Array; short: boolean } {
  const n = Math.max(0, Math.floor(o.count))
  if (n === 0) return { p: new Float64Array(0), short: false }
  const rng = new Rng(o.seed)
  const clear = Math.max(0, o.clearance)
  const shell = Math.max(dom.sdf.v, o.shell)
  const [x0, y0, z0] = dom.lo, [x1, y1, z1] = dom.hi
  const w = x1 - x0, h = y1 - y0, d = z1 - z0
  const size = Math.min(w, h, d)
  const wallWidth = 0.08 * size
  const fits = (depth: number) => depth > clear && (o.placement !== 'shell' || depth <= clear + shell)
  const density = o.placement === 'wall' ? (depth: number) => 0.12 + 0.88 * Math.exp(-(depth - clear) / wallWidth) : null
  // The volume they fill, from the grid, for the spacing.
  const { F, v } = dom.sdf
  let cells = 0
  for (let q = 0; q < F.length; q++) if (fits(-F[q])) cells++
  const volume = Math.max(v ** 3, cells * v ** 3)
  const spacing = Math.cbrt(volume / n)
  const reach = 1.5 * spacing
  // A dense grid of cells `reach` wide, with linked lists of the points placed so far.
  const cell = reach
  const gx = Math.max(1, Math.ceil(w / cell) + 1), gy = Math.max(1, Math.ceil(h / cell) + 1), gz = Math.max(1, Math.ceil(d / cell) + 1)
  const headOf = new Int32Array(gx * gy * gz).fill(-1)
  const next = new Int32Array(n)
  const P = new Float64Array(n * 3)
  let placed = 0
  const cellOf = (x: number, y: number, z: number) => {
    const i = Math.min(gx - 1, Math.max(0, Math.floor((x - x0) / cell)))
    const j = Math.min(gy - 1, Math.max(0, Math.floor((y - y0) / cell)))
    const k = Math.min(gz - 1, Math.max(0, Math.floor((z - z0) / cell)))
    return [i, j, k]
  }
  const nearest = (x: number, y: number, z: number): number => {
    let best = reach * reach
    const [ci, cj, ck] = cellOf(x, y, z)
    for (let k = Math.max(0, ck - 1); k <= Math.min(gz - 1, ck + 1); k++)
      for (let j = Math.max(0, cj - 1); j <= Math.min(gy - 1, cj + 1); j++)
        for (let i = Math.max(0, ci - 1); i <= Math.min(gx - 1, ci + 1); i++)
          for (let p = headOf[i + gx * (j + gy * k)]; p >= 0; p = next[p]) {
            const dx = P[p * 3] - x, dy = P[p * 3 + 1] - y, dz = P[p * 3 + 2] - z, d2 = dx * dx + dy * dy + dz * dz
            if (d2 < best) best = d2
          }
    return Math.sqrt(best)
  }
  // One random point that fits and passes the density test, with its density, or null after many misses.
  const sample = (): [number, number, number, number] | null => {
    for (let tries = 0; tries < 600; tries++) {
      const x = x0 + rng.next() * w, y = y0 + rng.next() * h, z = z0 + rng.next() * d
      const depth = -dom.at(x, y, z)
      if (!fits(depth)) continue
      const p = density ? density(depth) : 1
      if (density && rng.next() >= p) continue
      return [x, y, z, p]
    }
    return null
  }
  const k = o.placement === 'random' ? 1 : CANDIDATES
  for (let misses = 0; placed < n && misses < 60;) {
    let best: [number, number, number, number] | null = null, score = -1
    for (let c = 0; c < k; c++) {
      const q = sample()
      if (!q) continue
      if (k === 1) { best = q; break }
      // Distances in local spacing units, so denser places stay denser.
      const s = nearest(q[0], q[1], q[2]) * (density ? Math.cbrt(q[3]) : 1)
      if (s > score) { score = s; best = q }
    }
    if (!best) { misses++; continue }
    misses = 0
    P[placed * 3] = best[0]; P[placed * 3 + 1] = best[1]; P[placed * 3 + 2] = best[2]
    const [i, j, kk] = cellOf(best[0], best[1], best[2])
    const c = i + gx * (j + gy * kk)
    next[placed] = headOf[c]; headOf[c] = placed
    placed++
  }
  return { p: P.slice(0, placed * 3), short: placed < n }
}
