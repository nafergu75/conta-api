/**
 * Teardown global: limpieza después de los tests
 */

async function globalTeardown() {
  // Aquí puedes añadir limpieza de base de datos, logs, etc.
  console.log('E2E tests completed');
}

export default globalTeardown;
