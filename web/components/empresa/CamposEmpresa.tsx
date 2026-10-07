'use client';

/**
 * Campos de los datos de una empresa (los que salen en sus facturas): los usa
 * la pantalla "Datos de la empresa" para editarlos y el panel de Administracion
 * para pedirlos en el alta. Las etiquetas y lo obligatorio cambian con el pais,
 * igual que en el backend (legalConfig.service: camposPendientesEmpresa):
 * - Espana: NIF, provincia y CP de 5 cifras; las SA, SL y SLU, ademas, su
 *   inscripcion en el Registro Mercantil.
 * - Otro pais: identificacion fiscal libre, region opcional y, si su factura
 *   lo pide, datos registrales en texto libre.
 */

export interface DatosEmpresa {
  denominacion: string;
  tipoSociedad: string;
  nif: string;
  domicilioSocial: string;
  codigoPostal: string;
  municipio: string;
  provincia: string;
  telefono: string;
  email: string;
  web: string;
  registroMercantilProvincia: string;
  registroTomo: string;
  registroFolio: string;
  registroHoja: string;
  registroInscripcion: string;
  pais: string;
  datosRegistrales: string;
}

export type CampoEmpresa = keyof DatosEmpresa;
export type ErroresEmpresa = Partial<Record<CampoEmpresa, string>>;

export const DATOS_EMPRESA_VACIOS: DatosEmpresa = {
  denominacion: '',
  tipoSociedad: 'SL',
  nif: '',
  domicilioSocial: '',
  codigoPostal: '',
  municipio: '',
  provincia: '',
  telefono: '',
  email: '',
  web: '',
  registroMercantilProvincia: '',
  registroTomo: '',
  registroFolio: '',
  registroHoja: '',
  registroInscripcion: '',
  pais: 'ES',
  datosRegistrales: '',
};

/** Orden en el que aparecen los campos (para llevar el foco al primer error). */
export const CAMPOS_EMPRESA: CampoEmpresa[] = [
  'denominacion',
  'tipoSociedad',
  'pais',
  'nif',
  'domicilioSocial',
  'codigoPostal',
  'municipio',
  'provincia',
  'telefono',
  'email',
  'web',
  'registroMercantilProvincia',
  'registroTomo',
  'registroFolio',
  'registroHoja',
  'registroInscripcion',
  'datosRegistrales',
];

const CAMPOS_REGISTRO: CampoEmpresa[] = ['registroMercantilProvincia', 'registroTomo', 'registroFolio', 'registroHoja', 'registroInscripcion'];

// Los mas habituales; cualquier otro con su codigo ISO de dos letras.
export const PAISES = [
  ['ES', 'España'],
  ['MA', 'Marruecos'],
  ['PT', 'Portugal'],
  ['FR', 'Francia'],
  ['IT', 'Italia'],
  ['DE', 'Alemania'],
  ['GB', 'Reino Unido'],
  ['US', 'Estados Unidos'],
  ['HK', 'Hong Kong'],
  ['MX', 'México'],
  ['AR', 'Argentina'],
  ['CO', 'Colombia'],
  ['CL', 'Chile'],
] as const;

export const FORMAS = [
  ['SL', 'Sociedad limitada (S.L.)'],
  ['SLU', 'Sociedad limitada unipersonal (S.L.U.)'],
  ['SA', 'Sociedad anónima (S.A.)'],
  ['AUTONOMO', 'Autónomo (empresario individual)'],
  ['SCP', 'Sociedad civil'],
  ['OTRA', 'Otra'],
] as const;

/** Formas que se inscriben en el Registro Mercantil. */
export const INSCRIBIBLES = ['SL', 'SLU', 'SA'];

export const esEspanola = (d: DatosEmpresa) => d.pais === 'ES';
export const esInscribible = (d: DatosEmpresa) => esEspanola(d) && INSCRIBIBLES.includes(d.tipoSociedad);
export const nombrePais = (codigo: string) => PAISES.find(([c]) => c === codigo)?.[1] ?? codigo;

/**
 * Comprobaciones rapidas antes de dar de alta una empresa (lo minimo para
 * facturar). El servidor lo vuelve a validar todo, el NIF con su caracter de
 * control incluido, y si algo no le cuadra dice que campo es.
 */
