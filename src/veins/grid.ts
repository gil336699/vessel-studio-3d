// Points in a uniform 3D grid, for the crowding test, loop neighbourhoods and blue-noise placement. Cells are packed
// into one number, exact below 2^53: 2^16 cells along each axis, far more than any model here needs.
const R = 65536, H = 32768

export class PointGrid {
  private map = new Map<number, number[]>()
  constructor(readonly cell: number) {}

  private key(i: number, j: number, k: number) { return ((i + H) * R + (j + H)) * R + (k + H) }

  add(id: number, x: number, y: number, z: number) {
    const c = this.cell
    const k = this.key(Math.floor(x / c), Math.floor(y / c), Math.floor(z / c))
    const list = this.map.get(k)
    if (list) list.push(id); else this.map.set(k, [id])
  }

  // Every point within r of (x, y, z), unordered. `visit` returns true to stop early. When the search would cover more
  // cells than hold points, as for a wide loop search, the cells that hold points are looked at instead.
  near(x: number, y: number, z: number, r: number, xs: ArrayLike<number>, ys: ArrayLike<number>, zs: ArrayLike<number>, visit: (id: number, d2: number) => boolean | void) {
    const r2 = r * r, c = this.cell
    const i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c)
    const j0 = Math.floor((y - r) / c), j1 = Math.floor((y + r) / c)
    const k0 = Math.floor((z - r) / c), k1 = Math.floor((z + r) / c)
    const test = (list: number[]) => {
      for (const id of list) {
        const dx = xs[id] - x, dy = ys[id] - y, dz = zs[id] - z, d2 = dx * dx + dy * dy + dz * dz
        if (d2 < r2 && visit(id, d2) === true) return true
      }
      return false
    }
    if ((i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1) > this.map.size) {
      for (const [key, list] of this.map) {
        const k = (key % R) - H, rest = Math.floor(key / R), j = (rest % R) - H, i = Math.floor(rest / R) - H
        if (i < i0 || i > i1 || j < j0 || j > j1 || k < k0 || k > k1) continue
        if (test(list)) return
      }
      return
    }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const list = this.map.get(this.key(i, j, k))
      if (list && test(list)) return
    }
  }
}
