import { expect, test } from '@playwright/test'

test('Redirects to /login when visiting /dashboard/tutoriais without auth', async ({ page }) => {
  await page.goto('/dashboard/tutoriais')

  await page.waitForURL(/\/login/, { timeout: 20_000 })
  await expect(page.getByText(/Acesse sua conta/i)).toBeVisible()
})

