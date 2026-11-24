// The Surface domain: veins grow across a model's skin and stay on it, like vessels over a heart or roots round a pot.
//
// A growth step keeps only the part of its heading along the surface (the part along the normal is removed), then the
// new point is snapped onto the mesh with three-mesh-bvh's closestPointToPoint. A step is refused when the snap lands
// on a sheet facing the other way (it jumped across a thin wall or a gap), on another piece of the model (it jumped the
// gap between a pot and its saucer, say), when it hardly moves (stuck at a rim), or when it comes nearer an open rim
// than the edge clearance. An attractor pulls only veins on its own piece whose normal doesn't face away from its own,
// so veins never pair across a thin wall, a narrow gap or a gap between pieces.
//
// On each closed piece of a model, veins also stay off the underside it stands on: skin facing down with too little
// room below it, down to the bed or to another piece of the model. They keep the edge clearance from the bed too, so
// their tubes don't reach below it. No attractors go there, and steps and roots there are refused. A vein on a pot's
// bottom would lift it off the bed, or fill the gap to its saucer and join the two in a print. A piece counts as closed
// with a small hole or two; its triangles may face in or out, as its signed volume tells.
import { BufferAttribute, BufferGeometry, DoubleSide, Ray, Vector3 } from 'three'
import { MeshBVH, type HitPointInfo } from 'three-mesh-bvh'
import { meshBounds, openEdges, rimLoops, type MeshData, type Vec3 } from '../lib/mesh'
import type { Domain } from './domain'
import { Rng } from './random'

// A step whose landing normal turns more than about 105° from where it started has crossed to another sheet.
const STEP_TURN = -0.25
// An attractor pulls a vein only if their normals are within 120°: thin walls and narrow gaps face about 180° apart.
const SIGHT = -0.5
// Loop joins only between points facing nearly the same way.
const JOIN = 0.2
// Faces within this angle share their normals at a corner; sharper edges, such as a box's, keep each face's own.
const CREASE = Math.cos(Math.PI / 3)
// The underside: triangles that don't face more than 30° above level, so a vein's tube on them hangs below its centre
// line, with less room below them than this share of the model's longest side: the radius of the widest vein the
// presets grow (5 % of the model's size wide).
const HANGS = 0.5
const BASE_ROOM = 0.025
// A piece counts as closed when its open edges add up to less than this share of the square root of its area, or are at
// most MISSING_EDGES in number: a small hole, or a missing triangle or two however long, not the mouth of a vase.
const SMALL_HOLES = 0.5
const MISSING_EDGES = 6

export class SurfaceDomain implements Domain {
  readonly kind = 'surface'
  // Sight is a quick test of two normals, and a vein far across the skin can still grow to an attractor, down a pot's
  // inside walls onto its floor, say.
  readonly seeBeyond = Infinity
  readonly quickSight = true
  readonly span: number
  readonly centre: readonly [number, number, number]
  readonly area: number
  readonly positions: Float32Array
  // The triangle corners in the BVH's own order, which its face indices refer to.
  readonly indices: Uint32Array
  // A normal for each triangle corner, blended across smooth edges only.
  readonly cornerNormals: Float32Array
  readonly faceArea: Float64Array
  // Open rims as segments, [ax, ay, az, bx, by, bz] each, and loops of vertices.
  readonly rimSegments: Float64Array
  readonly rims: number[][]
  private bvh: MeshBVH
  private hit: HitPointInfo = { point: new Vector3(), distance: 0, faceIndex: 0 }
  private probe = new Vector3()
  private snapped = new Float64Array(6)
  private probed = new Float64Array(6)
  private rimGrid: Map<number, number[]>
  private rimCell: number
  // The model's separate pieces, by triangles that share corners, and each triangle's piece (null for one piece). A vein
  // stays on the piece it starts on: one that crossed the gap between two would join them in a print.
  readonly regions: number
  private faceRegion: Int32Array | null
  // 1 for each triangle on the underside a closed piece stands on, which veins stay off, and for each triangle of a
  // closed piece, which keeps the edge clearance from the bed (the model's lowest point).
  readonly underside: Uint8Array
  private solid: Uint8Array
  readonly bottom: number
  // For each triangle of a closed piece that doesn't face well up, 1: a point on it needs the room below it for a vein's
  // tube, as a large triangle's middle can sit higher than the low end of a wall.
  private hangs: Uint8Array
  private facePiece: Int32Array
  private pieceOut: Float64Array
  private room: number
  private several: boolean
  private down = new Ray(new Vector3(), new Vector3(0, 0, -1))

