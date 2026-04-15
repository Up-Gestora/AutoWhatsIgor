import { HeaderV2 } from '@/components/marketing-v2/header-v2'
import { HeroV2 as HeroV2En } from '@/components/marketing-v2/hero-v2-en'
import { LeadCaptureV2 as LeadCaptureV2En } from '@/components/marketing-v2/lead-capture-v2-en'
import { ShowcaseV2 as ShowcaseV2En } from '@/components/marketing-v2/showcase-v2-en'
import { ComoFuncionaV2 as ComoFuncionaV2En } from '@/components/marketing-v2/como-funciona-v2-en'
import { CasosDeUsoV2 as CasosDeUsoV2En } from '@/components/marketing-v2/casos-de-uso-v2-en'
import { DepoimentosV2 as DepoimentosV2En } from '@/components/marketing-v2/depoimentos-v2-en'
import { PrecosV2 as PrecosV2En } from '@/components/marketing-v2/precos-v2-en'
import { FaqV2 as FaqV2En } from '@/components/marketing-v2/faq-v2-en'
import { FinalCtaV2 as FinalCtaV2En } from '@/components/marketing-v2/final-cta-v2-en'
import { FooterV2 as FooterV2En } from '@/components/marketing-v2/footer-v2-en'
import { WhatsAppFloat } from '@/components/whatsapp-float'

type LandingV2EnProps = {
  variant?: 'stable' | 'preview'
}

export function LandingV2En({ variant = 'stable' }: LandingV2EnProps) {
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

      <HeaderV2 variant={variant} />
      <HeroV2En animatedDemo parallax />
      <LeadCaptureV2En pagePath="/en" />
      <ShowcaseV2En autoPlay autoPlayIntervalMs={6500} />
      <ComoFuncionaV2En />
      <CasosDeUsoV2En />
      <DepoimentosV2En />
      <PrecosV2En />
      <FaqV2En />
      <FinalCtaV2En />
      <FooterV2En />
      <WhatsAppFloat />
    </main>
  )
}
