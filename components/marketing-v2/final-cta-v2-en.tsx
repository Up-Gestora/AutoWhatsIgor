'use client'

import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { trackCustom } from '@/lib/metaPixel'
import { Reveal } from '@/components/marketing-v2/reveal'

export function FinalCtaV2({
  signupHref = '/en/signup',
  loginHref = '/en/login'
}: {
  signupHref?: string
  loginHref?: string
}) {
  const handlePrimary = () => {
    trackCustom('LandingV2_CTA_Primary_Click', { location: 'final_cta' })
  }

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <Reveal>
          <div className="max-w-5xl mx-auto rounded-[2.5rem] p-[1px] bg-[linear-gradient(110deg,rgba(37,211,102,0.65),rgba(255,255,255,0.10),rgba(10,143,127,0.65))] bg-[length:200%_200%] animate-shine motion-reduce:animate-none">
            <div className="rounded-[2.45rem] bg-surface/70 backdrop-blur-md border border-white/5 px-8 py-14 md:px-14 md:py-16 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-light/30 border border-white/10 mb-6">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm text-gray-300/90">Ready to start?</span>
              </div>

              <h2 className="text-3xl md:text-5xl font-bold">
                Put your AI to <span className="gradient-text">work today</span>
              </h2>
              <p className="text-gray-300/80 mt-4 max-w-2xl mx-auto leading-relaxed">
                Connect via QR, train with your business context, and stop losing customers due to slow replies.
              </p>

              <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
                <ButtonLink size="lg" href={signupHref} className="gap-2" onClick={handlePrimary}>
                  Free trial
                  <ArrowRight className="w-5 h-5" />
                </ButtonLink>
                <ButtonLink variant="ghost" size="lg" href={loginHref}>
                  Log in
                </ButtonLink>
              </div>

              <div className="mt-6 inline-flex items-center gap-2 text-sm text-gray-400">
                <ShieldCheck className="w-4 h-4 text-primary" />
                No commitment. Easy cancellation.
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