  constructor(mesh: MeshData) {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3))
    geometry.setIndex(new BufferAttribute(mesh.indices.slice(), 1))
    // The BVH reorders the triangles; everything below uses its order.
    this.bvh = new MeshBVH(geometry)
    this.positions = mesh.positions
    this.indices = geometry.index!.array as Uint32Array
    const P = this.positions, I = this.indices
    const faces = I.length / 3
    // Face normals and areas.
    const FN = new Float64Array(faces * 3)
    this.faceArea = new Float64Array(faces)
    let area = 0
    for (let f = 0; f < faces; f++) {
      const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2]
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, L = Math.hypot(nx, ny, nz)
      this.faceArea[f] = L / 2; area += L / 2
      if (L > 0) { FN[f * 3] = nx / L; FN[f * 3 + 1] = ny / L; FN[f * 3 + 2] = nz / L }
    }
    this.area = area
    // Corner normals: each corner blends the faces round its vertex that are within the crease angle of its own face.
    const vertices = P.length / 3
    const start = new Uint32Array(vertices + 1)
    for (let i = 0; i < I.length; i++) start[I[i] + 1]++
    for (let v = 0; v < vertices; v++) start[v + 1] += start[v]
    const around = new Uint32Array(I.length), fill = start.slice(0, vertices)
    for (let i = 0; i < I.length; i++) around[fill[I[i]]++] = Math.floor(i / 3)
    this.cornerNormals = new Float32Array(I.length * 3)
    for (let f = 0; f < faces; f++) for (let j = 0; j < 3; j++) {
      const v = I[f * 3 + j]
      let sx = 0, sy = 0, sz = 0
      for (let k = start[v]; k < start[v + 1]; k++) {
        const g = around[k]
        if (FN[g * 3] * FN[f * 3] + FN[g * 3 + 1] * FN[f * 3 + 1] + FN[g * 3 + 2] * FN[f * 3 + 2] < CREASE) continue
        const w = this.faceArea[g]
        sx += FN[g * 3] * w; sy += FN[g * 3 + 1] * w; sz += FN[g * 3 + 2] * w
      }
      const L = Math.hypot(sx, sy, sz)
      const o = (f * 3 + j) * 3
      if (L > 0) { this.cornerNormals[o] = sx / L; this.cornerNormals[o + 1] = sy / L; this.cornerNormals[o + 2] = sz / L }
      else { this.cornerNormals[o] = FN[f * 3]; this.cornerNormals[o + 1] = FN[f * 3 + 1]; this.cornerNormals[o + 2] = FN[f * 3 + 2] }
    }
    const { lo, hi } = meshBounds(P)
    this.span = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
    this.centre = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
    // Open rims.
    const edges = openEdges(I)
    this.rims = rimLoops(edges, P)
    this.rimSegments = new Float64Array(edges.length * 3)
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e] * 3, b = edges[e + 1] * 3
      this.rimSegments.set([P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2]], e * 3)
    }
    let longest = 0
    for (let s = 0; s < this.rimSegments.length; s += 6) {
      const r = this.rimSegments
      longest = Math.max(longest, Math.hypot(r[s + 3] - r[s], r[s + 4] - r[s + 1], r[s + 5] - r[s + 2]))
    }
    const parts = facePieces(I, P.length / 3)
    this.regions = parts.count
    this.faceRegion = parts.count > 1 ? parts.face : null
    const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
    const shapes = pieceShapes(P, I, parts.face, parts.count, this.faceArea, edges)
    this.solid = new Uint8Array(faces)
    for (let f = 0; f < faces; f++) this.solid[f] = shapes.closed[parts.face[f]]
    this.bottom = lo[2]
    this.underside = undersideFaces(P, I, FN, this.bvh, parts.face, shapes, parts.count > 1, lo[2], BASE_ROOM * size)
    this.hangs = new Uint8Array(faces)
    for (let f = 0; f < faces; f++) { const k = parts.face[f]; this.hangs[f] = shapes.closed[k] && FN[f * 3 + 2] * shapes.out[k] < HANGS ? 1 : 0 }
    this.facePiece = parts.face
    this.pieceOut = shapes.out
    this.room = BASE_ROOM * size
    this.several = parts.count > 1
    this.rimCell = Math.max(longest, this.span / 200, 1e-6)
    this.rimGrid = new Map()
    for (let s = 0; s < this.rimSegments.length / 6; s++) {
      const r = this.rimSegments, o = s * 6
      const k = this.rimKey(Math.floor((r[o] + r[o + 3]) / 2 / this.rimCell), Math.floor((r[o + 1] + r[o + 4]) / 2 / this.rimCell), Math.floor((r[o + 2] + r[o + 5]) / 2 / this.rimCell))
      const list = this.rimGrid.get(k)
      if (list) list.push(s); else this.rimGrid.set(k, [s])
    }
  }

  get open() { return this.rimSegments.length > 0 }

  // Whether the skin nearest a point is on the underside the model stands on, or too close above the bed or a part
  // below it for a vein's tube.
  onUnderside(x: number, y: number, z: number): boolean {
    if (!this.snap(x, y, z, this.probed)) return false
    const f = this.hit.faceIndex, q = this.probed
    return this.underside[f] === 1 || this.cramped(f, q[0], q[1], q[2], q[3], q[4], q[5])
  }

  // Whether a point on triangle f (normal n there) has too little room below it for a vein's tube: on a closed piece,
  // skin that doesn't face well up, less than the room above the bed, or above another piece straight below. The look
  // down starts a hair outside the skin, so it doesn't graze the piece's own edge.
  private cramped(f: number, x: number, y: number, z: number, nx: number, ny: number, nz: number): boolean {
    if (!this.hangs[f]) return false
    if (z - this.bottom < this.room) return true
    if (!this.several) return false
    const o = this.pieceOut[this.facePiece[f]] * 0.02 * this.room
    this.down.origin.set(x + nx * o, y + ny * o, z + nz * o)
    const hit = this.bvh.raycastFirst(this.down, DoubleSide, 0, this.room)
    return !!hit && hit.faceIndex !== undefined && hit.faceIndex !== null && this.facePiece[hit.faceIndex] !== this.facePiece[f]
  }
  isCramped(f: number, x: number, y: number, z: number, nx: number, ny: number, nz: number) { return this.cramped(f, x, y, z, nx, ny, nz) }

  // Whether a triangle of a closed piece, at height z, is nearer the bed than the clearance.
  private byBed(f: number, z: number, clear: number) { return clear > 0 && this.solid[f] === 1 && z - this.bottom < clear }
  isByBed(f: number, z: number, clear: number) { return this.byBed(f, z, clear) }

  // Whether the skin nearest a point is nearer the bed than the clearance, on a closed piece.
  nearBed(x: number, y: number, z: number, clear: number): boolean {
    return this.snap(x, y, z, this.probed) && this.byBed(this.hit.faceIndex, this.probed[2], clear)
  }

  // The middle of the triangle nearest `point` where veins may grow: not on the underside, nor nearer the bed than the
  // clearance. Where a model's own root asked for there goes. Null when there is no such triangle.
  nearestAllowed(point: Vec3, clear: number): Vec3 | null {
    const P = this.positions, I = this.indices
    let best = Infinity, at: Vec3 | null = null
    for (let f = 0; f < this.underside.length; f++) {
      if (this.underside[f]) continue
      const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3
      const x = (P[a] + P[b] + P[c]) / 3, y = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, z = (P[a + 2] + P[b + 2] + P[c + 2]) / 3
      const N = this.cornerNormals, o = f * 9
      if (this.byBed(f, z, clear) || this.cramped(f, x, y, z, (N[o] + N[o + 3] + N[o + 6]) / 3, (N[o + 1] + N[o + 4] + N[o + 7]) / 3, (N[o + 2] + N[o + 5] + N[o + 8]) / 3)) continue
      const d2 = (x - point[0]) ** 2 + (y - point[1]) ** 2 + (z - point[2]) ** 2
      if (d2 < best) { best = d2; at = [x, y, z] }
    }
    return at
  }

  // The piece of the model a point on it is on, from 0.
  region(x: number, y: number, z: number): number {
    if (!this.faceRegion) return 0
    return this.snap(x, y, z, this.probed) ? this.faceRegion[this.hit.faceIndex] : 0
  }

  private rimKey(i: number, j: number, k: number) { return ((i + 32768) * 65536 + (j + 32768)) * 65536 + (k + 32768) }

  // Distance from a point to the nearest open rim, or Infinity when none is within `limit`.
  rimDistance(x: number, y: number, z: number, limit: number): number {
    if (!this.rimSegments.length) return Infinity
    const c = this.rimCell, r = this.rimSegments
    // Each segment sits in the cell of its midpoint, so look one cell further.
    const reach = Math.ceil(limit / c) + 1
    const ci = Math.floor(x / c), cj = Math.floor(y / c), ck = Math.floor(z / c)
    let best = Infinity
    for (let i = ci - reach; i <= ci + reach; i++) for (let j = cj - reach; j <= cj + reach; j++) for (let k = ck - reach; k <= ck + reach; k++) {
      const list = this.rimGrid.get(this.rimKey(i, j, k))
      if (!list) continue
      for (const s of list) {
        const o = s * 6
        const ex = r[o + 3] - r[o], ey = r[o + 4] - r[o + 1], ez = r[o + 5] - r[o + 2]
        const L2 = ex * ex + ey * ey + ez * ez
        let t = L2 > 0 ? ((x - r[o]) * ex + (y - r[o + 1]) * ey + (z - r[o + 2]) * ez) / L2 : 0
        t = Math.max(0, Math.min(1, t))
        const d = Math.hypot(x - r[o] - ex * t, y - r[o + 1] - ey * t, z - r[o + 2] - ez * t)
        if (d < best) best = d
      }
    }
    return best <= limit ? best : Infinity
  }

  // The nearest point on the mesh and its blended normal, written to out as [x, y, z, nx, ny, nz]. False when there is
  // no surface within maxDistance.
  snap(x: number, y: number, z: number, out: Float64Array, maxDistance = Infinity): boolean {
    const hit = this.bvh.closestPointToPoint(this.probe.set(x, y, z), this.hit, 0, maxDistance)
    if (!hit) return false
    const f = hit.faceIndex, P = this.positions, I = this.indices
    const qx = hit.point.x, qy = hit.point.y, qz = hit.point.z
    // Barycentric weights of the hit point in its triangle.
    const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3
    const v0x = P[b] - P[a], v0y = P[b + 1] - P[a + 1], v0z = P[b + 2] - P[a + 2]
    const v1x = P[c] - P[a], v1y = P[c + 1] - P[a + 1], v1z = P[c + 2] - P[a + 2]
    const v2x = qx - P[a], v2y = qy - P[a + 1], v2z = qz - P[a + 2]
    const d00 = v0x * v0x + v0y * v0y + v0z * v0z, d01 = v0x * v1x + v0y * v1y + v0z * v1z, d11 = v1x * v1x + v1y * v1y + v1z * v1z
    const d20 = v2x * v0x + v2y * v0y + v2z * v0z, d21 = v2x * v1x + v2y * v1y + v2z * v1z
    const den = d00 * d11 - d01 * d01
    let w1 = den ? (d11 * d20 - d01 * d21) / den : 0, w2 = den ? (d00 * d21 - d01 * d20) / den : 0
    w1 = Math.max(0, Math.min(1, w1)); w2 = Math.max(0, Math.min(1 - w1, w2))
    const w0 = 1 - w1 - w2
    const N = this.cornerNormals, o = f * 9
    const nx = w0 * N[o] + w1 * N[o + 3] + w2 * N[o + 6]
    const ny = w0 * N[o + 1] + w1 * N[o + 4] + w2 * N[o + 7]
    const nz = w0 * N[o + 2] + w1 * N[o + 5] + w2 * N[o + 8]
    const L = Math.hypot(nx, ny, nz) || 1
    out[0] = qx; out[1] = qy; out[2] = qz; out[3] = nx / L; out[4] = ny / L; out[5] = nz / L
    return true
  }

  step(px: number, py: number, pz: number, pnx: number, pny: number, pnz: number,
    hx: number, hy: number, hz: number, length: number, clear: number, out: Float64Array, region = -1): boolean {
    // Keep only the part of the heading along the surface.
    const along = hx * pnx + hy * pny + hz * pnz
    let tx = hx - along * pnx, ty = hy - along * pny, tz = hz - along * pnz
    const T = Math.hypot(tx, ty, tz)
    if (!(T > 1e-6)) return false
    tx /= T; ty /= T; tz /= T
    const s = this.snapped, probe = this.probed
    // Walk the segment along the skin. Past a sharp outside edge the snap stops on the edge, short of the full length:
    // the heading then turns over the edge as the surface does (from this face's normal to the next face's, found just
    // past the edge), and the rest of the step goes on down the next face, up to three times.
    let x = px, y = py, z = pz, nx = pnx, ny = pny, nz = pnz, left = length, folds = 0
    for (let k = 0; k < 4 && left > 0.05 * length; k++) {
      if (!this.snap(x + tx * left, y + ty * left, z + tz * left, s, 2 * length)) return false
      const moved = Math.hypot(s[0] - x, s[1] - y, s[2] - z)
      x = s[0]; y = s[1]; z = s[2]; nx = s[3]; ny = s[4]; nz = s[5]
      if (moved >= 0.9 * left) { left = 0; break }
      left -= moved
      const e = 0.1 * length
      if (!this.snap(x + tx * e - nx * e, y + ty * e - ny * e, z + tz * e - nz * e, probe, 2 * length)) break
      const c = nx * probe[3] + ny * probe[4] + nz * probe[5]
      if (c > 0.9999) break
      // Rodrigues: turn the heading about the edge by the angle between the two faces' normals.
      let ax = ny * probe[5] - nz * probe[4], ay = nz * probe[3] - nx * probe[5], az = nx * probe[4] - ny * probe[3]
      const A = Math.hypot(ax, ay, az)
      if (!(A > 1e-9)) break
      ax /= A; ay /= A; az /= A
      const sin = A, cos = c, dot = ax * tx + ay * ty + az * tz
      const cx = ay * tz - az * ty, cy = az * tx - ax * tz, cz = ax * ty - ay * tx
      let rx = tx * cos + cx * sin + ax * dot * (1 - cos), ry = ty * cos + cy * sin + ay * dot * (1 - cos), rz = tz * cos + cz * sin + az * dot * (1 - cos)
      const q = rx * probe[3] + ry * probe[4] + rz * probe[5]
      rx -= q * probe[3]; ry -= q * probe[4]; rz -= q * probe[5]
      const L = Math.hypot(rx, ry, rz)
      if (!(L > 1e-6)) break
      tx = rx / L; ty = ry / L; tz = rz / L
      folds++
    }
    let dx = x - px, dy = y - py, dz = z - pz
    let d = Math.hypot(dx, dy, dz)
    if (!(d > 0.25 * length)) return false
    if (!folds && d < 0.97 * length) {
      // On a smooth curve the walk lands a little short: aim again along the chord, a full segment.
      if (!this.snap(px + (dx / d) * length, py + (dy / d) * length, pz + (dz / d) * length, s, 2 * length)) return false
      dx = s[0] - px; dy = s[1] - py; dz = s[2] - pz
      d = Math.hypot(dx, dy, dz)
      if (!(d > 0.25 * length)) return false
    } else this.snap(x, y, z, s, length)
    const landed = this.hit.faceIndex
    // On the underside the model stands on, or nearer the bed than the clearance.
    if (this.underside[landed] || this.byBed(landed, s[2], clear) || this.cramped(landed, s[0], s[1], s[2], s[3], s[4], s[5])) return false
    // Landed on another piece: it jumped the gap between them.
    if (this.faceRegion && this.faceRegion[landed] !== (region >= 0 ? region : this.region(px, py, pz))) return false
    if (s[3] * pnx + s[4] * pny + s[5] * pnz < STEP_TURN && folds === 0) return false
    if (clear > 0 && this.rimDistance(s[0], s[1], s[2], clear) < clear) return false
    out.set(s)
    return true
  }

  sees(_px: number, _py: number, _pz: number, pnx: number, pny: number, pnz: number,
    _ax: number, _ay: number, _az: number, anx: number, any: number, anz: number, _clear = 0): boolean {
    return pnx * anx + pny * any + pnz * anz >= SIGHT
  }

  joins(_px: number, _py: number, _pz: number, pnx: number, pny: number, pnz: number,
    ax: number, ay: number, az: number, anx: number, any: number, anz: number, clear: number): boolean {
    if (pnx * anx + pny * any + pnz * anz < JOIN) return false
    return !(clear > 0) || this.rimDistance(ax, ay, az, clear) >= clear
  }

  // A root for a click on the skin, snapped onto it, with its normal. Null when it is nearer a rim or the bed than the
  // clearance, or on the underside the model stands on.
  root(point: Vec3, clearance: number): { at: Vec3; normal: Vec3 } | null {
    const s = new Float64Array(6)
    if (!this.snap(point[0], point[1], point[2], s)) return null
    const f = this.hit.faceIndex
    if (this.underside[f] || this.byBed(f, s[2], clearance) || this.cramped(f, s[0], s[1], s[2], s[3], s[4], s[5])) return null
    if (clearance > 0 && this.rimDistance(s[0], s[1], s[2], clearance) < clearance) return null
    return { at: [s[0], s[1], s[2]], normal: [s[3], s[4], s[5]] }
  }

  // A root when nowhere better is known, such as on a model you opened: on an open sheet, the point farthest from its
  // rims along the surface; on a closed model, its top, so veins hang down over it. With several systems, each root is
  // chosen within its own slice across the model's longest side, so they start apart.
  autoRoot(system: number, systems: number, clearance: number): { at: Vec3; normal: Vec3 } | null {
    const P = this.positions
    const { lo, hi } = meshBounds(P)
    const span = [hi[0] - lo[0], hi[1] - lo[1]]
    const axis = span[0] >= span[1] ? 0 : 1
    const n = Math.max(1, systems), t = Math.max(0, Math.min(n - 1, system))
    const from = lo[axis] + (span[axis] * t) / n, to = lo[axis] + (span[axis] * (t + 1)) / n
    const score = this.open ? this.rimGeodesic() : null
    let best = -Infinity, at = -1
    for (let v = 0; v < P.length / 3; v++) {
      const i = v * 3
      if (P[i + axis] < from || P[i + axis] > to) continue
      const value = score ? score[v] + 1e-6 * P[i + 2] : P[i + 2]
      if (value > best) { best = value; at = i }
    }
    if (at < 0) return null
    return this.root([P[at], P[at + 1], P[at + 2]], clearance)
  }

  // Each vertex's distance from the nearest open rim, along the mesh's edges (Dijkstra from every rim vertex at once).
  private rimGeodesic(): Float64Array {
    const P = this.positions, I = this.indices, n = P.length / 3
    const start = new Uint32Array(n + 1)
    for (let i = 0; i < I.length; i++) start[I[i] + 1] += 2
    for (let v = 0; v < n; v++) start[v + 1] += start[v]
    const to = new Uint32Array(start[n]), fill = start.slice(0, n)
    for (let f = 0; f < I.length; f += 3) for (let j = 0; j < 3; j++) {
      const a = I[f + j], b = I[f + (j + 1) % 3], c = I[f + (j + 2) % 3]
      to[fill[a]++] = b; to[fill[a]++] = c
    }
    const dist = new Float64Array(n).fill(Infinity)
    // A binary heap of [distance, vertex].
    const heapD: number[] = [], heapV: number[] = []
    const push = (d: number, v: number) => {
      let i = heapD.length
      heapD.push(d); heapV.push(v)
      while (i > 0) { const p = (i - 1) >> 1; if (heapD[p] <= heapD[i]) break; [heapD[p], heapD[i]] = [heapD[i], heapD[p]]; [heapV[p], heapV[i]] = [heapV[i], heapV[p]]; i = p }
    }
    const pop = () => {
      const d = heapD[0], v = heapV[0], lastD = heapD.pop()!, lastV = heapV.pop()!
      if (heapD.length) {
        heapD[0] = lastD; heapV[0] = lastV
        let i = 0
        for (;;) {
          const l = 2 * i + 1, r = l + 1
          let m = i
          if (l < heapD.length && heapD[l] < heapD[m]) m = l
          if (r < heapD.length && heapD[r] < heapD[m]) m = r
          if (m === i) break
          ;[heapD[m], heapD[i]] = [heapD[i], heapD[m]]; [heapV[m], heapV[i]] = [heapV[i], heapV[m]]; i = m
        }
      }
      return [d, v]
    }
    for (const loop of this.rims) for (const v of loop) if (dist[v] > 0) { dist[v] = 0; push(0, v) }
    while (heapD.length) {
      const [d, v] = pop()
      if (d > dist[v]) continue
      for (let k = start[v]; k < start[v + 1]; k++) {
        const u = to[k]
        const nd = d + Math.hypot(P[u * 3] - P[v * 3], P[u * 3 + 1] - P[v * 3 + 1], P[u * 3 + 2] - P[v * 3 + 2])
        if (nd < dist[u]) { dist[u] = nd; push(nd, u) }
      }
    }
    return dist
  }

  // A closed model has no rim: roots round its top lip instead, `count` of them at even angles about the model's
  // upright axis, each on the outermost point near the top at its angle, so roots can grow down and round a pot.
  topRoots(count: number, clearance: number): { at: Vec3; normal: Vec3 }[] {
    const P = this.positions
    const { lo, hi } = meshBounds(P)
    const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2, top = hi[2] - 0.04 * (hi[2] - lo[2])
    const best = new Array<number>(count).fill(-1), reach = new Array<number>(count).fill(-Infinity)
    for (let i = 0; i < P.length; i += 3) {
      if (P[i + 2] < top) continue
      const a = Math.atan2(P[i + 1] - cy, P[i] - cx), r = Math.hypot(P[i] - cx, P[i + 1] - cy)
      const k = Math.floor((((a / (2 * Math.PI)) + 1) % 1) * count) % count
      if (r > reach[k]) { reach[k] = r; best[k] = i }
    }
    const out: { at: Vec3; normal: Vec3 }[] = []
    for (const i of best) {
      if (i < 0) continue
      const root = this.root([P[i], P[i + 1], P[i + 2]], clearance)
      if (root) out.push(root)
    }
    return out
  }

  // Roots spread evenly along the longest open rim, `count` of them, each moved onto the surface `inset` from the rim.
  rimRoots(count: number, inset: number): { at: Vec3; normal: Vec3 }[] {
    const loop = this.rims[0]
    if (!loop || count < 1) return []
    const P = this.positions
    const pts = loop.map(v => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]] as Vec3)
    const lengths = [0]
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length]
      lengths.push(lengths[k] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]))
    }
    const total = lengths[lengths.length - 1]
    const out: { at: Vec3; normal: Vec3 }[] = []
    const s = new Float64Array(6)
    for (let r = 0; r < count; r++) {
      const at = ((r + 0.5) / count) * total
      let k = 0
      while (k < pts.length - 1 && lengths[k + 1] < at) k++
      const a = pts[k], b = pts[(k + 1) % pts.length], t = (at - lengths[k]) / Math.max(1e-12, lengths[k + 1] - lengths[k])
      const p: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
      if (!this.snap(p[0], p[1], p[2], s)) continue
      // Inward across the surface: perpendicular to the rim and to the normal, toward the side the surface lies on.
      const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2]
      let ix = s[4] * ez - s[5] * ey, iy = s[5] * ex - s[3] * ez, iz = s[3] * ey - s[4] * ex
      const L = Math.hypot(ix, iy, iz) || 1
      ix /= L; iy /= L; iz /= L
      const d = Math.max(inset, 1e-3)
      const q = new Float64Array(6), q2 = new Float64Array(6)
      const okA = this.snap(p[0] + ix * d, p[1] + iy * d, p[2] + iz * d, q)
      const okB = this.snap(p[0] - ix * d, p[1] - iy * d, p[2] - iz * d, q2)
      // The side whose snap stays farther from the rim is the surface's side.
      const fa = okA ? this.rimDistance(q[0], q[1], q[2], 4 * d) : -1
      const fb = okB ? this.rimDistance(q2[0], q2[1], q2[2], 4 * d) : -1
      const pick = (fa === Infinity ? 1e9 : fa) >= (fb === Infinity ? 1e9 : fb) ? q : q2
      if (!okA && !okB) continue
      if (this.onUnderside(pick[0], pick[1], pick[2])) continue
      out.push({ at: [pick[0], pick[1], pick[2]], normal: [pick[3], pick[4], pick[5]] })
    }
    return out
  }
}

