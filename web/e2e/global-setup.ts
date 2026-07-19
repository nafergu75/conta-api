import { chromium, FullConfig } from '@playwright/test';

/**
 * Setup global: login una sola vez y reutilizar la sesión en todos los tests
 */
async function globalSetup(config: FullConfig) {
  const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navegar al login
  await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' });

  // Rellenar y enviar formulario de login
  await page.fill('input[type="email"]', 'demo@empresa.com');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');

  // Esperar a que se redirija al dashboard
  await page.waitForURL(`${baseURL}/dashboard*`, { timeout: 30000 });

  // Guardar el estado de autenticación (cookies + localStorage)
  await context.storageState({ path: '.auth/user.json' });

  await browser.close();
}

export default globalSetup;
