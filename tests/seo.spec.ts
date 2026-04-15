import { expect, test } from '@playwright/test'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')

test('robots.txt exposes sitemap.xml', async ({ request }) => {
  const res = await request.get('/robots.txt')
  expect(res.ok()).toBeTruthy()

  const text = await res.text()
  expect(text).toMatch(/Sitemap:\s*.*\/sitemap\.xml/i)
})

test('sitemap.xml lists only public URLs', async ({ request }) => {
  const res = await request.get('/sitemap.xml')
  expect(res.ok()).toBeTruthy()

  const xml = await res.text()
  expect(xml).toContain(`${siteUrl}/`)
  expect(xml).not.toContain('/login')
  expect(xml).not.toContain('/v2')
  expect(xml).not.toContain('/dashboard')
  expect(xml).not.toContain('/admin')
})

test('/login is noindex', async ({ page }) => {
  await page.goto('/login')
  const robotsMeta = page.locator('meta[name="robots"]')
  await expect(robotsMeta).toHaveAttribute('content', /noindex/i)
})

test('/v2 is noindex and canonical points to /', async ({ page }) => {
  await page.goto('/v2')
  const robotsMeta = page.locator('meta[name="robots"]')
  await expect(robotsMeta).toHaveAttribute('content', /noindex/i)

  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
  expect(canonical).toBeTruthy()
  expect(canonical!.replace(/\/$/, '')).toBe(siteUrl)
})

test('/dashboard and /admin are noindex', async ({ request }) => {
  const dashboard = await request.get('/dashboard')
  expect(dashboard.ok()).toBeTruthy()
  const dashboardHtml = await dashboard.text()
  expect(dashboardHtml).toMatch(/<meta[^>]+name=\"robots\"[^>]+noindex/i)

  const admin = await request.get('/admin')
  expect(admin.ok()).toBeTruthy()
  const adminHtml = await admin.text()
  expect(adminHtml).toMatch(/<meta[^>]+name=\"robots\"[^>]+noindex/i)
})