// Each piece of the model: whether it counts as closed (its open edges add up to less than SMALL_HOLES of the square root
// of its area), and which way its triangles face (+1 out, -1 in), by its signed volume about its own middle.
function pieceShapes(P: Float32Array, I: Uint32Array, piece: Int32Array, count: number, faceArea: Float64Array, edges: ArrayLike<number>) {
  const area = new Float64Array(count), mx = new Float64Array(count), my = new Float64Array(count), mz = new Float64Array(count)
  const faces = I.length / 3
  for (let f = 0; f < faces; f++) {
    const k = piece[f], w = faceArea[f]
    const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3
    area[k] += w
    mx[k] += w * (P[a] + P[b] + P[c]) / 3; my[k] += w * (P[a + 1] + P[b + 1] + P[c + 1]) / 3; mz[k] += w * (P[a + 2] + P[b + 2] + P[c + 2]) / 3
  }
  const volume = new Float64Array(count)
  for (let f = 0; f < faces; f++) {
    const k = piece[f], w = area[k] || 1, ox = mx[k] / w, oy = my[k] / w, oz = mz[k] / w
    const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3
    const ax = P[a] - ox, ay = P[a + 1] - oy, az = P[a + 2] - oz, bx = P[b] - ox, by = P[b + 1] - oy, bz = P[b + 2] - oz
    const cx = P[c] - ox, cy = P[c + 1] - oy, cz = P[c + 2] - oz
    volume[k] += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  // Open edges, each counted for the piece of its first corner.
  const pieceOf = new Int32Array(P.length / 3)
  for (let f = 0; f < faces; f++) for (let j = 0; j < 3; j++) pieceOf[I[f * 3 + j]] = piece[f]
  const open = new Float64Array(count), openCount = new Int32Array(count)
  for (let e = 0; e + 1 < edges.length; e += 2) {
    const a = edges[e] * 3, b = edges[e + 1] * 3
    open[pieceOf[edges[e]]] += Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2])
    openCount[pieceOf[edges[e]]]++
  }
  const closed = new Uint8Array(count), out = new Float64Array(count)
  for (let k = 0; k < count; k++) {
    closed[k] = (open[k] < SMALL_HOLES * Math.sqrt(area[k]) || openCount[k] <= MISSING_EDGES) && volume[k] !== 0 ? 1 : 0
    out[k] = volume[k] < 0 ? -1 : 1
  }
  return { closed, out }
}