export function revisarDatosEmpresa(d: DatosEmpresa): ErroresEmpresa {
  const e: ErroresEmpresa = {};
  const espana = esEspanola(d);
  const vacio = (k: CampoEmpresa) => !d[k].trim();
  if (vacio('denominacion')) e.denominacion = 'Escribe la denominación o el nombre completo.';
  if (!/^[A-Za-z]{2}$/.test(d.pais.trim())) e.pais = 'Elige el país o escribe su código de dos letras.';
  if (vacio('nif')) e.nif = espana ? 'Falta el NIF.' : 'Falta la identificación fiscal.';
  if (vacio('domicilioSocial')) e.domicilioSocial = 'Falta el domicilio.';
  if (vacio('codigoPostal')) e.codigoPostal = 'Falta el código postal.';
  else if (espana && !/^\d{5}$/.test(d.codigoPostal.trim())) e.codigoPostal = 'En España el código postal tiene 5 cifras.';
  if (vacio('municipio')) e.municipio = 'Falta el municipio.';
  if (espana && vacio('provincia')) e.provincia = 'Falta la provincia.';
  if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = 'El email no es válido.';
  return e;
}

/** Primer campo con error, en el orden del formulario. */
export const primerCampoConError = (errores: ErroresEmpresa) => CAMPOS_EMPRESA.find((k) => errores[k]);

/**
 * Solo lo que aplica a la empresa segun su pais y su forma: sin el Registro
 * Mercantil si no se inscribe, sin datos registrales libres si es espanola, y
 * sin espacios sobrantes.
 */
export function datosParaGuardar(d: DatosEmpresa): Partial<DatosEmpresa> {
  const limpio: Partial<DatosEmpresa> = {};
  for (const k of CAMPOS_EMPRESA) {
    if (!esInscribible(d) && CAMPOS_REGISTRO.includes(k)) continue;
    if (esEspanola(d) && k === 'datosRegistrales') continue;
    limpio[k] = d[k].trim();
  }
  return limpio;
}

const CLASE_BASE =
  'mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-1 disabled:bg-slate-50';
// Con error, ademas del borde, un anillo: en modo noche el borde de los campos
// lo fija globals.css y el anillo es lo que se sigue viendo.
const claseCampo = (error?: string) =>
  `${CLASE_BASE} ${error ? 'border-rose-500 ring-1 ring-rose-500 focus:border-rose-500 focus:ring-rose-500' : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500'}`;

function Etiqueta({ htmlFor, children, obligatorio }: { htmlFor: string; children: React.ReactNode; obligatorio?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
      {children}
      {obligatorio && <span className="text-red-600"> *</span>}
    </label>
  );
}

function AyudaYError({ id, ayuda, error }: { id: string; ayuda?: string; error?: string }) {
  return (
    <>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-rose-700">
          {error}
        </p>
      )}
      {ayuda && !error && (
        <p id={`${id}-ayuda`} className="mt-1 text-xs text-slate-500">
          {ayuda}
        </p>
      )}
    </>
  );
}

const describir = (id: string, ayuda?: string, error?: string) => (error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined);

export function Campo({
  id,
  label,
  valor,
  onChange,
  obligatorio,
  ayuda,
  error,
  tipo = 'text',
  className = '',
  disabled,
  maxLength = 191,
  inputMode,
  autoComplete = 'off',
  placeholder,
}: {
  id: string;
  label: string;
  valor: string;
  onChange: (v: string) => void;
  obligatorio?: boolean;
  ayuda?: string;
  error?: string;
  tipo?: string;
  className?: string;
  disabled?: boolean;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <Etiqueta htmlFor={id} obligatorio={obligatorio}>
        {label}
      </Etiqueta>
      <input
        id={id}
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={claseCampo(error)}
        disabled={disabled}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describir(id, ayuda, error)}
      />
      <AyudaYError id={id} ayuda={ayuda} error={error} />
    </div>
  );
}

