// The tube skin: one watertight, outward-facing surface round every vein, tapered by its Murray width, for printing.
//
// Each vein segment is a round cone: two spheres and the cone that touches both (Inigo Quilez's exact distance). The
// skin is the zero level of the distance to the nearest cone. That field is sampled only near the veins, in small
// bricks of 8 × 8 × 8 points, so a fine grid fits in memory even when the veins fill a whole organ. Surface nets then
// turns it into triangles. Joints come out smooth and the skin never crosses itself, because it is one level of one
// field. As in Growth Studio's voxel tools, sealed bubbles are filled, pinched squares are joined and pinched vertices
// split, so every edge is used once in each direction.
import { edgeProblems, type MeshData } from './mesh'
import { makeManifold, meshNeighbors, taubin } from './voxel'

const B = 8, SHIFT = 3, MASK = 7, B3 = 512

// A field this many samples big (Float32 and a vertex slot each, 8 bytes a sample) is about 190 MB: the most a tab
// can spare.
export const MAX_SAMPLES = 24_000_000

export class TubeBudgetError extends Error {}

export type TubeOptions = { voxel: number; smooth?: number; maxSamples?: number }
export type TubeSkin = { mesh: MeshData; voxel: number; bricks: number; samples: number; cavities: number; pinches: number; problems: number }

// Exact signed distance to a round cone from a (radius ra) to b (radius rb). One sphere inside the other is just the
// bigger sphere.
function roundCone(px: number, py: number, pz: number, s: Float64Array, o: number): number {
  const ax = s[o], ay = s[o + 1], az = s[o + 2], bx = s[o + 3], by = s[o + 4], bz = s[o + 5], r1 = s[o + 6], r2 = s[o + 7]
  const bax = bx - ax, bay = by - ay, baz = bz - az
  const l2 = bax * bax + bay * bay + baz * baz
  const rr = r1 - r2
  const a2 = l2 - rr * rr
  const pax = px - ax, pay = py - ay, paz = pz - az
  if (!(a2 > 1e-12)) {
    return r1 >= r2 ? Math.hypot(pax, pay, paz) - r1 : Math.hypot(px - bx, py - by, pz - bz) - r2
  }
  const il2 = 1 / l2
  const y = pax * bax + pay * bay + paz * baz
  const z = y - l2
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y
  const x2 = qx * qx + qy * qy + qz * qz
  const y2 = y * y * l2
  const z2 = z * z * l2
  const k = Math.sign(rr) * rr * rr * x2
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1
}

// The grid for spacing v: its origin and size in samples and bricks, and each segment's box of samples, widened by the
// band where the field is worked out exactly.
function layout(segs: Float64Array, v: number) {
  const m = segs.length / 8
  const band = 3 * v
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let o = 0; o < segs.length; o += 8) {
    const r = Math.max(segs[o + 6], segs[o + 7])
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], segs[o + a] - r, segs[o + 3 + a] - r)
      hi[a] = Math.max(hi[a], segs[o + a] + r, segs[o + 3 + a] + r)
    }
  }
  const pad = band + 2 * v
  const origin = lo.map(x => x - pad)
  const ni = Math.ceil((hi[0] - lo[0] + 2 * pad) / v) + 1
  const nj = Math.ceil((hi[1] - lo[1] + 2 * pad) / v) + 1
  const nk = Math.ceil((hi[2] - lo[2] + 2 * pad) / v) + 1
  const bx = Math.ceil(ni / B), by = Math.ceil(nj / B), bz = Math.ceil(nk / B)
  const box = new Int32Array(m * 6)
  for (let s = 0; s < m; s++) {
    const o = s * 8, r = Math.max(segs[o + 6], segs[o + 7]) + band
    for (let a = 0; a < 3; a++) {
      const n = a === 0 ? ni : a === 1 ? nj : nk
      box[s * 6 + a] = Math.max(0, Math.floor((Math.min(segs[o + a], segs[o + 3 + a]) - r - origin[a]) / v))
      box[s * 6 + 3 + a] = Math.min(n - 1, Math.ceil((Math.max(segs[o + a], segs[o + 3 + a]) + r - origin[a]) / v))
    }
  }
  return { m, band, origin, ni, nj, nk, bx, by, bz, box }
}

