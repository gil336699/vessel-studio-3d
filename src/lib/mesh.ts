// Triangle meshes as plain arrays, in millimetres and in the file's own axes (Z up, as in CAD apps and slicers).
// Free of three.js, so the engine, the worker and the tests share them.

export type MeshData = { positions: Float32Array<ArrayBuffer>; indices: Uint32Array<ArrayBuffer> }
export type Vec3 = [number, number, number]

export function meshBounds(P: ArrayLike<number>): { lo: Vec3; hi: Vec3 } {
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) {
    const v = P[i + a]
    if (v < lo[a]) lo[a] = v
    if (v > hi[a]) hi[a] = v
  }
  return { lo, hi }
}

// One vertex for each distinct position: STL files store every triangle's corners separately, and a mesh needs them
// shared to know which triangles are neighbours, where its open rims are and how its normals blend. Positions are
// compared exactly, as CAD apps write shared corners with the same numbers. Triangles that collapse to a line or a
// point are dropped.
export function weld(soup: ArrayLike<number>): MeshData {
  const n = Math.floor(soup.length / 3)
  // Positions as float32 bit patterns in an open-addressing hash table: one pass, fast for a million triangles.
  const bits = new Uint32Array(Float32Array.from(soup, v => (v === 0 ? 0 : v)).buffer)
  let size = 1
  while (size < n * 2) size <<= 1
  const table = new Int32Array(size).fill(-1)
  const remap = new Uint32Array(n)
  const unique = new Float32Array(n * 3)
  let count = 0
  for (let i = 0; i < n; i++) {
    const x = bits[i * 3], y = bits[i * 3 + 1], z = bits[i * 3 + 2]
    let h = (Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ Math.imul(z, 0xc2b2ae3d)) >>> 0
    for (;;) {
      h &= size - 1
      const at = table[h]
      if (at < 0) {
        table[h] = i; remap[i] = count
        unique[count * 3] = soup[i * 3]; unique[count * 3 + 1] = soup[i * 3 + 1]; unique[count * 3 + 2] = soup[i * 3 + 2]
        count++
        break
      }
      if (bits[at * 3] === x && bits[at * 3 + 1] === y && bits[at * 3 + 2] === z) { remap[i] = remap[at]; break }
      h++
    }
  }
  const indices = new Uint32Array(n - (n % 3))
  let m = 0
  for (let t = 0; t + 2 < n; t += 3) {
    const a = remap[t], b = remap[t + 1], c = remap[t + 2]
    if (a === b || b === c || a === c) continue
    indices[m++] = a; indices[m++] = b; indices[m++] = c
  }
  return { positions: unique.slice(0, count * 3), indices: indices.slice(0, m) }
}

// Area-weighted vertex normals, unit length; a vertex no triangle uses gets (0, 0, 1).
export function vertexNormals(mesh: MeshData): Float32Array<ArrayBuffer> {
  const { positions: P, indices: I } = mesh
  const N = new Float32Array(P.length)
  for (let f = 0; f < I.length; f += 3) {
    const a = I[f] * 3, b = I[f + 1] * 3, c = I[f + 2] * 3
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2]
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
    // The cross product's length is twice the area, so larger triangles count for more.
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    for (const v of [a, b, c]) { N[v] += nx; N[v + 1] += ny; N[v + 2] += nz }
  }
  for (let v = 0; v < N.length; v += 3) {
    const L = Math.hypot(N[v], N[v + 1], N[v + 2])
    if (L > 0) { N[v] /= L; N[v + 1] /= L; N[v + 2] /= L } else { N[v] = 0; N[v + 1] = 0; N[v + 2] = 1 }
  }
  return N
}

export function faceNormal(P: ArrayLike<number>, I: ArrayLike<number>, f: number, out: Float64Array | number[]) {
  const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3
  const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2]
  const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const L = Math.hypot(nx, ny, nz) || 1
  out[0] = nx / L; out[1] = ny / L; out[2] = nz / L
  return out
}

export function triangleArea(P: ArrayLike<number>, I: ArrayLike<number>, f: number) {
  const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3
  const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2]
  const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
}

export function meshArea(mesh: MeshData) {
  let area = 0
  for (let f = 0; f < mesh.indices.length / 3; f++) area += triangleArea(mesh.positions, mesh.indices, f)
  return area
}