// Triangles on the underside a closed piece stands on: facing down or sideways (outward, whichever way the piece's
// triangles are wound), with less than `room` below them, down to the bed (the model's lowest point, `bottom`) or to
// another piece of the model straight below: a pot's bottom, and its side just above the floor of its saucer. The same
// piece below, as under a fold, doesn't count: a vein there only joins the model to itself.
function undersideFaces(P: Float32Array, I: Uint32Array, FN: Float64Array, bvh: MeshBVH, piece: Int32Array, shapes: { closed: Uint8Array; out: Float64Array },
  several: boolean, bottom: number, room: number): Uint8Array {
  const faces = I.length / 3, result = new Uint8Array(faces)
  const ray = new Ray(new Vector3(), new Vector3(0, 0, -1))
  for (let f = 0; f < faces; f++) {
    const k = piece[f]
    if (!shapes.closed[k] || !(FN[f * 3 + 2] * shapes.out[k] < HANGS)) continue
    const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3
    const cx = (P[a] + P[b] + P[c]) / 3, cy = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3
    if (cz - bottom < room) { result[f] = 1; continue }
    if (!several) continue
    ray.origin.set(cx, cy, cz)
    const hit = bvh.raycastFirst(ray, DoubleSide, 1e-4 * room, room)
    if (hit && hit.faceIndex !== undefined && hit.faceIndex !== null && piece[hit.faceIndex] !== k) result[f] = 1
  }
  return result
}

