// The grown veins as numbers: vein widths by Murray's law, the segments the tube skin and the exports use, and the
// figures the measurements panel shows. Plain functions of the points, so the page, the exports and the tests agree.
// Feeds and widths are copied from Vessel Studio 1.4.0 (src/veins/network.ts).

export type WidthRule = 'murray' | 'even'
export type WidthSettings = { rule: WidthRule; tip: number; max: number; exponent: number }

// How many vein ends each point feeds (the pipe model). A point is only added after its parent, so walking the indices
// downward visits every child before its parent. Points `keep` leaves out (0) feed nothing.
export function feeds(parent: ArrayLike<number>, n: number, keep?: Uint8Array | null): Float64Array {
  const q = new Float64Array(n)
  for (let v = n - 1; v >= 0; v--) {
    if (keep && !keep[v]) continue
    if (q[v] === 0) q[v] = 1
    const p = parent[v]
    if (p >= 0) q[p] += q[v]
  }
  return q
}

// Join: the network without its dead ends. A vein end that never met the other tree carries no flow, so it is cut back,
// again and again, until every end left is a join between the trees. Roots and entry points stay. Returns 1 for each
// point kept.
export function trimDeadEnds(parent: ArrayLike<number>, n: number, links: ArrayLike<number>): Uint8Array {
  const keep = new Uint8Array(n).fill(1)
  const kids = new Int32Array(n)
  for (let v = 0; v < n; v++) if (parent[v] >= 0) kids[parent[v]]++
  const linked = new Uint8Array(n)
  for (let i = 0; i < links.length; i++) linked[links[i]] = 1
  const stack: number[] = []
  for (let v = n - 1; v >= 0; v--) if (kids[v] === 0 && !linked[v] && parent[v] >= 0) stack.push(v)
  while (stack.length) {
    const v = stack.pop()!
    keep[v] = 0
    const p = parent[v]
    if (p < 0) continue
    kids[p]--
    // A root (no parent) or the point an entry leads into (its parent has no parent) is never cut.
    if (kids[p] === 0 && !linked[p] && parent[p] >= 0 && parent[parent[p]] >= 0) stack.push(p)
  }
  return keep
}

// Width (mm) of the vein arriving at each point. Murray's law: at each fork the parent's width^n is the sum of its
// children's, starting from the tip width at every end, so a vein feeding m ends is tip × m^(1/n) wide, up to the
// widest width. Even gives every vein the tip width.
export function veinWidths(parent: ArrayLike<number>, n: number, w: WidthSettings, keep?: Uint8Array | null): Float64Array {
  const out = new Float64Array(n)
  if (w.rule === 'even') return out.fill(w.tip)
  const q = feeds(parent, n, keep)
  const inv = 1 / Math.max(1, w.exponent)
  for (let v = 0; v < n; v++) out[v] = Math.min(Math.max(w.tip, w.max), w.tip * q[v] ** inv)
  return out
}

// The widest vein drawn: only points with a parent count, as each vein is as wide as the point it grows to.
export function widestVein(parent: ArrayLike<number>, n: number, w: WidthSettings): number {
  if (n < 2) return 0
  const widths = veinWidths(parent, n, w)
  let widest = 0
  for (let v = 0; v < n; v++) if (parent[v] >= 0 && widths[v] > widest) widest = widths[v]
  return widest
}

// Every vein segment as a round cone for the tube skin: [ax, ay, az, bx, by, bz, ra, rb], eight numbers each. A segment
// from p to v starts at p's radius and ends at v's, so a branch leaving a fork starts as wide as the vein it leaves
// and narrows to its own width within one segment. Loop joins run between their two points' radii.
export function tubeSegments(x: ArrayLike<number>, y: ArrayLike<number>, z: ArrayLike<number>, parent: ArrayLike<number>,
  joins: ArrayLike<number>, n: number, widths: Float64Array): Float64Array {
  const count = (() => { let c = 0; for (let v = 0; v < n; v++) if (parent[v] >= 0) c++; return c + Math.floor(joins.length / 2) })()
  const out = new Float64Array(count * 8)
  let o = 0
  const put = (a: number, b: number) => {
    out[o++] = x[a]; out[o++] = y[a]; out[o++] = z[a]; out[o++] = x[b]; out[o++] = y[b]; out[o++] = z[b]
    out[o++] = widths[a] / 2; out[o++] = widths[b] / 2
  }
  for (let v = 0; v < n; v++) if (parent[v] >= 0) put(parent[v], v)
  for (let i = 0; i + 1 < joins.length; i += 2) put(joins[i], joins[i + 1])
  return out
}

