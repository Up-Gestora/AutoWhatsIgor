'use client'

import { useEffect, useState } from 'react'
import { HeaderV2 } from '@/components/marketing-v2/header-v2'
import { HeroV2 } from '@/components/marketing-v2/hero-v2'
import { LeadCaptureV2 } from '@/components/marketing-v2/lead-capture-v2'
import { ShowcaseV2 } from '@/components/marketing-v2/showcase-v2'
import { ComoFuncionaV2 } from '@/components/marketing-v2/como-funciona-v2'
import { CasosDeUsoV2 } from '@/components/marketing-v2/casos-de-uso-v2'
import { DepoimentosV2 } from '@/components/marketing-v2/depoimentos-v2'
import { PrecosV2 } from '@/components/marketing-v2/precos-v2'
import { FaqV2 } from '@/components/marketing-v2/faq-v2'
import { FinalCtaV2 } from '@/components/marketing-v2/final-cta-v2'
import { FooterV2 } from '@/components/marketing-v2/footer-v2'
import { WhatsAppFloat } from '@/components/whatsapp-float'
import { useI18n } from '@/lib/i18n/client'
import { LandingV2En } from '@/components/marketing-v2/landing-v2-en'
import {
  assignPaidAbVariant,
  captureAcquisitionAttributionFromCurrentLocation,
  getLandingExperimentKey,
  getPaidAbVariant,
  isPaidAttributionV1Enabled,
  isPaidCroAbEnabled
} from '@/lib/acquisition/attribution'

export function LandingV2Preview() {
  const { localePrefix } = useI18n()
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

  if (localePrefix === 'en') {
    return <LandingV2En variant="preview" />
  }

  return (
    <main className="relative min-h-screen overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.55]"
          style={{
            background:
              'radial-gradient(1200px 600px at 20% 10%, rgba(37,211,102,0.22), transparent 60%), radial-gradient(900px 500px at 80% 30%, rgba(7,94,84,0.18), transparent 55%), radial-gradient(900px 600px at 50% 90%, rgba(52,232,121,0.10), transparent 65%)'
          }}
        />
        <div className="absolute inset-0 opacity-[0.30] bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:56px_56px]" />
      </div>

      <HeaderV2 variant="preview" />
      <HeroV2 animatedDemo parallax copyVariant={heroVariant} />
      <LeadCaptureV2 />
      <ShowcaseV2 autoPlay autoPlayIntervalMs={6500} />
      <ComoFuncionaV2 />
      <CasosDeUsoV2 />
      <DepoimentosV2 />
      <PrecosV2 />
      <FaqV2 />
      <FinalCtaV2 />
      <FooterV2 />
      <WhatsAppFloat />
    </main>
  )
}
