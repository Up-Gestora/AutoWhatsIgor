'use client'

import { useMediaQuery } from './useMediaQuery'

export function useHoverCapable() {
  return useMediaQuery('(pointer:fine) and (hover:hover)')
}

