// STL in and out, binary and text, in millimetres and the file's own axes. Reading welds shared corners, so the
// engine knows which triangles are neighbours and where a sheet's open rims are. Adapted from Growth Studio's
// stl.ts and meshExport.ts, without three.js, so it runs in the worker and the tests.
import { weld, type MeshData } from './mesh'

export class StlError extends Error {}

// Above this, preparing a model can lock up a browser tab for a long time.
export const MAX_TRIANGLES = 1_500_000

// Triangle count from the file size and header, without parsing: exact for binary STL, estimated for text.
export function stlTriangleCount(buffer: ArrayBuffer) {
  if (buffer.byteLength >= 84) {
    const count = new DataView(buffer).getUint32(80, true)
    if (84 + count * 50 === buffer.byteLength) return count
  }
  return Math.round(buffer.byteLength / 250)
}

function isBinary(buffer: ArrayBuffer) {
  if (buffer.byteLength < 84) return false
  const count = new DataView(buffer).getUint32(80, true)
  if (84 + count * 50 === buffer.byteLength) return true
  // A text STL starts with "solid" and holds "facet"; some binary files also start with "solid" in their header.
  const head = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 512)))
  return !(/^\s*solid/i.test(head) && /facet/i.test(head))
}

// Every triangle's three corners, nine numbers a triangle.
export function readStlTriangles(buffer: ArrayBuffer): Float32Array<ArrayBuffer> {
  if (isBinary(buffer)) {
    const view = new DataView(buffer)
    const count = view.getUint32(80, true)
    if (84 + count * 50 > buffer.byteLength) throw new StlError('This STL file is cut short: it holds fewer triangles than its header says.')
    const out = new Float32Array(count * 9)
    for (let t = 0; t < count; t++) {
      const o = 84 + t * 50 + 12
      for (let k = 0; k < 9; k++) out[t * 9 + k] = view.getFloat32(o + k * 4, true)
    }
    return out
  }
  const text = new TextDecoder().decode(new Uint8Array(buffer))
  const values: number[] = []
  // Every corner line, in any case, read as three numbers. A corner that isn't three plain numbers (nan, 1,5) stops
  // the reading, rather than shifting every later corner into the wrong triangle.
  const pattern = /^\s*vertex\s+(\S+)\s+(\S+)\s+(\S+)/gim
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const xyz = [Number(match[1]), Number(match[2]), Number(match[3])]
    if (!xyz.every(Number.isFinite)) throw new StlError('This STL has a corner that isn’t three plain numbers, so it can’t be read.')
    values.push(...xyz)
  }
  if (values.length % 9) throw new StlError('This STL has a triangle with fewer than three corners, so it can’t be read.')
  return Float32Array.from(values)
}

export function parseStl(buffer: ArrayBuffer): MeshData {
  const triangles = stlTriangleCount(buffer)
  if (triangles > MAX_TRIANGLES) throw new StlError(`This STL has about ${triangles.toLocaleString('en-US')} triangles. The limit is ${MAX_TRIANGLES.toLocaleString('en-US')}: simplify it in your CAD or mesh app first.`)
  const soup = readStlTriangles(buffer)
  if (soup.length < 9) throw new StlError('This file holds no triangles. Is it an STL?')
  for (let i = 0; i < soup.length; i++) if (!Number.isFinite(soup[i])) throw new StlError('This STL has corners with invalid numbers.')
  const mesh = weld(soup)
  if (mesh.indices.length < 3) throw new StlError('Every triangle in this STL is flat as a line. Nothing to grow on.')
  return mesh
}

// Binary STL, with a normal for each triangle worked out from its corners.
export function writeStl(mesh: MeshData, name = 'Vessel Studio 3D'): ArrayBuffer {
  const { positions: P, indices: I } = mesh
  const count = Math.floor(I.length / 3)
  const buffer = new ArrayBuffer(84 + count * 50)
  new Uint8Array(buffer).set(new TextEncoder().encode(name.slice(0, 80)), 0)
  const view = new DataView(buffer)
  view.setUint32(80, count, true)
  let o = 84
  for (let t = 0; t < count; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2]
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const L = Math.hypot(nx, ny, nz) || 1
    nx /= L; ny /= L; nz /= L
    for (const value of [nx, ny, nz]) { view.setFloat32(o, value, true); o += 4 }
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) { view.setFloat32(o, P[v + k], true); o += 4 }
    view.setUint16(o, 0, true)
    o += 2
  }
  return buffer
}
