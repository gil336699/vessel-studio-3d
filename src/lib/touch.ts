// A touch screen as the main pointer: help speaks of taps, not hovering and keys.
export const touchFirst = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches)
