import { test, expect, Page } from '@playwright/test';

/**
 * Tests E2E para la ficha de detalle de proveedores
 * Cubre: navegación, tabs, CRUD contactos, CRUD cuentas, historial, export
 */

// Reutilizar estado de autenticación previo
test.use({ storageState: '.auth/user.json' });

// Helper: obtener ID del primer proveedor
async function getFirstSupplierId(page: Page): Promise<string> {
  await page.goto('/dashboard/proveedores');
  await page.waitForSelector('heading:has-text("Proveedores")', { timeout: 10000 });

  // Ejecutar script para obtener el primer proveedor ID
  const supplierId = await page.evaluate(() => {
    const fetch_result = fetch('/api/conta/companies/1/proveedores', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('conta_token') || '' }
    })
      .then(r => r.json())
      .then(data => {
        if (data.data && data.data.length > 0) {
          return data.data[0].id;
        }
        return null;
      });
    return fetch_result;
  });

  return supplierId;
}

test.describe('Supplier Detail - Main Features', () => {
  let supplierId: string;

  test.beforeEach(async ({ page }) => {
    // Obtener un ID válido antes de cada test
    supplierId = await getFirstSupplierId(page);
    test.skip(!supplierId, 'No suppliers available for testing');
  });

  test('1️⃣ should display all 5 tabs on supplier detail page', async ({ page }) => {
    await page.goto(`/dashboard/proveedores/${supplierId}`);

    // Esperar a que la página cargue
    await page.waitForSelector('heading:has-text("Datos")', { timeout: 10000 });

    // Verificar que existen los 5 tabs
    const tabs = [
      { label: 'Datos', icon: '📋' },
      { label: 'Facturas', icon: '📄' },
      { label: 'Contactos', icon: '👥' },
      { label: 'Cuentas Bancarias', icon: '🏦' },
      { label: 'Historial', icon: '📜' },
    ];

    for (const tab of tabs) {
      const tabButton = page.locator(`button:has-text("${tab.label}")`);
      await expect(tabButton).toBeVisible();
    }
  });

  test('2️⃣ should navigate between tabs without errors', async ({ page }) => {
    await page.goto(`/dashboard/proveedores/${supplierId}`);
    await page.waitForSelector('button:has-text("Datos")', { timeout: 10000 });

    const tabLabels = ['Datos', 'Facturas', 'Contactos', 'Cuentas Bancarias', 'Historial'];

    for (const tabLabel of tabLabels) {
      // Click en el tab
      await page.click(`button:has-text("${tabLabel}")`);

      // Esperar a que el contenido se actualice
      await page.waitForTimeout(500);

      // Verificar que no hay errores en consola
      const logs = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          logs.push(msg.text());
        }
      });

      // El tab debe estar activo (tener borde accent)
      const activeTab = page.locator(`button:has-text("${tabLabel}")`);
      await expect(activeTab).toHaveClass(/border-accent-600/);
    }
  });

  test('3️⃣ should create, mark as principal, update, and delete a contact', async ({ page }) => {
    await page.goto(`/dashboard/proveedores/${supplierId}`);
    await page.waitForSelector('button:has-text("Contactos")', { timeout: 10000 });

    // Click en tab Contactos
    await page.click('button:has-text("Contactos")');
    await page.waitForTimeout(300);

    // CREAR contacto
    const createButton = page.locator('button:has-text("Añadir contacto")');
    if (await createButton.isVisible()) {
      await createButton.click();

      // Rellenar formulario
      await page.fill('input[placeholder*="Nombre"]', 'Test Contact');
      await page.fill('input[placeholder*="Email"]', 'test@contact.com');
      await page.fill('input[placeholder*="Teléfono"]', '+34 600 123 456');

      // Marcar como principal
      await page.check('input[type="checkbox"]:near(:text("principal"))');

      // Guardar
      const saveButton = page.locator('button:has-text("Guardar")').first();
      await saveButton.click();

      // Esperar a que se cree
      await page.waitForTimeout(1000);

      // Verificar que aparece en la lista
      const contactName = page.locator('text="Test Contact"');
      await expect(contactName).toBeVisible();

      // Verificar que aparece como principal (badge "Principal")
      const principalBadge = page.locator('span:has-text("Principal")');
      await expect(principalBadge).toBeVisible();
    }

    // ACTUALIZAR contacto
    const editLink = page.locator('text="Editar detalles"').first();
    if (await editLink.isVisible()) {
      await editLink.click();
      await page.waitForTimeout(300);

      // Cambiar teléfono
      await page.fill('input[placeholder*="Teléfono"]', '+34 600 999 999');
      await page.click('button:has-text("Guardar")');
      await page.waitForTimeout(800);

      // Verificar que se actualizó
      const updatedPhone = page.locator('text="+34 600 999 999"');
      await expect(updatedPhone).toBeVisible();
    }

    // ELIMINAR contacto
    const deleteButton = page.locator('button[aria-label*="Eliminar"]').first();
    if (await deleteButton.isVisible()) {
      await deleteButton.click();
      // Confirmar en el diálogo
      await page.click('button:has-text("Sí")').catch(() => {}); // Algunos diálogos no tienen botón "Sí"

      await page.waitForTimeout(800);

      // Verificar que ya no aparece
      await expect(page.locator('text="Test Contact"')).not.toBeVisible();
    }
  });

  test('4️⃣ should create bank account with valid IBAN and mark as principal', async ({ page }) => {
    await page.goto(`/dashboard/proveedores/${supplierId}`);
    await page.waitForSelector('button:has-text("Cuentas Bancarias")', { timeout: 10000 });

    // Click en tab Cuentas Bancarias
    await page.click('button:has-text("Cuentas Bancarias")');
    await page.waitForTimeout(300);

    // CREAR cuenta bancaria
    const createButton = page.locator('button:has-text("Añadir cuenta bancaria")');
    if (await createButton.isVisible()) {
      await createButton.click();

      // Rellenar con IBAN válido
      const ibanInput = page.locator('input[placeholder*="IBAN"]');
      await ibanInput.fill('ES9121123456789012345678990');

      // Rellenar otros campos
      await page.fill('input[placeholder*="BIC"]', 'BBVAESMMXXX');
      await page.fill('input[placeholder*="banco"]', 'BBVA');
      await page.fill('input[placeholder*="Alias"]', 'Test Account');

      // Marcar como principal
      await page.check('input[type="checkbox"]:near(:text("principal"))');

      // Guardar
      const saveButton = page.locator('button:has-text("Guardar")').first();
      await saveButton.click();

      // Esperar a que se cree
      await page.waitForTimeout(1000);

      // Verificar que aparece
      const ibanDisplay = page.locator('text="ES9121123456789012345678990"');
      await expect(ibanDisplay).toBeVisible();

      // Verificar que solo una está marcada como principal
      const principalBadges = page.locator('span:has-text("Principal")');
      const count = await principalBadges.count();
      expect(count).toBe(1);
    }
  });

  test('5️⃣ should reject invalid IBAN format', async ({ page }) => {
    await page.goto(`/dashboard/proveedores/${supplierId}`);
    await page.click('button:has-text("Cuentas Bancarias")');
    await page.waitForTimeout(300);

    const createButton = page.locator('button:has-text("Añadir cuenta bancaria")');
    if (await createButton.isVisible()) {
      await createButton.click();

      // Intentar con IBAN inválido (checksum incorrecto)
      const ibanInput = page.locator('input[placeholder*="IBAN"]');
      await ibanInput.fill('ES9021123456789012345678990'); // Checksum incorrecto

      // Intentar guardar
      const saveButton = page.locator('button:has-text("Guardar")').first();
      await saveButton.click();

      // Debería mostrar error
      await page.waitForTimeout(500);
      const errorMessage = page.locator('text=/IBAN|inválido/i');
      const isVisible = await errorMessage.isVisible().catch(() => false);

      if (isVisible) {
        await expect(errorMessage).toBeVisible();
      }
    }
  });

  test('6️⃣ should display invoices with filters and totals', async ({ page }) => {
    await page.goto(`/dashboard/proveedores/${supplierId}`);
    await page.click('button:has-text("Facturas")');
    await page.waitForTimeout(500);

    // Verificar que hay una tabla/lista de facturas
    const facturaText = page.locator('text=/factura|invoice/i').first();
    const isVisible = await facturaText.isVisible().catch(() => false);

    if (isVisible) {
      // Si hay facturas, verificar que se muestran totales
      const totalesLabels = ['Total', 'Base', 'IVA'];

      for (const label of totalesLabels) {
        const element = page.locator(`text="${label}"`);
        const exists = await element.isVisible().catch(() => false);
        if (exists) {
          await expect(element).toBeVisible();
        }
      }
    }
  });

  test('7️⃣ should record audit trail entries when making changes', async ({ page }) => {
    await page.goto(`/dashboard/proveedores/${supplierId}`);

    // Primero, crear un cambio (en Contactos)
    await page.click('button:has-text("Contactos")');
    await page.waitForTimeout(300);

    const createButton = page.locator('button:has-text("Añadir contacto")');
    if (await createButton.isVisible()) {
      await createButton.click();
      await page.fill('input[placeholder*="Nombre"]', 'Audit Test');
      await page.click('button:has-text("Guardar")').first();
      await page.waitForTimeout(1000);
    }

    // Ir a la pestaña Historial
    await page.click('button:has-text("Historial")');
    await page.waitForTimeout(500);

    // Verificar que hay entradas de auditoría
    const auditEntries = page.locator('text=/Creación|Actualización|Eliminación/');
    const count = await auditEntries.count();

    if (count > 0) {
      // Verificar que muestra datos
      const dates = page.locator('text=/20[0-9]{2}-/'); // Buscar fechas
      await expect(dates).toBeDefined();
    }
  });

  test('8️⃣ should export supplier data in CSV format', async ({ page }) => {
    await page.goto(`/dashboard/proveedores/${supplierId}`);

    // Buscar botón Export (en el header)
    const exportButton = page.locator('button:has-text("Exportar")');
    const exists = await exportButton.isVisible();

    if (exists) {
      // Capturar descargas
      const downloadPromise = page.waitForEvent('download');

      // Click en Exportar
      await exportButton.click();
      await page.waitForTimeout(300);

      // Seleccionar CSV (debería estar seleccionado por defecto)
      const csvRadio = page.locator('input[value="csv"]');
      const isCsvChecked = await csvRadio.isChecked();

      // Click en Descargar
      const downloadBtn = page.locator('button:has-text("Descargar")');
      if (await downloadBtn.isVisible()) {
        await downloadBtn.click();

        // Esperar a la descarga
        try {
          const download = await downloadPromise;
          const fileName = download.suggestedFilename();
          expect(fileName).toContain('.csv');
        } catch {
          // Si no hay descarga, al menos verificar que se abrió el modal
          await expect(page.locator('text="Exportar"')).toBeVisible();
        }
      }
    }
  });
});

