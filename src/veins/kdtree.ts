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
    this.bestD2 = best; this.bestId = owner
    this.qx = qx; this.qy = qy; this.qz = qz
    if (this.n) this.search(0, this.n)
  }

  private test(i: number) {
    const dx = this.qx - this.x[i], dy = this.qy - this.y[i], dz = this.qz - this.z[i]
    const d2 = dx * dx + dy * dy + dz * dz
    if (d2 < this.bestD2 || (d2 === this.bestD2 && this.id[i] < this.bestId)) { this.bestD2 = d2; this.bestId = this.id[i] }
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
}
