// Numbers as people read them: lengths in millimetres, long lengths in metres, counts with thousands separators.

// Trailing zeros are dropped so values stay short: "12.50" reads "12.5".
export function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text
}

// A length as text, such as "12.5 mm"; a tiny non-zero length reads "under 0.01 mm" instead of "0 mm".
export function mm(value: number, digits = 1): string {
  if (value > 0 && value < 10 ** -digits) return `under ${10 ** -digits} mm`
  return `${trimZeros(value.toFixed(digits))} mm`
}

// Long lengths such as the total vein length read better in metres.
export function long(valueMm: number): string {
  return valueMm >= 1000 ? `${(valueMm / 1000).toFixed(2)} m` : `${valueMm.toFixed(0)} mm`
}

export const count = (n: number) => Math.round(n).toLocaleString('en-US')

// "1 vein" or "3 veins".
export const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`

// A file size: "840 KB" or "12.4 MB".
export function bytes(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`
}
