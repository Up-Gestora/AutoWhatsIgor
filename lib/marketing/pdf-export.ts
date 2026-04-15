type ExportMarketingDeckPdfOptions = {
  rootElementId: string
  fileName: string
}

type ExportMarketingDeckJpegOptions = {
  rootElementId: string
  fileName: string
  quality?: number
}

type SlideSizePx = {
  widthPx: number
  heightPx: number
}

const PX_TO_MM = 25.4 / 96

function sanitizeFileName(input: string) {
  const normalized = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()

  return normalized || 'marketing-deck'
}

function parsePositiveNumber(raw: string | undefined) {
  if (!raw) {
    return null
  }

  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return Math.round(parsed)
}

function pxToMm(valuePx: number) {
  return Number((valuePx * PX_TO_MM).toFixed(3))
}

function resolveExportSlides(rootElementId: string) {
  const root = document.getElementById(rootElementId)
  if (!root) {
    throw new Error('export_root_missing')
  }

  const slides = Array.from(root.querySelectorAll<HTMLElement>('[data-marketing-export-slide="1"]'))
  if (slides.length === 0) {
    throw new Error('export_slides_missing')
  }

  return slides
}

function normalizeJpegQuality(rawQuality?: number) {
  if (typeof rawQuality !== 'number' || Number.isNaN(rawQuality)) {
    return 0.95
  }

  return Math.min(1, Math.max(0, rawQuality))
}

function triggerDownload(dataUrl: string, fileName: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = fileName
  anchor.click()
}

function resolveSlideSizePx(slide: HTMLElement): SlideSizePx {
  const attrWidthPx = parsePositiveNumber(slide.dataset.marketingExportWidth)
  const attrHeightPx = parsePositiveNumber(slide.dataset.marketingExportHeight)

  const measuredWidthPx = Math.round(slide.getBoundingClientRect().width) || slide.offsetWidth || slide.scrollWidth
  const measuredHeightPx = Math.round(slide.getBoundingClientRect().height) || slide.offsetHeight || slide.scrollHeight

  const widthPx = attrWidthPx ?? measuredWidthPx
  const heightPx = attrHeightPx ?? measuredHeightPx

  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0) {
    throw new Error('export_slide_size_invalid')
  }

  return { widthPx, heightPx }
}

export async function exportMarketingDeckPdf(options: ExportMarketingDeckPdfOptions) {
  const slides = resolveExportSlides(options.rootElementId)

  const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')])

  const firstSlideSize = resolveSlideSizePx(slides[0])
  const firstPageWidthMm = pxToMm(firstSlideSize.widthPx)
  const firstPageHeightMm = pxToMm(firstSlideSize.heightPx)

  const pdf = new jsPDF({
    orientation: firstSlideSize.widthPx >= firstSlideSize.heightPx ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [firstPageWidthMm, firstPageHeightMm],
    compress: true
  })

  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index]
    const slideSize = index === 0 ? firstSlideSize : resolveSlideSizePx(slide)
    const pageWidthMm = pxToMm(slideSize.widthPx)
    const pageHeightMm = pxToMm(slideSize.heightPx)

    const dataUrl = await toPng(slide, {
      cacheBust: true,
      pixelRatio: 2.2,
      skipAutoScale: true,
      backgroundColor: '#0f172a'
    })

    if (index > 0) {
      pdf.addPage([pageWidthMm, pageHeightMm], slideSize.widthPx >= slideSize.heightPx ? 'landscape' : 'portrait')
    }

    pdf.addImage(dataUrl, 'PNG', 0, 0, pageWidthMm, pageHeightMm, undefined, 'FAST')
  }

  pdf.save(`${sanitizeFileName(options.fileName)}.pdf`)
}

export async function exportMarketingDeckJpeg(options: ExportMarketingDeckJpegOptions) {
  const slides = resolveExportSlides(options.rootElementId)
  const { toJpeg } = await import('html-to-image')
  const quality = normalizeJpegQuality(options.quality)
  const baseFileName = sanitizeFileName(options.fileName)

  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index]
    const dataUrl = await toJpeg(slide, {
      cacheBust: true,
      pixelRatio: 2.2,
      skipAutoScale: true,
      backgroundColor: '#0f172a',
      quality
    })

    const fileName =
      slides.length === 1
        ? `${baseFileName}.jpeg`
        : `${baseFileName}-slide-${String(index + 1).padStart(2, '0')}.jpeg`

    triggerDownload(dataUrl, fileName)
  }
}
