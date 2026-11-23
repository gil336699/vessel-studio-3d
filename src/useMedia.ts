import { useCallback, useSyncExternalStore } from 'react'

// Whether a media query matches, kept up to date as the window changes size.
export function useMedia(query: string): boolean {
  const subscribe = useCallback((changed: () => void) => {
    const list = window.matchMedia(query)
    list.addEventListener('change', changed)
    return () => list.removeEventListener('change', changed)
  }, [query])
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}
