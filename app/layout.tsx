import type { Metadata } from 'next'
import Script from 'next/script'
import { Outfit } from 'next/font/google'
import './globals.css'
import { MetaPixelPageView } from '@/components/meta-pixel'
import { SITE_URL } from '@/lib/site-url'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit'
})

const GOOGLE_TAG_ID = 'G-1V8YB286LP'
const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()
const googleAdsTagId = process.env.NEXT_PUBLIC_GOOGLE_ADS_TAG_ID?.trim()
const googleAdsSignupSendTo = process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_SEND_TO?.trim()
const googleAdsInscricaoSendTo = process.env.NEXT_PUBLIC_GOOGLE_ADS_INSCRICAO_SEND_TO?.trim()

function extractAdsTagId(sendTo?: string): string | null {
  if (!sendTo) return null
  const [rawId] = sendTo.split('/')
  const normalizedId = rawId?.trim().toUpperCase()
  if (!normalizedId) return null
  return /^AW-\d+$/.test(normalizedId) ? normalizedId : null
}

const googleTagIds = Array.from(
  new Set(
    [
      GOOGLE_TAG_ID,
      gaMeasurementId,
      googleAdsTagId,
      extractAdsTagId(googleAdsSignupSendTo),
      extractAdsTagId(googleAdsInscricaoSendTo)
    ].filter((id): id is string => Boolean(id))
  )
)

const googleTagScriptId = googleTagIds[0]

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'AutoWhats',
  description: 'Automação de WhatsApp com IA para atendimento, CRM, follow-up e agendamentos.',
  keywords: ['WhatsApp', 'automação', 'IA', 'inteligência artificial', 'CRM', 'atendimento'],
  authors: [{ name: 'AutoWhats' }],
  openGraph: {
    title: 'AutoWhats',
    description: 'Automação de WhatsApp com IA para atendimento, CRM, follow-up e agendamentos.',
    type: 'website',
    locale: 'pt_BR',
    siteName: 'AutoWhats',
    images: [`${SITE_URL}/social/og-pt.png`]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AutoWhats',
    description: 'Automação de WhatsApp com IA para atendimento, CRM, follow-up e agendamentos.',
    images: [`${SITE_URL}/social/twitter-pt.png`]
  }
}

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={outfit.variable}>
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${googleTagScriptId}`}
          strategy="beforeInteractive"
        />
        <Script id="ga4-init" strategy="beforeInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
window.gtag = gtag;
var gaSearchParams = new URLSearchParams(window.location.search || '');
window.__gaDebugMode = gaSearchParams.has('ga_debug') && gaSearchParams.get('ga_debug') === '1';
gtag('js', new Date());
var googleTagIds = ${JSON.stringify(googleTagIds)};
googleTagIds.forEach(function (id) {
  if (window.__gaDebugMode) {
    gtag('config', id, { debug_mode: true });
  } else {
    gtag('config', id);
  }
});`}
        </Script>
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');

fbq('init', '1580669176458663');
if (window.__metaPixelQueue && window.__metaPixelQueue.length) {
  window.__metaPixelQueue.forEach(function (item) {
    if (item.options) {
      fbq(item.method, item.event, item.options);
    } else {
      fbq(item.method, item.event);
    }
  });
  window.__metaPixelQueue = [];
}`}
        </Script>
      </head>
      <body className="font-sans antialiased gradient-bg">
        {children}
        <MetaPixelPageView />
      </body>
    </html>
  )
}
