import { describe, expect, it } from 'vitest'
import { capOpenings, edgeProblems, openEdges, rimLoops, weld } from './mesh'
import { sphere, vase } from './models'
import { parseStl, readStlTriangles, StlError, writeStl } from './stl'

describe('STL', () => {
  it('reads back what it writes, welded into a closed mesh', () => {
    const ball = sphere(10, 2)
    const back = parseStl(writeStl(ball))
    expect(back.indices.length).toBe(ball.indices.length)
    expect(back.positions.length).toBe(ball.positions.length)
    expect(edgeProblems(back.indices)).toBe(0)
  })

  it('reads text STL', () => {
    const text = `solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n`
    const mesh = parseStl(new TextEncoder().encode(text).buffer as ArrayBuffer)
    expect(mesh.indices.length).toBe(3)
    expect(Array.from(mesh.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
  })

  it('refuses a file with no triangles, with a plain message', () => {
    expect(() => parseStl(new TextEncoder().encode('hello').buffer as ArrayBuffer)).toThrow(StlError)
  })

  it('welds corners shared by position and drops flat triangles', () => {
    const soup = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1]
    const mesh = weld(readStlTriangles(writeStl(weld(soup))))
    expect(mesh.positions.length / 3).toBe(4)
    expect(mesh.indices.length / 3).toBe(2)
  })

  it('finds an open vase’s mouth as one rim loop', () => {
    const v = vase()
    const loops = rimLoops(openEdges(v.indices), v.positions)
    expect(loops.length).toBe(1)
    expect(loops[0].length).toBe(120)
  })
})

describe('capOpenings', () => {
  it('closes an open vase into a watertight jar', () => {
    const v = vase()
    expect(edgeProblems(v.indices)).toBeGreaterThan(0)
    const { mesh, openings } = capOpenings(v)
    expect(openings).toBe(1)
    expect(edgeProblems(mesh.indices)).toBe(0)
  })
})