export type NetworkStats = { points: number; ends: number; forks: number; loops: number; roots: number; length: number }

export function networkStats(x: ArrayLike<number>, y: ArrayLike<number>, z: ArrayLike<number>, parent: ArrayLike<number>, joins: ArrayLike<number>, n: number): NetworkStats {
  const kids = new Int32Array(n)
  let roots = 0, length = 0
  for (let v = 0; v < n; v++) {
    const p = parent[v]
    if (p < 0) { roots++; continue }
    kids[p]++
    length += Math.hypot(x[v] - x[p], y[v] - y[p], z[v] - z[p])
  }
  const joined = new Uint8Array(n)
  for (let i = 0; i + 1 < joins.length; i += 2) {
    const a = joins[i], b = joins[i + 1]
    joined[a] = 1; joined[b] = 1
    length += Math.hypot(x[a] - x[b], y[a] - y[b], z[a] - z[b])
  }
  let ends = 0, forks = 0
  for (let v = 0; v < n; v++) {
    if (kids[v] === 0 && parent[v] >= 0 && !joined[v]) ends++
    if (kids[v] >= 2) forks++
  }
  return { points: n, ends, forks, loops: joins.length / 2, roots, length }
}

// The shortest distance between segments [p0, p1] and [q0, q1] (Ericson, Real-Time Collision Detection, 5.1.9).
export function segmentDistance(p0x: number, p0y: number, p0z: number, p1x: number, p1y: number, p1z: number,
  q0x: number, q0y: number, q0z: number, q1x: number, q1y: number, q1z: number): number {
  const d1x = p1x - p0x, d1y = p1y - p0y, d1z = p1z - p0z
  const d2x = q1x - q0x, d2y = q1y - q0y, d2z = q1z - q0z
  const rx = p0x - q0x, ry = p0y - q0y, rz = p0z - q0z
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz
  let s = 0, t = 0
  if (a <= 1e-18 && e <= 1e-18) return Math.hypot(rx, ry, rz)
  if (a <= 1e-18) t = Math.min(1, Math.max(0, f / e))
  else {
    const c = d1x * rx + d1y * ry + d1z * rz
    if (e <= 1e-18) s = Math.min(1, Math.max(0, -c / a))
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b
      s = den > 1e-18 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0
      t = (b * s + f) / e
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)) } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)) }
    }
  }
  return Math.hypot(p0x + d1x * s - q0x - d2x * t, p0y + d1y * s - q0y - d2y * t, p0z + d1z * s - q0z - d2z * t)
}

// Pairs of segments from different systems whose centre lines come within `reach`: [a, b, distance], where a segment
// is named by the point it grows to.
function crossPairs(x: ArrayLike<number>, y: ArrayLike<number>, z: ArrayLike<number>, parent: ArrayLike<number>, sys: ArrayLike<number>,
  n: number, reach: (longest: number) => number): [number, number, number][] {
  const segs: number[] = []
  let longest = 0
  for (let v = 0; v < n; v++) if (parent[v] >= 0) {
    segs.push(v)
    const p = parent[v]
    longest = Math.max(longest, Math.hypot(x[v] - x[p], y[v] - y[p], z[v] - z[p]))
  }
  const R = reach(longest)
  const pairs: [number, number, number][] = []
  if (!(R > 0)) return pairs
  const cell = R
  const key = (i: number, j: number, k: number) => `${i},${j},${k}`
  const grid = new Map<string, number[]>()
  for (const v of segs) {
    const p = parent[v]
    const k = key(Math.floor((x[v] + x[p]) / 2 / cell), Math.floor((y[v] + y[p]) / 2 / cell), Math.floor((z[v] + z[p]) / 2 / cell))
    const list = grid.get(k)
    if (list) list.push(v); else grid.set(k, [v])
  }
  for (const a of segs) {
    const pa = parent[a]
    const ci = Math.floor((x[a] + x[pa]) / 2 / cell), cj = Math.floor((y[a] + y[pa]) / 2 / cell), ck = Math.floor((z[a] + z[pa]) / 2 / cell)
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (let k = ck - 1; k <= ck + 1; k++) {
      for (const b of grid.get(key(i, j, k)) ?? []) {
        if (sys[b] === sys[a] || b < a) continue
        const pb = parent[b]
        const d = segmentDistance(x[pa], y[pa], z[pa], x[a], y[a], z[a], x[pb], y[pb], z[pb], x[b], y[b], z[b])
        if (d <= R) pairs.push([a, b, d])
      }
    }
  }
  return pairs
}