// How many grid samples the skin needs at spacing v: the bricks the segments' boxes touch, counted exactly but without
// working out the field.
export function countSamples(segs: Float64Array, v: number): number {
  const { m, bx, by, bz, box } = layout(segs, v)
  if (bx * by * bz > 64_000_000) return Infinity
  const seen = new Uint8Array(bx * by * bz)
  let bricks = 0
  for (let s = 0; s < m; s++) {
    for (let k = box[s * 6 + 2] >> SHIFT; k <= box[s * 6 + 5] >> SHIFT; k++)
      for (let j = box[s * 6 + 1] >> SHIFT; j <= box[s * 6 + 4] >> SHIFT; j++)
        for (let i = box[s * 6] >> SHIFT; i <= box[s * 6 + 3] >> SHIFT; i++) {
          const b = i + bx * (j + by * k)
          if (!seen[b]) { seen[b] = 1; bricks++ }
        }
  }
  return bricks * B3
}

// The grid spacing for a skin: fine enough that the thinnest tip is `perTip` samples across its radius, and coarser
// only as far as the sample budget needs. tipLimited says the budget made it coarser than that.
export function tubeVoxel(segs: Float64Array, perTip = 2, maxSamples = MAX_SAMPLES): { voxel: number; tipLimited: boolean } {
  let tip = Infinity
  for (let o = 0; o < segs.length; o += 8) tip = Math.min(tip, segs[o + 6], segs[o + 7])
  if (!Number.isFinite(tip) || tip <= 0) tip = 0.5
  const wanted = tip / perTip
  let v = wanted
  for (let guard = 0; guard < 80 && countSamples(segs, v) > maxSamples; guard++) v *= 1.1
  return { voxel: v, tipLimited: v > wanted * 1.001 }
}

