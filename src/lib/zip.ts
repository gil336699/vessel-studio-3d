// A small ZIP writer for 3MF files: entries are deflated where the browser can (CompressionStream), stored otherwise.
let table: Int32Array | null = null
export function crc32(data: Uint8Array): number {
  if (!table) { table = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c } }
  let c = -1
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch { return null }
}

export async function zip(files: { name: string; data: Uint8Array }[]): Promise<Blob> {
  const parts: BlobPart[] = [], central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = new TextEncoder().encode(f.name)
    const packed = await deflate(f.data)
    const method = packed && packed.length < f.data.length ? 8 : 0
    const body = method === 8 ? packed! : f.data
    const crc = crc32(f.data)
    const head = new DataView(new ArrayBuffer(30))
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0, true); head.setUint16(8, method, true)
    head.setUint32(14, crc, true); head.setUint32(18, body.length, true); head.setUint32(22, f.data.length, true); head.setUint16(26, name.length, true)
    parts.push(head.buffer, name as BlobPart, body as BlobPart)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(10, method, true)
    c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true)
    c.setUint32(42, offset, true)
    const entry = new Uint8Array(46 + name.length); entry.set(new Uint8Array(c.buffer)); entry.set(name, 46)
    central.push(entry)
    offset += 30 + name.length + body.length
  }
  const size = central.reduce((n, e) => n + e.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true)
  end.setUint32(12, size, true); end.setUint32(16, offset, true)
  return new Blob([...parts, ...central as BlobPart[], end.buffer], { type: 'model/3mf' })
}