function Seccion({
  titulo,
  numero,
  descripcion,
  extra,
  variante,
  children,
}: {
  titulo: string;
  numero?: number;
  descripcion?: React.ReactNode;
  extra?: React.ReactNode;
  variante: 'tarjetas' | 'llano';
  children: React.ReactNode;
}) {
  const Titulo = variante === 'tarjetas' ? 'h2' : 'h3';
  return (
    <section
      className={
        variante === 'tarjetas'
          ? 'space-y-4 rounded-xl border border-slate-200 bg-white p-5'
          : 'space-y-3 border-t border-slate-200 pt-4 first:border-t-0 first:pt-0'
      }
    >
      <div>
        <Titulo className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
          {numero !== undefined && (
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">
              {numero}
            </span>
          )}
          {titulo}
          {extra}
        </Titulo>
        {descripcion && <p className="mt-1 text-xs text-slate-500">{descripcion}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Las secciones de datos de la empresa: Identificacion, Domicilio, Contacto y,
 * segun el pais y la forma, Registro Mercantil o datos registrales.
 *
 * - `alta`: numera las secciones como pasos, explica el NIF y deja el Registro
 *   Mercantil como opcional ("puedes anadirlo despues").
 * - `variante`: 'tarjetas' (pantalla completa) o 'llano' (dentro de un modal).
 * - `prefijoId`: para que los id no choquen si hay mas de un formulario.
 */
export function CamposEmpresa({
  datos,
  onCambio,
  errores = {},
  disabled,
  alta = false,
  variante = 'tarjetas',
  prefijoId = '',
}: {
  datos: DatosEmpresa;
  onCambio: (campo: CampoEmpresa, valor: string) => void;
  errores?: ErroresEmpresa;
  disabled?: boolean;
  alta?: boolean;
  variante?: 'tarjetas' | 'llano';
  prefijoId?: string;
}) {
  const espana = esEspanola(datos);
  const inscribible = esInscribible(datos);
  const paisEnLista = PAISES.some(([c]) => c === datos.pais);
  const id = (k: string) => `${prefijoId}${k}`;
  const s = (k: CampoEmpresa) => (v: string) => onCambio(k, v);
  const c = (k: CampoEmpresa) => ({ id: id(k), valor: datos[k], onChange: s(k), error: errores[k], disabled });
  const n = (i: number) => (alta ? i : undefined);

  return (
    <>
      <Seccion titulo="Identificación" numero={n(1)} variante={variante}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <Campo
            {...c('denominacion')}
            label="Denominación o nombre completo"
            obligatorio
            className="md:col-span-4"
            autoComplete="organization"
            ayuda="Razón social tal como figura en el Registro (p. ej. Ifeval Sport, S.L.) o nombre y apellidos si eres autónomo."
          />
          <div className="min-w-0 md:col-span-2">
            <Etiqueta htmlFor={id('tipoSociedad')} obligatorio>
              Forma jurídica
            </Etiqueta>
            <select
              id={id('tipoSociedad')}
              value={datos.tipoSociedad}
              onChange={(e) => onCambio('tipoSociedad', e.target.value)}
              className={claseCampo(errores.tipoSociedad)}
              disabled={disabled}
              aria-invalid={errores.tipoSociedad ? true : undefined}
              aria-describedby={describir(id('tipoSociedad'), undefined, errores.tipoSociedad)}
            >
              {FORMAS.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
            <AyudaYError id={id('tipoSociedad')} error={errores.tipoSociedad} />
          </div>
          <div className="min-w-0 md:col-span-3">
            <Etiqueta htmlFor={id('pais')} obligatorio>
              País
            </Etiqueta>
            <select
              id={id('pais')}
              value={paisEnLista ? datos.pais : 'OTRO'}
              onChange={(e) => onCambio('pais', e.target.value === 'OTRO' ? '' : e.target.value)}
              className={claseCampo(errores.pais)}
              disabled={disabled}
              aria-invalid={errores.pais ? true : undefined}
              aria-describedby={describir(id('pais'), undefined, errores.pais)}
            >
              {PAISES.map(([codigo, nombre]) => (
                <option key={codigo} value={codigo}>
                  {nombre}
                </option>
              ))}
              <option value="OTRO">Otro país…</option>
            </select>
            {!paisEnLista && (
              <input
                id={id('pais-otro')}
                aria-label="Código del país"
                placeholder="Código de 2 letras (p. ej. BE)"
                maxLength={2}
                value={datos.pais}
                onChange={(e) => onCambio('pais', e.target.value.toUpperCase())}
                className={claseCampo(errores.pais)}
                disabled={disabled}
                autoComplete="off"
              />
            )}
            <AyudaYError
              id={id('pais')}
              error={errores.pais}
              ayuda={alta ? (espana ? 'En España se pide NIF, provincia y, a las sociedades, el Registro Mercantil.' : 'Fuera de España no se aplican los requisitos españoles (NIF, provincia, Registro Mercantil).') : undefined}
            />
          </div>
          <Campo
            {...c('nif')}
            label={espana ? 'NIF' : 'Identificación fiscal'}
            obligatorio
            className="md:col-span-3"
            ayuda={
              espana
                ? alta
                  ? 'Con su letra o dígito de control (p. ej. B12345674). Se comprueba al crear la empresa.'
                  : undefined
                : 'El número fiscal de tu país (p. ej. ICE o IF en Marruecos, EIN en EE. UU.).'
            }
          />
        </div>
      </Seccion>

      <Seccion titulo="Domicilio" numero={n(2)} variante={variante}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-6">
          <Campo {...c('domicilioSocial')} label="Domicilio" obligatorio className="sm:col-span-2 md:col-span-6" autoComplete="street-address" ayuda="Calle, número, piso y puerta." />
          <Campo
            {...c('codigoPostal')}
            label="Código postal"
            obligatorio
            className="md:col-span-2"
            inputMode={espana ? 'numeric' : undefined}
            maxLength={espana ? 5 : 20}
            autoComplete="postal-code"
          />
          <Campo {...c('municipio')} label="Municipio" obligatorio className="md:col-span-2" autoComplete="address-level2" />
          <Campo
            {...c('provincia')}
            label={espana ? 'Provincia' : 'Región o estado'}
            obligatorio={espana}
            className="sm:col-span-2 md:col-span-2"
            autoComplete="address-level1"
          />
        </div>
      </Seccion>

      <Seccion titulo="Contacto" numero={n(3)} descripcion={alta ? 'Opcional. Sale en las facturas si lo rellenas.' : undefined} variante={variante}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Campo {...c('telefono')} label="Teléfono" tipo="tel" inputMode="tel" maxLength={30} />
          <Campo {...c('email')} label="Email" tipo="email" />
          <Campo {...c('web')} label="Web" inputMode="url" placeholder="www.empresa.es" />
        </div>
      </Seccion>

      {inscribible && (
        <Seccion
          titulo="Inscripción en el Registro Mercantil"
          numero={n(4)}
          variante={variante}
          extra={
            alta ? (
              <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                Opcional ahora
              </span>
            ) : undefined
          }
          descripcion={
            alta
              ? 'Puedes añadirlo después desde «Datos de la empresa»; hasta entonces la app te lo recordará. Sale al pie de las facturas y lo encontrarás en la escritura de constitución o en una nota simple del Registro.'
              : 'Obligatoria en las sociedades. Sale al pie de las facturas en letra pequeña. La encontrarás en la escritura de constitución o en una nota simple del Registro.'
          }
        >
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Campo {...c('registroMercantilProvincia')} label="Registro Mercantil de" obligatorio={!alta} className="col-span-2 md:col-span-1" ayuda="Provincia, p. ej. Valencia" />
            <Campo {...c('registroTomo')} label="Tomo" obligatorio={!alta} />
            <Campo {...c('registroFolio')} label="Folio" obligatorio={!alta} />
            <Campo {...c('registroHoja')} label="Hoja" obligatorio={!alta} ayuda="p. ej. V-123456" />
            <Campo {...c('registroInscripcion')} label="Inscripción" obligatorio={!alta} ayuda="p. ej. 1ª" />
          </div>
          {datos.registroTomo && datos.registroHoja && (
            <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              En la factura: Inscrita en el Registro Mercantil{datos.registroMercantilProvincia ? ` de ${datos.registroMercantilProvincia}` : ''}, Tomo {datos.registroTomo}
              {datos.registroFolio && `, Folio ${datos.registroFolio}`}, Hoja {datos.registroHoja}
              {datos.registroInscripcion && `, Inscripción ${datos.registroInscripcion}`}.
            </p>
          )}
        </Seccion>
      )}

      {!espana && (
        <Seccion
          titulo="Datos registrales"
          numero={n(4)}
          variante={variante}
          extra={
            alta ? (
              <span className="inline-flex items-center whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                Opcional
              </span>
            ) : undefined
          }
          descripcion="Si en tu país las facturas deben llevar datos de registro (p. ej. RC e ICE en Marruecos), escríbelos tal como tienen que aparecer. Saldrán al pie de la factura."
        >
          <textarea
            id={id('datosRegistrales')}
            aria-label="Datos registrales"
            rows={2}
            maxLength={191}
            value={datos.datosRegistrales}
            onChange={(e) => onCambio('datosRegistrales', e.target.value)}
            className={claseCampo(errores.datosRegistrales)}
            disabled={disabled}
            aria-invalid={errores.datosRegistrales ? true : undefined}
            aria-describedby={describir(id('datosRegistrales'), undefined, errores.datosRegistrales)}
          />
          <AyudaYError id={id('datosRegistrales')} error={errores.datosRegistrales} />
        </Seccion>
      )}
    </>
  );
}