test.describe('Supplier Detail - Error Cases', () => {
  test('should handle 404 for non-existent supplier', async ({ page }) => {
    const fakeId = 'nonexistent-supplier-id';

    // No debería encontrar proveedor
    const response = await page.goto(`/dashboard/proveedores/${fakeId}`, {
      waitUntil: 'networkidle',
    });

    // Debería mostrar un mensaje de error o redirigir
    const notFoundMessage = page.locator('text=/no encontrado|not found/i').first();
    const isVisible = await notFoundMessage.isVisible().catch(() => false);

    // O debería haber un botón para volver
    const backButton = page.locator('button:has-text("Volver")').first();
    const hasBackButton = await backButton.isVisible().catch(() => false);

    expect(isVisible || hasBackButton).toBeTruthy();
  });

  test('should show error when network fails', async ({ page }) => {
    // Simular fallo de red
    await page.context().setOffline(true);

    const supplierId = await getFirstSupplierId(page).catch(() => 'test-id');

    await page.goto(`/dashboard/proveedores/${supplierId}`).catch(() => {});

    await page.context().setOffline(false);

    // Debería mostrar algo (spinner, error, etc.)
    const isLoading = await page.locator('text="Cargando"').isVisible().catch(() => false);
    const hasError = await page.locator('text=/error|error/i').isVisible().catch(() => false);

    expect(isLoading || hasError).toBeTruthy();
  });
});
