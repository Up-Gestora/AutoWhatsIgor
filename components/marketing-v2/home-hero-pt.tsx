'use client'

import { useEffect, useState } from 'react'
import { HeroV2 } from '@/components/marketing-v2/hero-v2'
import {
  assignPaidAbVariant,
  captureAcquisitionAttributionFromCurrentLocation,
  getLandingExperimentKey,
  getPaidAbVariant,
  isPaidAttributionV1Enabled,
  isPaidCroAbEnabled
} from '@/lib/acquisition/attribution'

export function HomeHeroPt() {
  const [heroVariant, setHeroVariant] = useState<'variant_a' | 'variant_b'>('variant_a')

  useEffect(() => {
    if (isPaidAttributionV1Enabled()) {
      captureAcquisitionAttributionFromCurrentLocation()
    }

    if (!isPaidCroAbEnabled()) {
      return
    }

    const experimentKey = getLandingExperimentKey()
    const variant = getPaidAbVariant(experimentKey) ?? assignPaidAbVariant(experimentKey)
    setHeroVariant(variant)
    captureAcquisitionAttributionFromCurrentLocation()
  }, [])

  return (
    <HeroV2
      animatedDemo
      parallax
      copyVariant={heroVariant}
      primaryCtaHref="/pt/cadastro"
      productHref="#produto"
    />
  )
}
