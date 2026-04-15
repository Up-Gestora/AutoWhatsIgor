'use client'

import { useEffect } from 'react'
import {
  captureAcquisitionAttributionFromCurrentLocation,
  isPaidAttributionV1Enabled
} from '@/lib/acquisition/attribution'

export function MarketingAttributionBootstrap() {
  useEffect(() => {
    if (isPaidAttributionV1Enabled()) {
      captureAcquisitionAttributionFromCurrentLocation()
    }
  }, [])

  return null
}
