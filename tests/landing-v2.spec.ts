import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function assertLanding(page: Page, path: string) {
  await page.goto(path)

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /Automatize seu WhatsApp/i
    })
  ).toBeVisible()

  const cta = page.getByRole('link', { name: /Teste grátis/i }).first()
  await expect(cta).toHaveAttribute('href', '/login?mode=signup')

  await page.locator('#precos').scrollIntoViewIfNeeded()
  const precos = page.locator('#precos')
  await expect(precos).toBeVisible()
  await expect(precos.getByText('Teste Grátis', { exact: true })).toBeVisible()
  await expect(precos.getByText('Pro', { exact: true })).toBeVisible()
  await expect(precos.getByText('Enterprise', { exact: true })).toBeVisible()

  await page.locator('#faq').scrollIntoViewIfNeeded()
  const firstFaq = page.locator('details').filter({ hasText: 'A IA responde tudo sozinha?' }).first()
  await firstFaq.locator('summary').click()
  await expect(firstFaq.getByText(/Ela responde o que você ensinar/i)).toBeVisible()
}

async function assertNoHorizontalOverflowOnMobile(page: Page, path: string) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(path)

  // Give Next hydration a moment to settle before measuring layout.
  await page.waitForSelector('#precos')
  await page.waitForTimeout(250)

  const { scrollWidth, clientWidth } = await page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body

    return {
      scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
      clientWidth: doc.clientWidth
    }
  })

  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)
}

test('Landing (/) renders key sections and CTA', async ({ page }) => {
  await assertLanding(page, '/')
})

test('Landing preview (/v2) renders key sections and CTA', async ({ page }) => {
  await assertLanding(page, '/v2')
})

test('Landing preview (/v2) renders lead capture form', async ({ page }) => {
  await page.goto('/v2')

  const section = page.locator('#lead-capture')
  await expect(section).toBeVisible()
  await expect(section.getByLabel(/Seu nome/i)).toBeVisible()
  await expect(section.getByLabel(/WhatsApp/i)).toBeVisible()
})

test('Landing (/) renders lead capture form', async ({ page }) => {
  await page.goto('/')

  const section = page.locator('#lead-capture')
  await expect(section).toBeVisible()
  await expect(section.getByLabel(/Seu nome/i)).toBeVisible()
  await expect(section.getByLabel(/WhatsApp/i)).toBeVisible()
})

test('Landing (/) has no horizontal overflow on mobile viewport', async ({ page }) => {
  await assertNoHorizontalOverflowOnMobile(page, '/')
})

test('Landing preview (/v2) has no horizontal overflow on mobile viewport', async ({ page }) => {
  await assertNoHorizontalOverflowOnMobile(page, '/v2')
})

test.describe('Reduced motion', () => {
  test('Preview (/v2) does not autoplay tabs when reduced motion is enabled', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/v2')

    // Wait for hydration/DOM to settle (Next dev can re-render the tree right after navigation).
    await page.waitForSelector('#produto')
    await page.waitForTimeout(250)
    await page.locator('#produto').evaluate((el) => el.scrollIntoView({ block: 'center' }))

    const mediaMatches = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    await expect(mediaMatches).toBeTruthy()

    const firstTab = page.getByRole('tab', { name: 'Conexão por QR' })
    await expect(firstTab).toHaveAttribute('aria-selected', 'true')

    // Wait longer than the autoplay interval; tab should not change when reduced motion is on.
    await page.waitForTimeout(7500)

    await expect(firstTab).toHaveAttribute('aria-selected', 'true')
  })
})
