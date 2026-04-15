import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const outDir = path.join(root, 'public', 'social')
const logoPath = path.join(root, 'public', 'brand', 'logo-mark.png')

await fs.mkdir(outDir, { recursive: true })

const logoBuffer = await fs.readFile(logoPath)
const logoBase64 = logoBuffer.toString('base64')

const variants = [
  {
    file: 'og-pt.png',
    width: 1200,
    height: 630,
    eyebrow: 'AUTOMACAO DE WHATSAPP COM IA',
    titleLines: ['Automatize seu atendimento', 'no WhatsApp com IA'],
    titleFontSize: 66,
    descriptionY: 404,
    description:
      'CRM, follow-up, agendamentos e repasse inteligente para humano.',
    chips: ['WhatsApp Business', 'CRM', 'Agendamentos'],
    locale: 'pt'
  },
  {
    file: 'og-en.png',
    width: 1200,
    height: 630,
    eyebrow: 'WHATSAPP AUTOMATION WITH AI',
    titleLines: ['Automate your WhatsApp', 'support with AI'],
    titleFontSize: 68,
    descriptionY: 404,
    description:
      'CRM, follow-ups, scheduling, and smart handoff to a human team.',
    chips: ['WhatsApp Business', 'CRM', 'Scheduling'],
    locale: 'en'
  },
  {
    file: 'twitter-pt.png',
    width: 1200,
    height: 600,
    eyebrow: 'AUTOMACAO DE WHATSAPP COM IA',
    titleLines: ['Automatize seu atendimento', 'no WhatsApp com IA'],
    titleFontSize: 62,
    descriptionY: 388,
    description:
      'CRM, follow-up, agendamentos e repasse inteligente para humano.',
    chips: ['WhatsApp Business', 'CRM', 'Agendamentos'],
    locale: 'pt'
  },
  {
    file: 'twitter-en.png',
    width: 1200,
    height: 600,
    eyebrow: 'WHATSAPP AUTOMATION WITH AI',
    titleLines: ['Automate your WhatsApp', 'support with AI'],
    titleFontSize: 64,
    descriptionY: 388,
    description:
      'CRM, follow-ups, scheduling, and smart handoff to a human team.',
    chips: ['WhatsApp Business', 'CRM', 'Scheduling'],
    locale: 'en'
  }
]

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

for (const variant of variants) {
  const chipY = variant.height - 92
  const lineOneY = 264
  const lineTwoY = lineOneY + variant.titleFontSize + 14
  const thirdChipWidth = variant.locale === 'pt' ? 196 : 170
  const thirdChipCenterX = variant.locale === 'pt' ? 552 : 539

  const svg = `
    <svg width="${variant.width}" height="${variant.height}" viewBox="0 0 ${variant.width} ${variant.height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#081117" />
          <stop offset="58%" stop-color="#0B1C1E" />
          <stop offset="100%" stop-color="#071614" />
        </linearGradient>
        <radialGradient id="glowA" cx="20%" cy="15%" r="70%">
          <stop offset="0%" stop-color="rgba(37,211,102,0.24)" />
          <stop offset="100%" stop-color="rgba(37,211,102,0)" />
        </radialGradient>
        <radialGradient id="glowB" cx="78%" cy="20%" r="55%">
          <stop offset="0%" stop-color="rgba(18,140,126,0.24)" />
          <stop offset="100%" stop-color="rgba(18,140,126,0)" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)" rx="32" />
      <rect width="100%" height="100%" fill="url(#glowA)" rx="32" />
      <rect width="100%" height="100%" fill="url(#glowB)" rx="32" />
      <rect x="44" y="44" width="${variant.width - 88}" height="${variant.height - 88}" rx="30" fill="none" stroke="rgba(255,255,255,0.08)" />

      <image href="data:image/png;base64,${logoBase64}" x="68" y="58" width="128" height="128" />
      <text x="220" y="104" fill="#FFFFFF" font-size="34" font-weight="800" font-family="Outfit, Arial, sans-serif">Auto<tspan fill="#25D366">Whats</tspan></text>
      <text x="220" y="142" fill="rgba(229,231,235,0.78)" font-size="18" font-weight="600" font-family="Outfit, Arial, sans-serif">${escapeXml(variant.eyebrow)}</text>

      <text x="72" y="${lineOneY}" fill="#FFFFFF" font-size="${variant.titleFontSize}" font-weight="900" font-family="Outfit, Arial, sans-serif">${escapeXml(variant.titleLines[0])}</text>
      <text x="72" y="${lineTwoY}" fill="#FFFFFF" font-size="${variant.titleFontSize}" font-weight="900" font-family="Outfit, Arial, sans-serif">${escapeXml(variant.titleLines[1])}</text>
      <text x="72" y="${variant.descriptionY}" fill="rgba(229,231,235,0.84)" font-size="31" font-weight="500" font-family="Outfit, Arial, sans-serif">${escapeXml(variant.description)}</text>

      <rect x="72" y="${chipY}" width="230" height="52" rx="26" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.12)" />
      <rect x="318" y="${chipY}" width="120" height="52" rx="26" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.12)" />
      <rect x="454" y="${chipY}" width="${thirdChipWidth}" height="52" rx="26" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.12)" />
      <text x="187" y="${chipY + 34}" text-anchor="middle" fill="#E5E7EB" font-size="22" font-weight="700" font-family="Outfit, Arial, sans-serif">${escapeXml(variant.chips[0])}</text>
      <text x="378" y="${chipY + 34}" text-anchor="middle" fill="#E5E7EB" font-size="22" font-weight="700" font-family="Outfit, Arial, sans-serif">${escapeXml(variant.chips[1])}</text>
      <text x="${thirdChipCenterX}" y="${chipY + 34}" text-anchor="middle" fill="#E5E7EB" font-size="22" font-weight="700" font-family="Outfit, Arial, sans-serif">${escapeXml(variant.chips[2])}</text>
    </svg>
  `

  await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, variant.file))
}

console.log(`generated ${variants.length} social images`)