// Each triangle's piece of the model, by triangles that share corners, and how many pieces there are.
function facePieces(I: Uint32Array, vertices: number): { count: number; face: Int32Array } {
  const up = Int32Array.from({ length: vertices }, (_, i) => i)
  const find = (a: number): number => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a] } return a }
  const faces = I.length / 3
  for (let f = 0; f < faces; f++) { const a = find(I[f * 3]); up[find(I[f * 3 + 1])] = a; up[find(I[f * 3 + 2])] = a }
  const label = new Map<number, number>(), face = new Int32Array(faces)
  for (let f = 0; f < faces; f++) {
    const r = find(I[f * 3])
    let k = label.get(r)
    if (k === undefined) { k = label.size; label.set(r, k) }
    face[f] = k
  }
  return { count: Math.max(1, label.size), face }
}

export type SurfacePlacement = 'even' | 'random' | 'painted'
export type SurfaceScatter = { count: number; placement: SurfacePlacement; seed: number; clearance: number; density?: Float32Array | null }

const CANDIDATES = 12

// Where the attractors go on the skin: spread by area, so big triangles get more. Even uses Mitchell's best candidate
// (blue noise, exact count); Random is uniform; Painted follows a density painted on the model's vertices, 0–1. No
// attractor is nearer an open rim than the clearance. The same seed always gives the same points.
export function scatterSurface(dom: SurfaceDomain, o: SurfaceScatter): { p: Float64Array; n: Float64Array; short: boolean } {
  const want = Math.max(0, Math.floor(o.count))
  const P = dom.positions, I = dom.indices, faces = I.length / 3
  const painted = o.placement === 'painted' && o.density ? o.density : null
  // Each face's weight: its area, times its painted density.
  const cdf = new Float64Array(faces + 1)
  for (let f = 0; f < faces; f++) {
    // None on the underside the model stands on, which veins stay off.
    let w = dom.underside[f] ? 0 : dom.faceArea[f]
    if (painted) w *= Math.max(0, (painted[I[f * 3]] + painted[I[f * 3 + 1]] + painted[I[f * 3 + 2]]) / 3)
    cdf[f + 1] = cdf[f] + w
  }
  const total = cdf[faces]
  if (want === 0 || !(total > 0)) return { p: new Float64Array(0), n: new Float64Array(0), short: want > 0 }
  const rng = new Rng(o.seed)
  const clear = Math.max(0, o.clearance)
  // The spacing the attractors would have if spread evenly over the weighted area.
  const spacing = Math.sqrt(total / want)
  const reach = 1.5 * spacing
  const { lo, hi } = meshBounds(P)
  const cell = Math.max(reach, Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 400)
  const gx = Math.ceil((hi[0] - lo[0]) / cell) + 1, gy = Math.ceil((hi[1] - lo[1]) / cell) + 1, gz = Math.ceil((hi[2] - lo[2]) / cell) + 1
  const headOf = new Int32Array(gx * gy * gz).fill(-1)
  const next = new Int32Array(want)
  const out = new Float64Array(want * 3), normals = new Float64Array(want * 3)
  let placed = 0
  const cellIndex = (x: number, y: number, z: number) => {
    const i = Math.min(gx - 1, Math.max(0, Math.floor((x - lo[0]) / cell)))
    const j = Math.min(gy - 1, Math.max(0, Math.floor((y - lo[1]) / cell)))
    const k = Math.min(gz - 1, Math.max(0, Math.floor((z - lo[2]) / cell)))
    return [i, j, k]
  }
  const nearest = (x: number, y: number, z: number) => {
    let best = reach * reach
    const [ci, cj, ck] = cellIndex(x, y, z)
    for (let k = Math.max(0, ck - 1); k <= Math.min(gz - 1, ck + 1); k++)
      for (let j = Math.max(0, cj - 1); j <= Math.min(gy - 1, cj + 1); j++)
        for (let i = Math.max(0, ci - 1); i <= Math.min(gx - 1, ci + 1); i++)
          for (let p = headOf[i + gx * (j + gy * k)]; p >= 0; p = next[p]) {
            const dx = out[p * 3] - x, dy = out[p * 3 + 1] - y, dz = out[p * 3 + 2] - z, d2 = dx * dx + dy * dy + dz * dz
            if (d2 < best) best = d2
          }
    return Math.sqrt(best)
  }
  const N = dom.cornerNormals
  const sample = (): [number, number, number, number, number, number] | null => {
    for (let tries = 0; tries < 200; tries++) {
      // A face by weight, then a uniform point in it.
      const target = rng.next() * total
      let a = 0, b = faces
      while (a < b) { const m = (a + b) >> 1; if (cdf[m + 1] <= target) a = m + 1; else b = m }
      const f = Math.min(faces - 1, a)
      let u = rng.next(), w = rng.next()
      if (u + w > 1) { u = 1 - u; w = 1 - w }
      const A = I[f * 3] * 3, B = I[f * 3 + 1] * 3, C = I[f * 3 + 2] * 3
      const x = P[A] + (P[B] - P[A]) * u + (P[C] - P[A]) * w
      const y = P[A + 1] + (P[B + 1] - P[A + 1]) * u + (P[C + 1] - P[A + 1]) * w
      const z = P[A + 2] + (P[B + 2] - P[A + 2]) * u + (P[C + 2] - P[A + 2]) * w
      if (clear > 0 && dom.rimDistance(x, y, z, clear) < clear) continue
      const o9 = f * 9, w0 = 1 - u - w
      const nx = w0 * N[o9] + u * N[o9 + 3] + w * N[o9 + 6], ny = w0 * N[o9 + 1] + u * N[o9 + 4] + w * N[o9 + 7], nz = w0 * N[o9 + 2] + u * N[o9 + 5] + w * N[o9 + 8]
      const L = Math.hypot(nx, ny, nz) || 1
      if (dom.isByBed(f, z, clear) || dom.isCramped(f, x, y, z, nx / L, ny / L, nz / L)) continue
      return [x, y, z, nx / L, ny / L, nz / L]
    }
    return null
  }
  const k = o.placement === 'random' ? 1 : CANDIDATES
  for (let misses = 0; placed < want && misses < 60;) {
    let best: ReturnType<typeof sample> = null, score = -1
    for (let c = 0; c < k; c++) {
      const q = sample()
      if (!q) continue
      if (k === 1) { best = q; break }
      const s = nearest(q[0], q[1], q[2])
      if (s > score) { score = s; best = q }
    }
    if (!best) { misses++; continue }
    misses = 0
    out.set(best.slice(0, 3), placed * 3); normals.set(best.slice(3), placed * 3)
    const [i, j, kk] = cellIndex(best[0], best[1], best[2])
    const c = i + gx * (j + gy * kk)
    next[placed] = headOf[c]; headOf[c] = placed
    placed++
  }
  return { p: out.slice(0, placed * 3), n: normals.slice(0, placed * 3), short: placed < want }
}
