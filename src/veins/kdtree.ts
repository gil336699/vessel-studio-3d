// A k-d tree over a batch of vein points. The engine builds one each step over that step's new points, and every live
// attractor asks it whether one of them is nearer than the nearest vein point it already knows. Vein points never move
// or vanish, so that keeps every attractor's nearest point exact, at the cost of the new points only.
//
// Ties go to the lower index, as a full search would. So the tree over every point that a reopened project builds finds
// exactly the nearest points an unbroken run found step by step, and the two runs carry on the same.
const LEAF = 8

export class PointTree {
  private x: Float64Array
  private y: Float64Array
  private z: Float64Array
  private id: Int32Array
  private axis: Uint8Array
  private n: number
  // The answer of the last query.
  bestD2 = Infinity
  bestId = -1
  private qx = 0
  private qy = 0
  private qz = 0

  constructor(xs: ArrayLike<number>, ys: ArrayLike<number>, zs: ArrayLike<number>, ids: ArrayLike<number>) {
    const n = ids.length
    this.n = n
    this.x = new Float64Array(n); this.y = new Float64Array(n); this.z = new Float64Array(n); this.id = new Int32Array(n)
    for (let i = 0; i < n; i++) { const p = ids[i]; this.x[i] = xs[p]; this.y[i] = ys[p]; this.z[i] = zs[p]; this.id[i] = p }
    this.axis = new Uint8Array(n)
    this.build(0, n)
  }

  get size() { return this.n }

  private coord(a: number) { return a === 0 ? this.x : a === 1 ? this.y : this.z }

  private swap(i: number, j: number) {
    const { x, y, z, id } = this
    let t = x[i]; x[i] = x[j]; x[j] = t
    t = y[i]; y[i] = y[j]; y[j] = t
    t = z[i]; z[i] = z[j]; z[j] = t
    const u = id[i]; id[i] = id[j]; id[j] = u
  }

  private build(lo: number, hi: number) {
    if (hi - lo <= LEAF) return
    // Split along the widest side, at the median.
    let a = 0, widest = -1
    for (let k = 0; k < 3; k++) {
      const c = this.coord(k)
      let min = Infinity, max = -Infinity
      for (let i = lo; i < hi; i++) { const v = c[i]; if (v < min) min = v; if (v > max) max = v }
      if (max - min > widest) { widest = max - min; a = k }
    }
    const mid = (lo + hi) >> 1
    this.select(lo, hi - 1, mid, this.coord(a))
    this.axis[mid] = a
    this.build(lo, mid)
    this.build(mid + 1, hi)
  }

  // Quickselect: afterwards c[mid] is in its sorted place, with no larger value before it and no smaller one after.
  private select(left: number, right: number, k: number, c: Float64Array) {
    while (right > left) {
      const pivot = c[(left + right) >> 1]
      let i = left, j = right
      while (i <= j) {
        while (c[i] < pivot) i++
        while (c[j] > pivot) j--
        if (i <= j) { this.swap(i, j); i++; j-- }
      }
      if (k <= j) right = j
      else if (k >= i) left = i
      else return
    }
  }

  // The nearest point to q, if nearer than `best` (squared) or as near with a lower index than `owner`.
  nearest(qx: number, qy: number, qz: number, best: number, owner: number) {
    this.accept = null
    this.bestD2 = best; this.bestId = owner
    this.qx = qx; this.qy = qy; this.qz = qz
    if (this.n) this.search(0, this.n)
  }

  // The same, among the points `accept` takes. Depth first: every point that would be nearer than the best so far is
  // offered, so this suits a quick test; `ordered` offers as few as it can, for a slow one.
  nearestWhere(qx: number, qy: number, qz: number, best: number, owner: number, accept: (id: number) => boolean) {
    this.accept = accept
    this.bestD2 = best; this.bestId = owner
    this.qx = qx; this.qy = qy; this.qz = qz
    if (this.n) this.search(0, this.n)
    this.accept = null
  }

  private accept: ((id: number) => boolean) | null = null

  private test(i: number) {
    const dx = this.qx - this.x[i], dy = this.qy - this.y[i], dz = this.qz - this.z[i]
    const d2 = dx * dx + dy * dy + dz * dz
    if ((d2 < this.bestD2 || (d2 === this.bestD2 && this.id[i] < this.bestId)) && (!this.accept || this.accept(this.id[i]))) { this.bestD2 = d2; this.bestId = this.id[i] }
  }

  private search(lo: number, hi: number) {
    if (hi - lo <= LEAF) { for (let i = lo; i < hi; i++) this.test(i); return }
    const mid = (lo + hi) >> 1
    this.test(mid)
    const a = this.axis[mid]
    const diff = (a === 0 ? this.qx : a === 1 ? this.qy : this.qz) - this.coord(a)[mid]
    // A point across the split is at least |diff| away. Equal distances are still visited, for the tie rule.
    if (diff < 0) {
      this.search(lo, mid)
      if (diff * diff <= this.bestD2) this.search(mid + 1, hi)
    } else {
      this.search(mid + 1, hi)
      if (diff * diff <= this.bestD2) this.search(lo, mid)
    }
  }

