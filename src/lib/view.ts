// What the view draws and the exports hold, from the grown veins: every segment as a round cone with its Murray widths,
// coloured by system. Join trims the dead ends when Trim dead ends is on; Interweave narrows tubes where two systems
// pass closer than the gap. One function for both, so an export always matches the view.
import { separateWidths, trimDeadEnds, veinWidths } from '../veins/network'
import { interweaving, joining, widthSettings, type Settings } from './settings'

export type VeinNet = {
  x: ArrayLike<number>; y: ArrayLike<number>; z: ArrayLike<number>; parent: ArrayLike<number>; sys: ArrayLike<number>
  joins: ArrayLike<number>; links: ArrayLike<number>; points: number
}

export const LINK = 255

export type VeinView = {
  // Round cones, [ax, ay, az, bx, by, bz, ra, rb] each, and the system each belongs to (LINK for a join between trees).
  segs: Float64Array; system: Uint8Array; count: number
  // The width at each point, and which points are drawn.
  widths: Float64Array; keep: Uint8Array | null
  narrowed: number; closest: number
}

export function veinView(net: VeinNet, s: Settings, opts: { separate?: boolean } = {}): VeinView {
  const n = net.points
  const keep = joining(s) && s.trim ? trimDeadEnds(net.parent, n, net.links) : null
  let widths = veinWidths(net.parent, n, widthSettings(s), keep)
  let narrowed = 0, closest = Infinity
  if (interweaving(s) && opts.separate !== false) {
    const sep = separateWidths(net.x, net.y, net.z, net.parent, net.sys, n, widths, s.gap)
    widths = sep.widths; narrowed = sep.narrowed; closest = sep.closest
  }
  let count = 0
  for (let v = 0; v < n; v++) if (net.parent[v] >= 0 && (!keep || keep[v])) count++
  const joins = Math.floor(net.joins.length / 2), links = Math.floor(net.links.length / 2)
  const segs = new Float64Array((count + joins + links) * 8), system = new Uint8Array(count + joins + links)
  let o = 0, k = 0
  const put = (a: number, b: number, sys: number) => {
    segs[o++] = net.x[a]; segs[o++] = net.y[a]; segs[o++] = net.z[a]; segs[o++] = net.x[b]; segs[o++] = net.y[b]; segs[o++] = net.z[b]
    segs[o++] = widths[a] / 2; segs[o++] = widths[b] / 2
    system[k++] = sys
  }
  for (let v = 0; v < n; v++) if (net.parent[v] >= 0 && (!keep || keep[v])) put(net.parent[v], v, net.sys[v])
  for (let i = 0; i < joins; i++) put(net.joins[i * 2], net.joins[i * 2 + 1], net.sys[net.joins[i * 2]])
  for (let i = 0; i < links; i++) {
    const a = net.links[i * 2], b = net.links[i * 2 + 1]
    // A join between the trees is as wide as the narrower end it joins.
    const r = Math.min(widths[a], widths[b]) / 2
    segs[o++] = net.x[a]; segs[o++] = net.y[a]; segs[o++] = net.z[a]; segs[o++] = net.x[b]; segs[o++] = net.y[b]; segs[o++] = net.z[b]
    segs[o++] = r; segs[o++] = r
    system[k++] = LINK
  }
  return { segs, system, count: k, widths, keep, narrowed, closest }
}
