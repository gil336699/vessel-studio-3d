// A domain is where veins may grow: through the inside of a closed model, or across its surface. It says where a growth
// step lands and whether it is allowed, and whether a vein point can see an attractor. Everything else (pairing,
// headings, widths, loops, stopping) is the same for both and lives in the engine.
//
// Points come with a unit surface normal on the surface, and zeros inside, so the two domains share one signature.
// Numbers are passed one by one rather than as small arrays, because these run hundreds of thousands of times a step.
export interface Domain {
  readonly kind: 'inside' | 'surface'
  // The longest way across the model, mm, which bounds how long growth can go without using an attractor.
  readonly span: number
  // The model's middle, for the Pull toward the middle.
  readonly centre: readonly [number, number, number]
  // How much farther than an attractor's nearest vein point, in kill distances, the nearest one that sees it may be and
  // still be pulled. Infinity where veins can reach far parts of the model.
  readonly seeBeyond: number
  // Whether `sees` is quick (a few multiplications) rather than a march through the model.
  readonly quickSight: boolean
  // The model's separate pieces, which veins never cross between, and the piece a point is on, from 0. Missing means
  // one piece, as inside, where a vein can't leave the solid it grows in anyway.
  readonly regions?: number
  region?(x: number, y: number, z: number): number

  // One growth step from the vein point p (normal pn, on piece `region` when known) along the unit heading h, `length`
  // long, staying `clear` from the walls (inside) or the open rims (surface). On success it writes the new point and
  // its normal to out, as [x, y, z, nx, ny, nz], and returns true. It returns false when the step is refused.
  step(px: number, py: number, pz: number, pnx: number, pny: number, pnz: number,
    hx: number, hy: number, hz: number, length: number, clear: number, out: Float64Array, region?: number): boolean

  // Whether the vein point p may pull toward the attractor a. Inside: the straight line between them stays `clear`
  // inside the wall, so a vein is never pulled into a corner it can't grow past. On the surface: their normals don't
  // face apart, so veins never pair across a thin wall or a narrow gap.
  sees(px: number, py: number, pz: number, pnx: number, pny: number, pnz: number,
    ax: number, ay: number, az: number, anx: number, any: number, anz: number, clear: number): boolean

  // Loops: whether a straight join from the vein point p to the junction a keeps the domain's rules.
  joins(px: number, py: number, pz: number, pnx: number, pny: number, pnz: number,
    ax: number, ay: number, az: number, anx: number, any: number, anz: number, clear: number): boolean
}

// The attractors: positions, and unit surface normals on the surface (zeros inside), three numbers each. sys is the
// system each one feeds when two or three systems interweave; missing means all feed the first.
export type Attractors = { p: Float64Array; n: Float64Array | null; sys?: Uint8Array | null }
