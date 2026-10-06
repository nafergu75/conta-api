export interface NavSubItem {
  label: string;
  slug: string;
  description: string;
}

export interface NavItem {
  label: string;
  slug: string;
  description: string;
  implemented: boolean;
  endpoints: string[];
  requiredRoles?: string[]; // Codigos de PERMISO (no nombres de rol); sin especificar, accesible a todos
  subItems?: NavSubItem[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Panel',
    items: [
      {
        label: 'Resumen',
        slug: '',
        description: 'KPIs, evolución mensual y últimos movimientos.',
        implemented: true,
        endpoints: [],
      },
    ],
  },
  {
    title: 'Ventas',
    items: [
      {
        label: 'Clientes',
        slug: 'clientes',
        description: 'Alta, edición y búsqueda de clientes de la empresa.',
        implemented: true,
        endpoints: [
          'GET /companies/:id/clientes',
          'POST /companies/:id/clientes',
          'PUT /companies/:id/clientes/:id',
        ],
      },
      {
        label: 'Facturas de ingreso',
        slug: 'facturas',
        description:
          'Emisión de facturas, rectificativas, envío por email y recurrencias.',
        implemented: true,
        endpoints: [
          'GET /companies/:id/income-invoices',
          'POST /companies/:id/income-invoices',
          'POST /companies/:id/income-invoices/:id/credit-note',
          'POST /companies/:id/income-invoices/:id/send-email',
          'POST /companies/:id/income-invoices/:id/make-recurring',
        ],
      },
      {
        label: 'Lector de facturas (OCR)',
        slug: 'lector',
        description:
          'Lee facturas en PDF o imagen con visión de Claude y las convierte en datos contables. Integrado con bandeja OCR.',
        implemented: true,
        endpoints: ['POST /companies/:id/income-reader', 'GET /companies/:id/ocr/sessions/:id'],
      },
    ],
  },
  {
    title: 'Compras',
    items: [
      {
        label: 'Proveedores',
        slug: 'proveedores',
        description: 'Gestión de proveedores y sus datos fiscales.',
        implemented: true,
        endpoints: [
          'GET /companies/:id/proveedores',
          'POST /companies/:id/proveedores',
          'PUT /companies/:id/proveedores/:id',
        ],
      },
      {
        label: 'Bandeja OCR',
        slug: 'ocr',
        description: 'Procesa facturas escaneadas con OCR e iLovePDF automáticamente.',
        implemented: true,
        endpoints: [
          'POST /companies/:id/ocr/invoices',
          'GET /companies/:id/ocr/sessions',
          'GET /companies/:id/ocr/sessions/:id',
          'GET /companies/:id/ocr/status',
        ],
      },
      {
        label: 'Analytics OCR',
        slug: 'ocr/analytics',
        description: 'Estadísticas y métricas del procesamiento de facturas con OCR.',
        implemented: true,
        endpoints: [
          'GET /companies/:id/ocr/analytics/kpis',
          'GET /companies/:id/ocr/analytics/timeline',
          'GET /companies/:id/ocr/analytics/distribution',
        ],
      },
      {
        label: 'Compras',
        slug: 'compras',
        description: 'Facturas recibidas y gastos de proveedor.',
        implemented: false,
        endpoints: ['GET /companies/:id/compras', 'POST /companies/:id/compras'],
      },
    ],
  },
  {
    title: 'Contabilidad',
    items: [
      {
        label: 'Movimientos',
        slug: 'movimientos',
        description: 'Ingresos y gastos con estados y estadísticas.',
        implemented: true,
        endpoints: [
          'GET /companies/:id/movements',
          'POST /companies/:id/movements',
          'GET /companies/:id/movements/stats/summary',
          'GET /companies/:id/movements/stats/by-month',
          'GET /companies/:id/movements/stats/by-category',
        ],
      },
      {
        label: 'Plan contable',
        slug: 'plan-contable',
        description: 'Cuentas y subcuentas del PGC de la empresa.',
        implemented: false,
        endpoints: [
          'GET /companies/:id/plan-contable/cuentas',
          'GET /companies/:id/plan-contable/subcuentas',
        ],
      },
      {
        label: 'Motor contable',
        slug: 'motor-contable',
        description:
          'Generación automática de asientos a partir de documentos.',
        implemented: true,
        endpoints: [
          'POST /companies/:id/accounting/contabilizar/:invoiceId',
          'GET /companies/:id/accounting/journal-entries',
          'GET /companies/:id/accounting/journal-entries/:id',
          'POST /companies/:id/accounting/journal-entries/:id/approve',
        ],
        requiredRoles: ['contabilidad:read', 'contabilidad:write'],
      },
      {
        label: 'Cierre contable',
        slug: 'cierre-contable',
        description: 'Cierre de ejercicio y apertura del siguiente.',
        implemented: true,
        endpoints: [
          'POST /companies/:id/accounting/closures/generar-asiento',
          'GET /companies/:id/accounting/closures',
        ],
        requiredRoles: ['contabilidad:write'],
      },
    ],
  },
  {
    title: 'Tesorería',
    items: [
      {
        label: 'Resumen',
        slug: 'tesoreria',
        description: 'Visión general de la posición de tesorería.',
        implemented: true,
        endpoints: ['GET /companies/:id/treasury/bank-accounts'],
        requiredRoles: ['tesoreria:read', 'tesoreria:write'],
      },
      {
        label: 'Cuentas bancarias',
        slug: 'tesoreria/cuentas',
        description: 'Gestión de cuentas bancarias de la empresa.',
        implemented: true,
        endpoints: [
          'GET /companies/:id/treasury/bank-accounts',
          'POST /companies/:id/treasury/bank-accounts',
          'GET /companies/:id/treasury/bank-accounts/:accountId',
        ],
        requiredRoles: ['tesoreria:read', 'tesoreria:write'],
      },
      {
        label: 'Extractos',
        slug: 'tesoreria/extractos',
        description: 'Importación de extractos bancarios (CSV, OFX).',
        implemented: true,
        endpoints: [
          'POST /companies/:id/treasury/bank-accounts/:accountId/statements',
          'GET /companies/:id/treasury/bank-accounts/:accountId/movements',
        ],
        requiredRoles: ['tesoreria:read', 'tesoreria:write'],
      },
      {
        label: 'Conciliación',
        slug: 'tesoreria/conciliacion',
        description: 'Cruce de movimientos bancarios con facturas y asientos.',
        implemented: true,
        endpoints: [
          'GET /companies/:id/treasury/bank-accounts/:accountId/movements',
          'POST /companies/:id/treasury/movements/:movementId/reconcile',
          'DELETE /companies/:id/treasury/movements/:movementId/reconcile',
        ],
        requiredRoles: ['tesoreria:read', 'tesoreria:write'],
      },
    ],
  },
  {
    title: 'Fiscalidad',
    items: [
      {
        label: 'Modelos Fiscales',
        slug: 'fiscal',
        description: 'Gestión centralizada de declaraciones fiscales (IVA, Retenciones, IS).',
        implemented: true,
        endpoints: [
          'GET /companies/:id/tax-models',
          'GET /companies/:id/tax-models/303',
          'GET /companies/:id/tax-models/111',
          'GET /companies/:id/tax-models/200',
          'GET /companies/:id/tax-models/347',
          'GET /companies/:id/tax-models/115',
          'POST /companies/:id/tax-models/:codigo/presentado',
        ],
        requiredRoles: ['impuestos:read', 'impuestos:write'],
        subItems: [
          {
            label: 'Estado Fiscal',
            slug: 'fiscal/estado',
            description: 'Visión global de modelos y próximos vencimientos',
          },
          {
            label: 'Modelo 303 - IVA',
            slug: 'fiscal/modelo-303',
            description: 'IVA repercutido y soportado trimestral',
          },
          {
            label: 'Modelo 111 - Retenciones',
            slug: 'fiscal/modelo-111',
            description: 'Retenciones e ingresos a cuenta',
          },
          {
            label: 'Modelo 200 - Impuesto de Sociedades',
            slug: 'fiscal/modelo-200',
            description: 'Impuesto sobre Sociedades anual',
          },
          {
            label: 'Modelo 347 - Operaciones con Terceros',
            slug: 'fiscal/modelo-347',
            description: 'Declaración de terceros (>3.000€)',
          },
          {
            label: 'Modelo 115 - Arrendamientos',
            slug: 'fiscal/modelo-115',
            description: 'Retenciones IRPF sobre arrendamientos',
          },
          {
            label: 'Modelo 390 - Resumen Anual IVA',
            slug: 'fiscal/modelo-390',
            description: 'Consolidación anual de trimestres (303)',
          },
          {
            label: 'Modelo 190 - Resumen Anual Retenciones',
            slug: 'fiscal/modelo-190',
            description: 'Consolidación anual de trimestres (111)',
          },
        ],
      },
      {
        label: 'Registro Mercantil',
        slug: 'registro-mercantil',
        description: 'Libros oficiales y cuentas anuales para depósito.',
        implemented: true,
        endpoints: [
          'GET /companies/:id/fiscal-years',
          'POST /fiscal-years/:fyId/close',
          'POST /fiscal-years/:fyId/books/generate',
          'POST /fiscal-years/:fyId/legalization-package',
          'POST /fiscal-years/:fyId/annual-accounts/generate',
        ],
        requiredRoles: ['contabilidad:read', 'contabilidad:write'],
      },
    ],
  },
  {
    title: 'Más',
    items: [
      {
        label: 'Nóminas',
        slug: 'nominas',
        description: 'Registro contable de nóminas y seguros sociales.',
        implemented: false,
        endpoints: ['GET /companies/:id/nominas', 'POST /companies/:id/nominas'],
      },
      {
        label: 'Informes',
        slug: 'informes',
        description: 'Balance, PyG, mayor, sumas y saldos.',
        implemented: true,
        endpoints: [
          'GET /companies/:id/reports/balance',
          'GET /companies/:id/reports/profit-and-loss',
          'GET /companies/:id/reports/income',
          'GET /companies/:id/reports/expenses',
        ],
        requiredRoles: ['contabilidad:read'],
        // reportes/* (ratios, P&L comparativo, IVA vs AEAT) son prototipos con
        // cifras escritas en el codigo, sin llamada a la API: fuera del menu
        // hasta que tengan datos reales. Las paginas avisan de ello.
        subItems: [
          {
            label: 'Balance general',
            slug: 'informes/balance',
            description: 'Activo, pasivo y patrimonio neto por rango de fechas.',
          },
          {
            label: 'Pérdidas y ganancias',
            slug: 'informes/pyg',
            description: 'Ingresos, gastos y resultado del periodo.',
          },
        ],
      },
      {
        label: 'Asistente Carmen',
        slug: 'carmen',
        description: 'Chat contable con IA sobre los datos de tu empresa.',
        implemented: false,
        endpoints: ['POST /companies/:id/chat-assistant'],
      },
      {
        label: 'Archivo',
        slug: 'archivo',
        description: 'Gestión centralizada de documentos y archivos de la empresa.',
        implemented: true,
        endpoints: ['GET /companies/:id/archivo', 'POST /companies/:id/archivo'],
      },
      {
        label: 'Configuración',
        slug: 'configuracion',
        description: 'Empresa, ejercicios fiscales, series y usuarios.',
        implemented: false,
        endpoints: [
          'GET /companies/:id/fiscal-years',
          'GET /companies/:id/series',
          'GET /users',
        ],
      },
    ],
  },
];

export function findNavItem(slug: string): NavItem | undefined {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => i.slug === slug);
    if (item) return item;
  }
  return undefined;
}
