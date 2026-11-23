// A small seeded random number generator (mulberry32, as in Voronoi Studio), so the same seed always grows the
// same veins. Its whole state is one 32-bit number, which a project file saves, so a reopened design carries on
// with exactly the numbers an unbroken run would have drawn.
export class Rng {
  state: number

  constructor(seed: number, state?: number) {
    this.state = state !== undefined ? state >>> 0 : (Math.floor(seed) >>> 0) || 0x9e3779b9
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A fresh seed for "New pattern", kept to six digits so people can read and type it.
export function randomSeed(): number {
  return 1 + Math.floor(Math.random() * 999_999)
}