// Each vertex's outgoing edges, in typed arrays: start[v] to start[v + 1] in `to`. Fast for millions of triangles,
// where a Map of edges would run out of room.
function outgoing(indices: ArrayLike<number>) {
  let n = 0
  for (let i = 0; i < indices.length; i++) n = Math.max(n, indices[i] + 1)
  const start = new Uint32Array(n + 1)
  for (let f = 0; f + 2 < indices.length; f += 3) for (let j = 0; j < 3; j++) start[indices[f + j] + 1]++
  for (let v = 0; v < n; v++) start[v + 1] += start[v]
  const to = new Uint32Array(start[n]), fill = start.slice(0, n)
  for (let f = 0; f + 2 < indices.length; f += 3) for (let j = 0; j < 3; j++) to[fill[indices[f + j]]++] = indices[f + (j + 1) % 3]
  // How many times a runs to b.
  const count = (a: number, b: number) => { let c = 0; for (let k = start[a]; k < start[a + 1]; k++) if (to[k] === b) c++; return c }
  return { n, start, to, count }
}

// Edges used by exactly one triangle: the open rims of a sheet, such as a vase's mouth. As vertex pairs, in the
// direction their triangle runs.
export function openEdges(indices: ArrayLike<number>): Uint32Array<ArrayBuffer> {
  const { n, start, to, count } = outgoing(indices)
  const out: number[] = []
  for (let a = 0; a < n; a++) for (let k = start[a]; k < start[a + 1]; k++) {
    const b = to[k]
    // Used once this way and never the other way (or twice the same way, by a flipped neighbour, which is still open).
    if (count(a, b) + count(b, a) === 1) out.push(a, b)
  }
  return Uint32Array.from(out)
}

// The open rims as closed loops of vertices, longest first. Edges that don't close a loop (a rim that touches itself)
// end their loop where it can't go on.
export function rimLoops(edges: ArrayLike<number>, positions: ArrayLike<number>): number[][] {
  const next = new Map<number, number[]>()
  for (let i = 0; i < edges.length; i += 2) {
    const list = next.get(edges[i])
    if (list) list.push(edges[i + 1]); else next.set(edges[i], [edges[i + 1]])
  }
  const used = new Set<string>()
  const loops: number[][] = []
  for (let i = 0; i < edges.length; i += 2) {
    const start = edges[i]
    if (used.has(`${start},${edges[i + 1]}`)) continue
    const loop = [start]
    let at = start
    for (let guard = 0; guard < edges.length; guard++) {
      const options = next.get(at) ?? []
      const to = options.find(b => !used.has(`${at},${b}`))
      if (to === undefined) break
      used.add(`${at},${to}`)
      if (to === start) break
      loop.push(to)
      at = to
    }
    loops.push(loop)
  }
  const length = (loop: number[]) => {
    let L = 0
    for (let k = 0; k < loop.length; k++) {
      const a = loop[k] * 3, b = loop[(k + 1) % loop.length] * 3
      L += Math.hypot(positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2])
    }
    return L
  }
  return loops.map(loop => ({ loop, L: length(loop) })).sort((p, q) => q.L - p.L).map(({ loop }) => loop)
}

// How the edges of a triangle mesh are used: a closed, consistently turned surface uses each edge exactly once in each
// direction, so open and badly turned edges both count as problems. Zero means watertight.
export function edgeProblems(indices: ArrayLike<number>) {
  const { n, start, to, count } = outgoing(indices)
  let problems = 0
  for (let a = 0; a < n; a++) for (let k = start[a]; k < start[a + 1]; k++) {
    const b = to[k]
    if (count(a, b) !== 1 || count(b, a) !== 1) problems++
  }
  return problems
}

// Volume enclosed by a closed mesh: positive when its triangles face outward.
export function signedVolume(P: ArrayLike<number>, I: ArrayLike<number>) {
  let volume = 0
  for (let f = 0; f < I.length; f += 3) {
    const a = I[f] * 3, b = I[f + 1] * 3, c = I[f + 2] * 3
    volume += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c])
      + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6
  }
  return volume
}

// Separate pieces: the number of groups of triangles that share edges.
export function pieces(indices: ArrayLike<number>, vertexCount: number) {
  const parent = new Int32Array(vertexCount)
  for (let i = 0; i < vertexCount; i++) parent[i] = i
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
  for (let f = 0; f < indices.length; f += 3) {
    const a = find(indices[f]), b = find(indices[f + 1]), c = find(indices[f + 2])
    parent[b] = a; parent[find(c)] = a
  }
  const roots = new Set<number>()
  for (let f = 0; f < indices.length; f += 3) roots.add(find(indices[f]))
  return roots.size
}
