export interface NavItem {
  label: string;
  slug: string;
  description: string;
  implemented: boolean;
  endpoints: string[];
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
        implemented: false,
        endpoints: [
          'POST /companies/:id/accounting-engine/generate',
          'GET /companies/:id/accounting-engine/rules',
        ],
      },
      {
        label: 'Cierre contable',
        slug: 'cierre',
        description: 'Cierre de ejercicio y apertura del siguiente.',
        implemented: false,
        endpoints: [
          'POST /companies/:id/accounting-closure/close',
          'GET /companies/:id/accounting-closure/status',
        ],
      },
    ],
  },
  {
    title: 'Bancos',
    items: [
      {
        label: 'Extractos',
        slug: 'extractos',
        description: 'Importación de extractos bancarios (Norma 43, CSV).',
        implemented: false,
        endpoints: [
          'GET /companies/:id/extractos',
          'POST /companies/:id/extractos/import',
        ],
      },
      {
        label: 'Conciliación',
        slug: 'conciliacion',
        description: 'Cruce automático de apuntes bancarios con facturas.',
        implemented: false,
        endpoints: [
          'GET /companies/:id/conciliacion/pendientes',
          'POST /companies/:id/conciliacion/match',
        ],
      },
      {
        label: 'Cuadre de bancos',
        slug: 'cuadre-bancos',
        description: 'Verificación de saldos contables contra saldos reales.',
        implemented: false,
        endpoints: ['GET /companies/:id/cuadre-bancos'],
      },
    ],
  },
  {
    title: 'Fiscalidad',
    items: [
      {
        label: 'Impuestos',
        slug: 'impuestos',
        description: 'Modelos de IVA, IRPF y calendario fiscal.',
        implemented: false,
        endpoints: [
          'GET /companies/:id/tax/models',
          'GET /companies/:id/impuestos-modulo',
        ],
      },
      {
        label: 'Impuesto de Sociedades',
        slug: 'sociedades',
        description: 'Cálculo y preparación del modelo 200.',
        implemented: false,
        endpoints: ['GET /companies/:id/impuesto-sociedades'],
      },
      {
        label: 'Registro Mercantil',
        slug: 'registro-mercantil',
        description: 'Libros oficiales y cuentas anuales para depósito.',
        implemented: false,
        endpoints: ['GET /companies/:id/registro-mercantil/libros'],
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
        implemented: false,
        endpoints: ['GET /companies/:id/reports/:tipo'],
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