const widestOf = (widths: ArrayLike<number>, n: number) => { let w = 0; for (let v = 0; v < n; v++) w = Math.max(w, widths[v]); return w }

// The closest gap between the tube surfaces of different systems, mm, with these widths; Infinity when no two come near.
// Negative means tubes overlap.
export function systemGap(x: ArrayLike<number>, y: ArrayLike<number>, z: ArrayLike<number>, parent: ArrayLike<number>, sys: ArrayLike<number>,
  n: number, widths: ArrayLike<number>): number {
  const widest = widestOf(widths, n)
  let closest = Infinity
  for (const [a, b, d] of crossPairs(x, y, z, parent, sys, n, longest => widest + longest + 1)) {
    const pa = parent[a], pb = parent[b]
    closest = Math.min(closest, d - Math.max(widths[a], widths[pa]) / 2 - Math.max(widths[b], widths[pb]) / 2)
  }
  return closest
}

// Interweave: Murray widths keep growing as a tree gains ends, after a vein has passed another system's vessel, so
// the widths are capped where two systems pass close: each end of a segment may be at most half the room between it
// and the nearest segment of another system, after the gap. The cap spreads along the vein, so a tube narrows over a
// few segments rather than at once. Returns the new widths, how many points were narrowed, and the closest gap left
// between the systems' tube surfaces.
export function separateWidths(x: ArrayLike<number>, y: ArrayLike<number>, z: ArrayLike<number>, parent: ArrayLike<number>,
  sys: ArrayLike<number>, n: number, widths: Float64Array, gap: number, taper = 0.4): { widths: Float64Array; narrowed: number; closest: number } {
  const R = widths.map(w => w / 2)
  const widest = widestOf(widths, n) / 2
  const cap = new Float64Array(n).fill(Infinity)
  const pairs = crossPairs(x, y, z, parent, sys, n, longest => Math.max(0, gap) + 2 * widest + longest)
  for (const [a, b, d] of pairs) {
    const room = Math.max(0, (d - gap) / 2)
    for (const v of [a, parent[a], b, parent[b]]) if (room < cap[v]) cap[v] = room
  }
  // Spread each cap along the tree: a radius can grow by at most `taper` mm a millimetre away from a cap.
  const limit = Float64Array.from(cap)
  for (let pass = 0; pass < 2; pass++) {
    // Down the tree (parents come before children), then up.
    for (let v = 0; v < n; v++) {
      const p = parent[v]
      if (p < 0) continue
      const L = Math.hypot(x[v] - x[p], y[v] - y[p], z[v] - z[p])
      limit[v] = Math.min(limit[v], limit[p] + taper * L)
    }
    for (let v = n - 1; v >= 0; v--) {
      const p = parent[v]
      if (p < 0) continue
      const L = Math.hypot(x[v] - x[p], y[v] - y[p], z[v] - z[p])
      limit[p] = Math.min(limit[p], limit[v] + taper * L)
    }
  }
  let narrowed = 0
  const out = new Float64Array(n)
  for (let v = 0; v < n; v++) {
    const r = Math.min(R[v], limit[v])
    if (r < R[v] - 1e-9) narrowed++
    out[v] = 2 * r
  }
  let closest = Infinity
  for (const [a, b, d] of pairs) {
    const pa = parent[a], pb = parent[b]
    closest = Math.min(closest, d - Math.max(out[a], out[pa]) / 2 - Math.max(out[b], out[pb]) / 2)
  }
  return { widths: out, narrowed, closest }
}