  // The points nearer q than `limit` (squared), or as near with an index below `below`, one at a time, nearest first and
  // the lower index first on a tie, until `visit` returns true. Best first: a heap holds the parts of the tree not yet
  // opened, each with the least distance any point in it can have, and the points found so far, so only the points up to
  // the one `visit` accepts are ever looked at.
  ordered(qx: number, qy: number, qz: number, limit: number, below: number, visit: (id: number, d2: number) => boolean) {
    if (!this.n) return
    const heap = this.heap, X = this.x, Y = this.y, Z = this.z, ID = this.id
    heap.clear()
    heap.push(0, NODE, 0, this.n)
    while (heap.size) {
      const key = heap.topKey(), kind = heap.topKind(), a = heap.topA(), b = heap.topB()
      heap.pop()
      if (kind === POINT) {
        // Points come out in order, so the first one out of range ends the search.
        if (!(key < limit || (key === limit && a < below))) return
        if (visit(a, key)) return
        continue
      }
      if (key > limit) return
      if (b - a <= LEAF) {
        for (let i = a; i < b; i++) {
          const dx = qx - X[i], dy = qy - Y[i], dz = qz - Z[i], d2 = dx * dx + dy * dy + dz * dz
          if (d2 < limit || (d2 === limit && ID[i] < below)) heap.push(d2, POINT, ID[i], 0)
        }
        continue
      }
      const mid = (a + b) >> 1
      const dx = qx - X[mid], dy = qy - Y[mid], dz = qz - Z[mid], d2 = dx * dx + dy * dy + dz * dz
      if (d2 < limit || (d2 === limit && ID[mid] < below)) heap.push(d2, POINT, ID[mid], 0)
      const axis = this.axis[mid]
      const diff = axis === 0 ? dx : axis === 1 ? dy : dz
      // The near side is no nearer than this part; the far side is at least |diff| away too.
      const far = Math.max(key, diff * diff)
      if (diff < 0) {
        if (mid > a) heap.push(key, NODE, a, mid)
        if (b > mid + 1 && far <= limit) heap.push(far, NODE, mid + 1, b)
      } else {
        if (b > mid + 1) heap.push(key, NODE, mid + 1, b)
        if (mid > a && far <= limit) heap.push(far, NODE, a, mid)
      }
    }
  }

  private heap = new Queue()
}

const NODE = 0, POINT = 1

// A binary min-heap of tree parts and points, by distance. On equal distances parts come first, so every point at that
// distance is out before any of them is handed over, and points go by index, for the tie rule.
class Queue {
  private keys = new Float64Array(64)
  private kinds = new Uint8Array(64)
  private as = new Int32Array(64)
  private bs = new Int32Array(64)
  size = 0

  clear() { this.size = 0 }
  topKey() { return this.keys[0] }
  topKind() { return this.kinds[0] }
  topA() { return this.as[0] }
  topB() { return this.bs[0] }

  private less(i: number, j: number) {
    const ki = this.keys[i], kj = this.keys[j]
    if (ki !== kj) return ki < kj
    if (this.kinds[i] !== this.kinds[j]) return this.kinds[i] < this.kinds[j]
    return this.as[i] < this.as[j]
  }

  private swap(i: number, j: number) {
    let t = this.keys[i]; this.keys[i] = this.keys[j]; this.keys[j] = t
    t = this.kinds[i]; this.kinds[i] = this.kinds[j]; this.kinds[j] = t
    t = this.as[i]; this.as[i] = this.as[j]; this.as[j] = t
    t = this.bs[i]; this.bs[i] = this.bs[j]; this.bs[j] = t
  }

  push(key: number, kind: number, a: number, b: number) {
    if (this.size === this.keys.length) {
      const grow = <A extends Float64Array | Uint8Array | Int32Array>(old: A, make: (n: number) => A) => { const next = make(old.length * 2); next.set(old); return next }
      this.keys = grow(this.keys, n => new Float64Array(n)); this.kinds = grow(this.kinds, n => new Uint8Array(n))
      this.as = grow(this.as, n => new Int32Array(n)); this.bs = grow(this.bs, n => new Int32Array(n))
    }
    let i = this.size++
    this.keys[i] = key; this.kinds[i] = kind; this.as[i] = a; this.bs[i] = b
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(i, p)) break; this.swap(i, p); i = p }
  }

  pop() {
    const last = --this.size
    if (last === 0) return
    this.swap(0, last)
    let i = 0
    for (;;) {
      const l = 2 * i + 1, r = l + 1
      let m = i
      if (l < last && this.less(l, m)) m = l
      if (r < last && this.less(r, m)) m = r
      if (m === i) return
      this.swap(i, m); i = m
    }
  }
}
