import { HeaderV2 } from '@/components/marketing-v2/header-v2'
import { HomeHeroPt } from '@/components/marketing-v2/home-hero-pt'
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
import { JsonLd } from '@/components/seo/json-ld'
import { faqs } from '@/components/marketing-v2/faq-data'
import { createPublicMetadata } from '@/lib/seo/public-metadata'
import {
  createFaqJsonLd,
  createOrganizationJsonLd,
  createSoftwareApplicationJsonLd,
  createWebsiteJsonLd
} from '@/lib/seo/structured-data'

const HOME_TITLE = 'Automação de WhatsApp com IA para atendimento, CRM e agendamentos | AutoWhats'
const HOME_DESCRIPTION =
  'Automatize o atendimento no WhatsApp com IA treinada no seu negócio. Responda clientes, qualifique leads, faça follow-up e agende pelo WhatsApp em um só painel.'

export const metadata = createPublicMetadata({
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  path: '/pt',
  locale: 'pt-BR',
  type: 'website',
  includeLocaleAlternates: true,
  keywords: [
    'automação de WhatsApp com IA',
    'atendimento no WhatsApp com IA',
    'CRM para WhatsApp',
    'agendamento pelo WhatsApp',
    'follow-up no WhatsApp'
  ]
})

export default function PtHomePage() {
  return (
    <>
      <JsonLd data={createOrganizationJsonLd()} />
      <JsonLd data={createWebsiteJsonLd()} />
      <JsonLd data={createSoftwareApplicationJsonLd()} />
      <JsonLd data={createFaqJsonLd(faqs)} />

      <main lang="pt-BR" className="relative min-h-screen overflow-x-clip">
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
        <HomeHeroPt />
        <LeadCaptureV2 pagePath="/pt" />
        <ShowcaseV2 autoPlay autoPlayIntervalMs={6500} />
        <ComoFuncionaV2 />
        <CasosDeUsoV2 />
        <DepoimentosV2 />
        <PrecosV2 />
        <FaqV2 />
        <FinalCtaV2 signupHref="/pt/cadastro" loginHref="/pt/entrar" />
        <FooterV2 homeHref="/pt" loginHref="/pt/entrar" signupHref="/pt/cadastro" />
        <WhatsAppFloat />
      </main>
    </>
  )
}
