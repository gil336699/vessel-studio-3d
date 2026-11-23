// Built-in models, made in code so the app needs no model files: closed shapes to grow inside, and open sheets (a vase,
// a pot) to grow across. Sizes are millimetres and Z is up. The sphere, kidney and lens are centred on the origin, so
// their roots go at known spots; the others stand on the floor (z = 0).
import type { MeshData } from './mesh'
import { surfaceNets, taubin, meshNeighbors, makeManifold, type Grid } from './voxel'

export type ModelId = 'sphere' | 'bean' | 'lens' | 'heart' | 'tree' | 'vase' | 'pot'

export type ModelInfo = { id: ModelId; label: string; tip: string; closed: boolean }

export const MODELS: ModelInfo[] = [
  { id: 'sphere', label: 'Sphere', tip: 'A ball 100 mm across, to grow inside or over.', closed: true },
  { id: 'bean', label: 'Kidney', tip: 'A kidney-like bean 115 mm long, with a dent where vessels enter.', closed: true },
  { id: 'lens', label: 'Lens', tip: 'A lens-shaped volume 100 mm long, for two systems that enter at opposite ends.', closed: true },
  { id: 'heart', label: 'Heart', tip: 'A simple heart shape 100 mm tall, for vessels over its surface.', closed: true },
  { id: 'tree', label: 'Tree', tip: 'A tree outline 140 mm tall: a crown on a trunk, to grow a tree up from the ground.', closed: true },
  { id: 'vase', label: 'Vase', tip: 'An open vase 150 mm tall, a single sheet, for lamp shades and vases.', closed: false },
  { id: 'pot', label: 'Pot', tip: 'An open plant pot 110 mm tall, for roots round a pot.', closed: false },
]

// An icosphere of unit radius, subdivided `level` times.
export function icosphere(level: number): MeshData {
  const t = (1 + Math.sqrt(5)) / 2
  let P: number[][] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
  let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
  P = P.map(p => { const L = Math.hypot(...p); return p.map(x => x / L) })
  for (let l = 0; l < level; l++) {
    const mid = new Map<number, number>()
    const m = (a: number, b: number) => {
      const key = a < b ? a * 1e6 + b : b * 1e6 + a
      let i = mid.get(key)
      if (i === undefined) {
        const p = [0, 1, 2].map(k => (P[a][k] + P[b][k]) / 2), L = Math.hypot(...p)
        i = P.length; P.push(p.map(x => x / L)); mid.set(key, i)
      }
      return i
    }
    const next: number[][] = []
    for (const [a, b, c] of F) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]) }
    F = next
  }
  return { positions: Float32Array.from(P.flat()), indices: Uint32Array.from(F.flat()) }
}

export function sphere(radius = 50, level = 5): MeshData {
  const s = icosphere(level)
  for (let i = 0; i < s.positions.length; i++) s.positions[i] *= radius
  return s
}

// A kidney-like bean, about 115 × 62 × 48 mm: an ellipsoid bent into an arc, with a dent (the hilum) in the middle of
// its inner side, at (0, 16, 0), facing +y.
export function bean(level = 5): MeshData {
  const s = icosphere(level)
  const P = s.positions
  const R = 75
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i] * 58, z = P[i + 2] * 24
    let y = P[i + 1] * 30
    const dent = 14 * Math.exp(-((x / 20) ** 2 + (z / 14) ** 2))
    if (y > 0) y -= dent * (y / 30) ** 1.2
    // Bend round a centre R away on +y, so the +y side becomes the inner, concave side.
    const theta = x / R, r = R - y
    P[i] = r * Math.sin(theta); P[i + 1] = R - r * Math.cos(theta); P[i + 2] = z
  }
  return s
}

// A lens: an ellipsoid, 100 × 44 × 40 mm, as the growth domain of Kinstlinger et al. 2020 (Fig. 3 and 6).
export function lens(a = 50, b = 22, c = 20, level = 5): MeshData {
  const s = icosphere(level)
  for (let i = 0; i < s.positions.length; i += 3) { s.positions[i] *= a; s.positions[i + 1] *= b; s.positions[i + 2] *= c }
  return s
}

// A closed surface from a signed function (negative inside) on a grid over the box lo–hi, by surface nets, lightly
// smoothed.
function implicit(f: (x: number, y: number, z: number) => number, lo: [number, number, number], hi: [number, number, number], v: number): MeshData {
  const pad = 2 * v
  const origin: [number, number, number] = [lo[0] - pad, lo[1] - pad, lo[2] - pad]
  const nx = Math.ceil((hi[0] - lo[0] + 2 * pad) / v) + 1, ny = Math.ceil((hi[1] - lo[1] + 2 * pad) / v) + 1, nz = Math.ceil((hi[2] - lo[2] + 2 * pad) / v) + 1
  const F = new Float32Array(nx * ny * nz)
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const edge = i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1
    F[i + nx * (j + ny * k)] = edge ? 1 : f(origin[0] + i * v, origin[1] + j * v, origin[2] + k * v)
  }
  const grid: Grid = { nx, ny, nz, origin, v }
  const mesh = makeManifold(surfaceNets(F, grid))
  mesh.positions = taubin(mesh.positions, meshNeighbors(mesh.indices, mesh.positions.length / 3), 8)
  return mesh
}