export function tubeSkin(segs: Float64Array, options: TubeOptions): TubeSkin {
  const v = options.voxel, smooth = options.smooth ?? 2, maxSamples = options.maxSamples ?? MAX_SAMPLES
  if (!segs.length) return { mesh: { positions: new Float32Array(0), indices: new Uint32Array(0) }, voxel: v, bricks: 0, samples: 0, cavities: 0, pinches: 0, problems: 0 }
  if (!(v > 0)) throw new Error('The grid spacing must be positive.')
  const { m, band, origin, ni, nj, nk, bx, by, bz, box } = layout(segs, v)
  if (bx * by * bz > 64_000_000) throw new TubeBudgetError('The veins span too wide a space for this grid spacing.')
  const table = new Int32Array(bx * by * bz).fill(-1)
  // Bricks the boxes touch, and how many segments each holds.
  let slots = 0
  const counts: number[] = []
  const slotBrick: number[] = []
  for (let s = 0; s < m; s++) {
    for (let k = box[s * 6 + 2] >> SHIFT; k <= box[s * 6 + 5] >> SHIFT; k++)
      for (let j = box[s * 6 + 1] >> SHIFT; j <= box[s * 6 + 4] >> SHIFT; j++)
        for (let i = box[s * 6] >> SHIFT; i <= box[s * 6 + 3] >> SHIFT; i++) {
          const b = i + bx * (j + by * k)
          if (table[b] < 0) { table[b] = slots++; counts.push(0); slotBrick.push(b) }
          counts[table[b]]++
        }
  }
  if (slots * B3 > maxSamples) {
    throw new TubeBudgetError(`The skin would need ${(slots * B3 / 1e6).toFixed(0)} million grid points; the limit is ${(maxSamples / 1e6).toFixed(0)} million. Use a coarser grid, wider tips or fewer veins.`)
  }
  const start = new Int32Array(slots + 1)
  for (let q = 0; q < slots; q++) start[q + 1] = start[q] + counts[q]
  const refs = new Int32Array(start[slots])
  const fill = start.slice(0, slots)
  for (let s = 0; s < m; s++) {
    for (let k = box[s * 6 + 2] >> SHIFT; k <= box[s * 6 + 5] >> SHIFT; k++)
      for (let j = box[s * 6 + 1] >> SHIFT; j <= box[s * 6 + 4] >> SHIFT; j++)
        for (let i = box[s * 6] >> SHIFT; i <= box[s * 6 + 3] >> SHIFT; i++) refs[fill[table[i + bx * (j + by * k)]]++] = s
  }
  // The field: far (the band) everywhere, then the nearest cone at every sample in a segment's box.
  const F = new Float32Array(slots * B3).fill(band)
  for (let q = 0; q < slots; q++) {
    const b = slotBrick[q]
    const bi = (b % bx) * B, bj = (Math.floor(b / bx) % by) * B, bk = Math.floor(b / (bx * by)) * B
    const base = q * B3
    for (let r = start[q]; r < start[q + 1]; r++) {
      const s = refs[r]
      const i0 = Math.max(bi, box[s * 6]), i1 = Math.min(bi + B - 1, box[s * 6 + 3])
      const j0 = Math.max(bj, box[s * 6 + 1]), j1 = Math.min(bj + B - 1, box[s * 6 + 4])
      const k0 = Math.max(bk, box[s * 6 + 2]), k1 = Math.min(bk + B - 1, box[s * 6 + 5])
      for (let k = k0; k <= k1; k++) {
        const pz = origin[2] + k * v
        for (let j = j0; j <= j1; j++) {
          const py = origin[1] + j * v
          const row = base + ((j - bj) << SHIFT) + ((k - bk) << (2 * SHIFT)) - bi
          for (let i = i0; i <= i1; i++) {
            const d = roundCone(origin[0] + i * v, py, pz, segs, s * 8)
            if (d < F[row + i]) F[row + i] = d
          }
        }
      }
    }
  }
  const slotOf = (i: number, j: number, k: number) => {
    if (i < 0 || j < 0 || k < 0 || i >= ni || j >= nj || k >= nk) return -1
    return table[(i >> SHIFT) + bx * ((j >> SHIFT) + by * (k >> SHIFT))]
  }
  const local = (i: number, j: number, k: number) => (i & MASK) + ((j & MASK) << SHIFT) + ((k & MASK) << (2 * SHIFT))
  const at = (i: number, j: number, k: number) => {
    const q = slotOf(i, j, k)
    return q < 0 ? band : F[q * B3 + local(i, j, k)]
  }
  const brickOrigin = (q: number): [number, number, number] => {
    const b = slotBrick[q]
    return [(b % bx) * B, (Math.floor(b / bx) % by) * B, Math.floor(b / (bx * by)) * B]
  }

  // Bricks where the field was changed below are no longer a true distance, so the skips that rely on that are off
  // there and next to them.
  const dirty = new Uint8Array(slots)
  // Pinches: a square of four samples alternating inside, outside, inside, outside would join four faces along one
  // edge. The outside corner nearest the surface moves just inside, as Growth Studio's joinPinches does. The first
  // pass looks at every square near the skin; later passes only at squares round the samples just moved.
  let pinches = 0
  const axes: [number, number, number][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  const planes: [number, number][] = [[1, 2], [0, 2], [0, 1]]
  let moved: number[] = []
  const square = (i: number, j: number, k: number, u: [number, number, number], w: [number, number, number]) => {
    const fa = at(i, j, k), fb = at(i + u[0], j + u[1], k + u[2])
    const fc = at(i + u[0] + w[0], j + u[1] + w[1], k + u[2] + w[2]), fd = at(i + w[0], j + w[1], k + w[2])
    const a = fa < 0, b = fb < 0, c = fc < 0, d = fd < 0
    if (a !== c || b !== d || a === b) return
    // The two outside corners: b and d when a is inside, else a and c.
    const pick: [number, number, number] = a
      ? (fb <= fd ? [i + u[0], j + u[1], k + u[2]] : [i + w[0], j + w[1], k + w[2]])
      : (fa <= fc ? [i, j, k] : [i + u[0] + w[0], j + u[1] + w[1], k + u[2] + w[2]])
    const pq = slotOf(...pick)
    if (pq < 0) return
    F[pq * B3 + local(...pick)] = -1e-6
    dirty[pq] = 1
    pinches++
    moved.push(...pick)
  }
  const near = 1.5 * v
  for (let q = 0; q < slots; q++) {
    const [bi, bj, bk] = brickOrigin(q)
    for (let lk = 0; lk < B; lk++) for (let lj = 0; lj < B; lj++) for (let li = 0; li < B; li++) {
      const fa = F[q * B3 + li + (lj << SHIFT) + (lk << (2 * SHIFT))]
      // A true distance changes by at most the distance moved, so a sample this far from the skin starts no square
      // that changes sign. Bubbles filled above are small and near zero, so they are never skipped.
      if (fa > near || fa < -near) continue
      for (const [ua, va] of planes) square(bi + li, bj + lj, bk + lk, axes[ua], axes[va])
    }
  }
  for (let pass = 0; pass < 16 && moved.length; pass++) {
    const last = moved
    moved = []
    for (let p = 0; p < last.length; p += 3) {
      const i = last[p], j = last[p + 1], k = last[p + 2]
      for (const [ua, va] of planes) {
        const u = axes[ua], w = axes[va]
        square(i, j, k, u, w)
        square(i - u[0], j - u[1], k - u[2], u, w)
        square(i - w[0], j - w[1], k - w[2], u, w)
        square(i - u[0] - w[0], j - u[1] - w[1], k - u[2] - w[2], u, w)
      }
    }
  }
  // Sealed bubbles: positive samples the outside can't reach. This comes after the pinches, as joining a pinch can seal
  // a bubble of a single sample. The outside is every sample outside the bricks, so any
  // positive sample next to a missing brick or the grid's edge starts the flood.
  const reached = new Uint8Array(slots * B3)
  const queue = new Int32Array(slots * B3)
  let head = 0, tail = 0
  const steps: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
  for (let q = 0; q < slots; q++) {
    const [bi, bj, bk] = brickOrigin(q)
    for (let lk = 0; lk < B; lk++) for (let lj = 0; lj < B; lj++) for (let li = 0; li < B; li++) {
      if (li > 0 && li < B - 1 && lj > 0 && lj < B - 1 && lk > 0 && lk < B - 1) continue
      const g = q * B3 + li + (lj << SHIFT) + (lk << (2 * SHIFT))
      if (!(F[g] > 0) || reached[g]) continue
      const i = bi + li, j = bj + lj, k = bk + lk
      if (steps.some(([di, dj, dk]) => slotOf(i + di, j + dj, k + dk) < 0)) { reached[g] = 1; queue[tail++] = g }
    }
  }
  while (head < tail) {
    const g = queue[head++], q = g >> (3 * SHIFT), l = g & (B3 - 1)
    const [bi, bj, bk] = brickOrigin(q)
    const i = bi + (l & MASK), j = bj + ((l >> SHIFT) & MASK), k = bk + (l >> (2 * SHIFT))
    for (const [di, dj, dk] of steps) {
      const nq = slotOf(i + di, j + dj, k + dk)
      if (nq < 0) continue
      const ng = nq * B3 + local(i + di, j + dj, k + dk)
      if (!reached[ng] && F[ng] > 0) { reached[ng] = 1; queue[tail++] = ng }
    }
  }
  let cavities = 0
  for (let g = 0; g < F.length; g++) if (F[g] > 0 && !reached[g]) { F[g] = -Math.min(F[g], 0.5 * v); cavities++; dirty[g >> (3 * SHIFT)] = 1 }

  // A brick's cells and edges reach into the bricks after it along each axis.
  const changedNear = new Uint8Array(slots)
  for (let q = 0; q < slots; q++) {
    if (dirty[q]) { changedNear[q] = 1; continue }
    const [bi, bj, bk] = brickOrigin(q)
    for (let c = 1; c < 8 && !changedNear[q]; c++) {
      const nq = slotOf(bi + (c & 1 ? B : 0), bj + (c & 2 ? B : 0), bk + (c & 4 ? B : 0))
      if (nq >= 0 && dirty[nq]) changedNear[q] = 1
    }
  }

  // Surface nets: one vertex in each cell the skin passes through, at the average of its edge crossings.
  const vertexOf = new Int32Array(slots * B3).fill(-1)
  let positions = new Float32Array(1 << 16), count = 0
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]]
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]
  const val = new Float32Array(8)
  for (let q = 0; q < slots; q++) {
    const [bi, bj, bk] = brickOrigin(q)
    for (let lk = 0; lk < B; lk++) for (let lj = 0; lj < B; lj++) for (let li = 0; li < B; li++) {
      const i = bi + li, j = bj + lj, k = bk + lk
      if (i >= ni - 1 || j >= nj - 1 || k >= nk - 1) continue
      const f000 = F[q * B3 + li + (lj << SHIFT) + (lk << (2 * SHIFT))]
      // Every corner is within 1.74 grid steps of this one, so in a true distance field they all share its sign.
      if (!changedNear[q] && (f000 > 1.8 * v || f000 < -1.8 * v)) continue
      let neg = 0
      if (li < B - 1 && lj < B - 1 && lk < B - 1) {
        const g = q * B3 + li + (lj << SHIFT) + (lk << (2 * SHIFT))
        for (let c = 0; c < 8; c++) { const [a, b, d] = corner[c]; val[c] = F[g + a + (b << SHIFT) + (d << (2 * SHIFT))]; if (val[c] < 0) neg++ }
      } else {
        for (let c = 0; c < 8; c++) { const [a, b, d] = corner[c]; val[c] = at(i + a, j + b, k + d); if (val[c] < 0) neg++ }
      }
      if (neg === 0 || neg === 8) continue
      let x = 0, y = 0, z = 0, n = 0
      for (const [p, r] of edges) {
        const fp = val[p], fq = val[r]
        if ((fp < 0) === (fq < 0)) continue
        const t = fp / (fp - fq), A = corner[p], C = corner[r]
        x += A[0] + t * (C[0] - A[0]); y += A[1] + t * (C[1] - A[1]); z += A[2] + t * (C[2] - A[2]); n++
      }
      if (count * 3 + 3 > positions.length) { const grown = new Float32Array(positions.length * 2); grown.set(positions); positions = grown }
      vertexOf[q * B3 + li + (lj << SHIFT) + (lk << (2 * SHIFT))] = count
      positions[count * 3] = origin[0] + (i + x / n) * v
      positions[count * 3 + 1] = origin[1] + (j + y / n) * v
      positions[count * 3 + 2] = origin[2] + (k + z / n) * v
      count++
    }
  }
  const cell = (i: number, j: number, k: number) => {
    const q = slotOf(i, j, k)
    return q < 0 ? -1 : vertexOf[q * B3 + local(i, j, k)]
  }
  let tri = new Uint32Array(1 << 16), t = 0
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (t + 6 > tri.length) { const grown = new Uint32Array(tri.length * 2); grown.set(tri); tri = grown }
    if (flip) { tri[t++] = a; tri[t++] = c; tri[t++] = b; tri[t++] = a; tri[t++] = d; tri[t++] = c }
    else { tri[t++] = a; tri[t++] = b; tri[t++] = c; tri[t++] = a; tri[t++] = c; tri[t++] = d }
  }
  for (let q = 0; q < slots; q++) {
    const [bi, bj, bk] = brickOrigin(q)
    for (let lk = 0; lk < B; lk++) for (let lj = 0; lj < B; lj++) for (let li = 0; li < B; li++) {
      const i = bi + li, j = bj + lj, k = bk + lk
      const f0 = F[q * B3 + li + (lj << SHIFT) + (lk << (2 * SHIFT))]
      if (!changedNear[q] && (f0 > 1.1 * v || f0 < -1.1 * v)) continue
      if (j >= 1 && k >= 1) {
        const f1 = at(i + 1, j, k)
        if ((f0 < 0) !== (f1 < 0)) quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), !(f0 < 0))
      }
      if (i >= 1 && k >= 1) {
        const f1 = at(i, j + 1, k)
        if ((f0 < 0) !== (f1 < 0)) quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), !(f0 < 0))
      }
      if (i >= 1 && j >= 1) {
        const f1 = at(i, j, k + 1)
        if ((f0 < 0) !== (f1 < 0)) quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), !(f0 < 0))
      }
    }
  }
  let mesh: MeshData = makeManifold({ positions: positions.slice(0, count * 3), indices: tri.slice(0, t) })
  if (smooth > 0) mesh = { positions: taubin(mesh.positions, meshNeighbors(mesh.indices, mesh.positions.length / 3), smooth), indices: mesh.indices }
  return { mesh, voxel: v, bricks: slots, samples: slots * B3, cavities, pinches, problems: edgeProblems(mesh.indices) }
}
