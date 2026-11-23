import { describe, expect, it } from 'vitest'
import { edgeProblems, pieces, signedVolume } from './mesh'
import { readStlTriangles, writeStl } from './stl'
import { weld } from './mesh'
import { tubeSkin, tubeVoxel } from './tubes'
import { Rng } from '../veins/random'

// Segments [ax, ay, az, bx, by, bz, ra, rb] for a small random tree, grown by random walks from a root.
function randomTree(seed: number, points = 220) {
  const rng = new Rng(seed)
  const P: number[][] = [[0, 0, 0]], parent = [-1]
  for (let i = 1; i < points; i++) {
    const p = Math.floor(rng.next() * P.length)
    const q = P[p]
    P.push([q[0] + rng.next() * 2 - 1, q[1] + rng.next() * 2 - 1, q[2] + rng.next() * 2 - 1])
    parent.push(p)
  }
  const segs: number[] = []
  for (let v = 1; v < P.length; v++) { const a = P[parent[v]], b = P[v]; segs.push(...a, ...b, 0.22 + 0.1 * rng.next(), 0.18 + 0.1 * rng.next()) }
  return Float64Array.from(segs)
}

describe('tube skin', () => {
  it('is one watertight, outward-facing piece for a fork', () => {
    // A Y: a trunk and two branches.
    const segs = Float64Array.from([0, 0, 0, 0, 0, 5, 1, 0.8, 0, 0, 5, 3, 0, 9, 0.8, 0.5, 0, 0, 5, -3, 0, 9, 0.8, 0.5])
    const skin = tubeSkin(segs, { voxel: 0.2 })
    expect(skin.problems).toBe(0)
    expect(pieces(skin.mesh.indices, skin.mesh.positions.length / 3)).toBe(1)
    expect(signedVolume(skin.mesh.positions, skin.mesh.indices)).toBeGreaterThan(0)
  })

  it('stays watertight for tangled random trees, also after an STL reader welds it', () => {
    for (const seed of [1, 2, 3]) {
      const segs = randomTree(seed)
      const { voxel } = tubeVoxel(segs)
      const skin = tubeSkin(segs, { voxel })
      expect(skin.problems).toBe(0)
      expect(pieces(skin.mesh.indices, skin.mesh.positions.length / 3)).toBe(1)
      const reread = weld(readStlTriangles(writeStl(skin.mesh)))
      expect(edgeProblems(reread.indices)).toBe(0)
    }
  })

  it('makes the spacing fine enough for the tips, within the sample budget', () => {
    const segs = Float64Array.from([0, 0, 0, 0, 0, 10, 0.4, 0.4])
    expect(tubeVoxel(segs).voxel).toBeCloseTo(0.2, 6)
    expect(tubeVoxel(segs).tipLimited).toBe(false)
    const tight = tubeVoxel(segs, 2, 5_000)
    expect(tight.tipLimited).toBe(true)
  })
})