// A simple heart, about 100 mm tall, from Taubin's heart surface: lobes up, point down.
export function heart(v = 1.1): MeshData {
  const s = 42
  return implicit((x, y, z) => {
    const X = x / s, Y = y / s, Z = (z - 58) / s
    // (x² + 9/4 y² + z² − 1)³ − x² z³ − 9/80 y² z³
    const a = X * X + 2.25 * Y * Y + Z * Z - 1
    return a * a * a - X * X * Z ** 3 - 0.1125 * Y * Y * Z ** 3
  }, [-52, -36, 0], [52, 36, 115], v)
}

// A tree outline 140 mm tall: an egg-shaped crown on a trunk, blended into one closed shape, standing on the floor.
export function tree(v = 1.2): MeshData {
  const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - (h * h * k) / 4 }
  return implicit((x, y, z) => {
    const crown = Math.hypot(x / 50, y / 50, (z - 92) / 44) * 44 - 44
    const r = 9 - 0.04 * z + (z < 8 ? (8 - z) * 0.7 : 0)
    const trunk = Math.max(Math.hypot(x, y) - r, -z, z - 70)
    return smin(crown, trunk, 14)
  }, [-52, -52, 0], [52, 52, 138], v)
}

// A turned sheet: a profile r(t) for t from 0 (base) to 1 (mouth), `height` tall, with a closed base and an open mouth.
function turned(radius: (t: number) => number, height: number, around = 120, up = 110): MeshData {
  const P: number[] = [], I: number[] = []
  for (let j = 0; j <= up; j++) {
    const t = j / up, r = radius(t)
    for (let i = 0; i < around; i++) { const a = (i / around) * Math.PI * 2; P.push(r * Math.cos(a), r * Math.sin(a), t * height) }
  }
  for (let j = 0; j < up; j++) for (let i = 0; i < around; i++) {
    const a = j * around + i, b = j * around + (i + 1) % around, c = a + around, d = b + around
    I.push(a, b, d, a, d, c)
  }
  // The base: rings in to a centre point, facing down.
  const base0 = radius(0), rings = 12
  let prev = Array.from({ length: around }, (_, i) => i)
  for (let k = 1; k <= rings; k++) {
    if (k < rings) {
      const ring: number[] = []
      const r = base0 * (1 - k / rings)
      for (let i = 0; i < around; i++) { const a = (i / around) * Math.PI * 2; ring.push(P.length / 3); P.push(r * Math.cos(a), r * Math.sin(a), 0) }
      for (let i = 0; i < around; i++) { const a = prev[i], b = prev[(i + 1) % around], c = ring[i], d = ring[(i + 1) % around]; I.push(a, c, d, a, d, b) }
      prev = ring
    } else {
      const centre = P.length / 3; P.push(0, 0, 0)
      for (let i = 0; i < around; i++) I.push(prev[i], centre, prev[(i + 1) % around])
    }
  }
  return { positions: Float32Array.from(P), indices: Uint32Array.from(I) }
}

// An open vase, 150 mm tall: a round belly, a neck and a flared lip.
export function vase(): MeshData {
  return turned(t => 26 + 20 * Math.sin(Math.PI * Math.min(1, t * 1.25)) ** 1.3 - 6 * t + 400 * Math.max(0, t - 0.85) ** 2, 150)
}

// An open plant pot, 110 mm tall, widening to a rolled rim.
export function pot(): MeshData {
  return turned(t => 38 + 18 * t + (t > 0.9 ? 30 * (t - 0.9) : 0), 110, 120, 80)
}

// Moves a model so its lowest point is on the floor, z = 0.
function onFloor(mesh: MeshData): MeshData {
  let lowest = Infinity
  for (let i = 2; i < mesh.positions.length; i += 3) lowest = Math.min(lowest, mesh.positions[i])
  for (let i = 2; i < mesh.positions.length; i += 3) mesh.positions[i] -= lowest
  return mesh
}

export function buildModel(id: ModelId): MeshData {
  switch (id) {
    case 'sphere': return sphere()
    case 'bean': return bean()
    case 'lens': return lens()
    case 'heart': return onFloor(heart())
    case 'tree': return onFloor(tree())
    case 'vase': return vase()
    case 'pot': return pot()
  }
}
