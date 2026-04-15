import { expect, test } from '@playwright/test'

test('redirects legacy login URL using Accept-Language auto-detection', async ({ browser }) => {
  const context = await browser.newContext({
    extraHTTPHeaders: {
      'accept-language': 'en-US,en;q=0.9'
    }
  })
  const page = await context.newPage()

  await page.goto('/login')
  await page.waitForURL(/\/en\/login$/)
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()

  await context.close()
})

test('keeps locale preference in aw_locale cookie after refresh', async ({ page }) => {
  await page.goto('/en/login')
  await page.waitForURL(/\/en\/login$/)

  await page.goto('/login')
  await page.waitForURL(/\/en\/login$/)

  await page.reload()
  await page.waitForURL(/\/en\/login$/)
})

test('redirects localized legacy slug to canonical translated slug', async ({ page }) => {
  await page.goto('/en/entrar')
  await page.waitForURL(/\/en\/login$/)

  await page.goto('/pt/login')
  await page.waitForURL(/\/pt\/entrar$/)
})

test('redirects unauthenticated dashboard routes to localized auth route', async ({ page }) => {
  await page.goto('/pt/dashboard/tutoriais')
  await page.waitForURL(/\/pt\/entrar$/)
  await expect(page.getByText(/Acesse sua conta/i)).toBeVisible()

  await page.goto('/en/dashboard/tutorials')
  await page.waitForURL(/\/en\/login$/)
  await expect(page.getByText(/Access your account/i)).toBeVisible()
})

test('renders English home without Portuguese fallback copy', async ({ page }) => {
  await page.goto('/en')
  await page.waitForURL(/\/en$/)

  await expect(page.getByText(/Automate your WhatsApp support with/i).first()).toBeVisible()

  await expect(page.getByText(/How it works/i).first()).toBeVisible()
  await expect(page.getByText(/Como funciona/i)).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Free trial/i }).first()).toBeVisible()
})

test('keeps English login copy localized', async ({ page }) => {
  await page.goto('/en/login')
  await page.waitForURL(/\/en\/login$/)

  await expect(page.getByText(/Access your account/i)).toBeVisible()
  await expect(page.getByText(/Acesse sua conta/i)).toHaveCount(0)
})

test('renders English public updates without Portuguese fallback copy', async ({ page }) => {
  await page.goto('/en/updates')
  await page.waitForURL(/\/en\/updates$/)

  await expect(
    page.getByRole('heading', {
      name: /AutoWhats updates/i
    })
  ).toBeVisible()
  await expect(page.getByText(/Public changelog/i)).toBeVisible()
  await expect(page.getByText(/Changelog público/i)).toHaveCount(0)
  await expect(page.getByText(/Atualizações do AutoWhats/i)).toHaveCount(0)
})

test('renders English public guides and institutional pages localized', async ({ page }) => {
  await page.goto('/en/guides')
  await page.waitForURL(/\/en\/guides$/)

  await expect(
    page.getByRole('heading', {
      name: /Practical guides for automation, CRM, and WhatsApp support/i
    })
  ).toBeVisible()
  await expect(page.getByText(/Guias públicos/i)).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Read guide/i }).first()).toBeVisible()

  await page.goto('/en/about')
  await page.waitForURL(/\/en\/about$/)
  await expect(page.getByRole('heading', { name: /About AutoWhats/i }).first()).toBeVisible()
  await expect(page.getByText(/Sobre o AutoWhats/i)).toHaveCount(0)
})
